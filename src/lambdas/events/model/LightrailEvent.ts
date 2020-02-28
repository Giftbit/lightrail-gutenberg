import * as awslambda from "aws-lambda";
import {SendMessageRequest} from "aws-sdk/clients/sqs";
import {DeleteMessageError} from "../errors/DeleteMessageError";

/**
 * Events that happened in the Lightrail system.  Multiple microservices
 * may generate events and multiple microservices may subscribe to them.
 *
 * This interface is based upon the CloudEvents spec under the hope there could
 * be benefits from compatible tooling.
 * @see https://github.com/cloudevents/spec
 */
export interface LightrailEvent {
    /**
     * The version of the CloudEvents specification which the event uses.
     */
    specVersion: "1.0";

    /**
     * Dot-separated namespace of the event type.
     * eg: `lightrail.transaction.created`
     *
     * Naming guideline:
     * - Do start with `lightrail` unless the event was generated by another system
     *    and we're simply passing it along (eg `stripe`).
     * - Do use the verb tense for events that are starting.
     * - Do use the past tense for events that have completed.
     * - Do use use CRUDL language (created, updated, deleted) where possible.
     * - Don't use the name of the internal service in the event name.  That's an
     *    implementation detail that may change with rearchitecting.
     * - Don't start with `com` despite what the CloudEvents spec says.  Nobody
     *    liked it when Java did it.  Why can't we learn from our mistakes?
     */
    type: string;

    /**
     * The service that generated the event formatted as a URI-reference.
     * eg: `/lightrail/rothschild`
     */
    source: string;

    /**
     * The ID of the event.  The combination of `source` + `id` must be unique.
     */
    id: string;

    /**
     * The ISO-8601 date of when the event was generated.
     */
    time: Date | string;

    /**
     * The Lightrail userId of the user that generated the event (if any).
     *
     * Why not `userId`?  Per the CloudEvents spec: CloudEvents attribute names
     * MUST consist of lower-case letters ('a' to 'z') or digits ('0' to '9') from
     * the ASCII character set.
     */
    userId?: string;

    /**
     * MIME type of the event data.  Currently we're only doing JSON payloads
     * but there may be use cases for other in the future.
     */
    dataContentType: "application/json";

    /**
     * The event body.  The shape is entirely dependent upon the type of the event.
     * Breaking changes are a big deal and need to be coordinated.  Adding new properties
     * is not a breaking change.
     */
    data: any;

    /**
     * If the event has to be re-queued after some successful and unsuccessful callbacks
     * this list will allow the webhook to know which webhooks it doesn't need to
     * call again.
     */
    deliveredWebhookIds?: string[];
}


export namespace LightrailEvent {
    export function toPublicFacingEvent(event: LightrailEvent): LightrailPublicFacingEvent {
        return {
            id: event.id,
            type: event.type,
            time: event.time,
            data: event.data
        };
    }

    export function parseFromSQSRecord(record: awslambda.SQSRecord): LightrailEvent {
        try {
            return {
                specVersion: record.messageAttributes["specversion"]?.stringValue as "1.0",
                type: record.messageAttributes["type"]?.stringValue,
                source: record.messageAttributes["source"]?.stringValue,
                id: record.messageAttributes["id"]?.stringValue,
                time: record.messageAttributes["time"]?.stringValue,
                userId: record.messageAttributes["userid"]?.stringValue,
                dataContentType: record.messageAttributes["datacontenttype"]?.stringValue as "application/json",
                deliveredWebhookIds: record.messageAttributes["deliveredwebhookids"] ? JSON.parse(record.messageAttributes["deliveredwebhookids"].stringValue) : [],
                data: JSON.parse(record.body)
            };
        } catch (e) {
            throw new DeleteMessageError(`Error parsing record: ${JSON.stringify(record)}.`);
        }
    }

    export function toSQSSendMessageRequest(event: LightrailEvent, delaySeconds: number = 0): SendMessageRequest {
        return {
            MessageAttributes: {
                type: {DataType: "String", StringValue: event.type},
                source: {DataType: "String", StringValue: event.source},
                id: {DataType: "String", StringValue: event.id},
                time: {DataType: "String", StringValue: event.time.toString()},
                datacontenttype: {DataType: "String", StringValue: event.dataContentType},
                userid: {DataType: "String", StringValue: event.userId},
                deliveredwebhookids: {
                    DataType: "String",
                    StringValue: JSON.stringify((event.deliveredWebhookIds ? event.deliveredWebhookIds : []))
                }
            },
            MessageBody: JSON.stringify(event.data),
            QueueUrl: process.env["EVENT_QUEUE"],
            DelaySeconds: delaySeconds
        };
    }
}

export interface LightrailPublicFacingEvent {
    id: string;
    type: string;
    time: Date | string;
    data: any;
}