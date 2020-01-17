import * as awslambda from "aws-lambda";
import {LightrailEvent, sqsRecordToLightrailEvent} from "./LightrailEvent";
import * as chai from "chai";
import {defaultTestUser, generateId} from "../../utils/test/testUtils";

describe.only("LightrailEvent", () => {

    it("sqsRecordToLightrailEvent", () => {
        const date = new Date("2020");
        const sqsRecord: awslambda.SQSRecord = {
            messageId: "id",
            receiptHandle: "handle",
            body: JSON.stringify({
                plane: "boeing"
            }),
            attributes: null,
            messageAttributes: {
                specversion: {
                    dataType: "String",
                    stringValue: "1.0",
                    stringListValues: null, // this property is required by SQSRecord but isn't used
                    binaryListValues: null, // same
                },
                type: {
                    dataType: "String",
                    stringValue: "plane.created",
                    stringListValues: null, // this property is required by SQSRecord but isn't used
                    binaryListValues: null, // same
                },
                source: {
                    dataType: "String",
                    stringValue: "/gutenberg/tests",
                    stringListValues: null,
                    binaryListValues: null,
                },
                id: {dataType: "String", stringValue: "123", stringListValues: null, binaryListValues: null,},
                time: {
                    dataType: "String",
                    stringValue: date.toISOString(),
                    stringListValues: null,
                    binaryListValues: null,
                },
                datacontenttype: {
                    dataType: "String",
                    stringValue: "application/json",
                    stringListValues: null,
                    binaryListValues: null,
                },
                userid: {dataType: "String", stringValue: "user-123", stringListValues: null, binaryListValues: null,}
            },
            md5OfBody: null,
            eventSource: null,
            eventSourceARN: null,
            awsRegion: null
        };

        const lrEvent: LightrailEvent = sqsRecordToLightrailEvent(sqsRecord);
        chai.assert.deepEqual(lrEvent, {
            "specversion": "1.0",
            "type": "plane.created",
            "source": "/gutenberg/tests",
            "id": "123",
            "time": "2020-01-01T00:00:00.000Z",
            "userid": "user-123",
            "datacontenttype": "application/json",
            "failedWebhookIds": [],
            "data": {"plane": "boeing"}
        });

        const sqsRecordWithDeliveredWebhookIds = {
            ...sqsRecord,
            messageAttributes: {
                ...sqsRecord.messageAttributes,
                failedWebhookIds: {
                    dataType: "String",
                    stringValue: JSON.stringify(["webhook1", "webhook2"]),
                    stringListValues: null,
                    binaryListValues: null,
                },
            }
        };
        const lrEvent2: LightrailEvent = sqsRecordToLightrailEvent(sqsRecordWithDeliveredWebhookIds);
        chai.assert.deepEqual(lrEvent2, {
            "specversion": "1.0",
            "type": "plane.created",
            "source": "/gutenberg/tests",
            "id": "123",
            "time": "2020-01-01T00:00:00.000Z",
            "userid": "user-123",
            "datacontenttype": "application/json",
            "failedWebhookIds": ["webhook1", "webhook2"],
            "data": {"plane": "boeing"}
        });

        console.log(JSON.stringify(lrEvent2));
    });

    it("toSQSSendMessageEvent", () => {
        const lightrailEvent: LightrailEvent = {
            specversion: "1.0",
            type: "gutenberg.test.airplane.created", // todo <tim> - try to pick something memorable.
            source: "/gutenberg/tests",
            id: generateId(),
            time: new Date(),
            userid: defaultTestUser.auth.userId,
            datacontenttype: "application/json",
            data: {
                simpleProp: "1",
                nested: {
                    here: "okay"
                },
                createdDate: new Date().toISOString()
            }
        };
    })
});