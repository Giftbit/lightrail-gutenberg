import * as awslambda from "aws-lambda";
import {SQSRecord} from "aws-lambda";
import * as logPrefix from "loglevel-plugin-prefix";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {GetSecretValueResponse} from "aws-sdk/clients/secretsmanager";
import {initializeSecretEncryptionKey} from "../rest/webhookSecretUtils";
import * as aws from "aws-sdk";
import {SqsUtils} from "../../utils/sqsUtils";
import {processEvent} from "./eventProcessor";
import {LightrailEvent} from "./model/LightrailEvent";
import {DeleteMessageError} from "./errors/DeleteMessageError";
import log = require("loglevel");

// Wrapping console.log instead of binding (default behaviour for loglevel)
// Otherwise all log calls are prefixed with the requestId from the first
// request the lambda received (AWS modifies log calls, loglevel binds to the
// version of console.log that exists when it is initialized).
// See https://github.com/pimterry/loglevel/blob/master/lib/loglevel.js
// tslint:disable-next-line:no-console
log.methodFactory = () => (...args) => console.log(...args);

// Prefix log messages with the level.
logPrefix.reg(log);
logPrefix.apply(log, {
    format: (level, name, timestamp) => {
        return `[${level}]`;
    },
});

// Set the log level when running in Lambda.
log.setLevel(log.levels.INFO);

const errorMessageToPreventSQSDeletions = "Intentional error to prevent automatic SQS deletions.";
const secretsManager = new aws.SecretsManager();
const secretEncryptionKey: Promise<GetSecretValueResponse> = secretsManager.getSecretValue({SecretId: process.env["SECRET_ENCRYPTION_KEY"]}).promise();
initializeSecretEncryptionKey(secretEncryptionKey);

/**
 * Triggered by SQS.
 */
async function handleSqsMessages(evt: awslambda.SQSEvent, ctx: awslambda.Context): Promise<any> {
    const recordsToNotDelete: SQSRecord[] = [];
    for (const record of evt.Records) {
        const sentTimestamp = parseInt(record.attributes.SentTimestamp);
        try {
            const event: LightrailEvent = LightrailEvent.parseFromSQSRecord(record);
            const result = await processEvent(event, sentTimestamp);

            if (result.action === "DELETE") {
                await SqsUtils.deleteMessage(record);

            } else if (result.action === "BACKOFF") {
                await SqsUtils.backoffMessage(record);
                recordsToNotDelete.push(record);

            } else if (result.action === "REQUEUE") {
                await SqsUtils.sendMessage(result.newMessage);
                await SqsUtils.deleteMessage(record);
            }
        } catch (e) {
            if (e instanceof DeleteMessageError) {
                log.error(`DeleteMessageError thrown.`, e);
                await SqsUtils.deleteMessage(record);
            } else {
                log.error(`An unexpected error occurred while processing event: ${JSON.stringify(e)}`);
                // An unexpected error occurred. Will backoff to a maximum of 12 hours.
                // Won't delete the message off the queue after 3 days because this represents
                // an unexpected failure on our side. The message will be retried for up to 7 days
                // (message retention period set on queue).
                await SqsUtils.backoffMessage(record);
                recordsToNotDelete.push(record);
            }
        }
    }
    if (recordsToNotDelete.length > 0) {
        // This lambda is triggered directly by SQS. If the lambda succeeds the messages will automatically be deleted.
        // This error is thrown to prevent that automatic deletion so that the message will be processed again later.
        log.info(`Throwing intentional error to prevent records ${recordsToNotDelete.map(r => r.messageId)} from being deleted.`);
        throw new Error(errorMessageToPreventSQSDeletions);
    }
}

// Export the lambda handler with Sentry error logging supported.
export const handler = giftbitRoutes.sentry.wrapLambdaHandler({
    handler: handleSqsMessages,
    logger: log.error,
    sentryDsn: process.env["SENTRY_DSN"],
    filtersOptions: {
        ignoreErrors: [errorMessageToPreventSQSDeletions]
    }
});