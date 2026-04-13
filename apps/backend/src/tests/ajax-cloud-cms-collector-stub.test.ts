import assert from "node:assert/strict";
import test from "node:test";

import {
  createAjaxCloudCmsCollectorStub,
  normalizeAjaxCloudCmsCollectorStub
} from "../modules/alarm-core/ajax-cloud-cms-collector-stub.js";

test("ajax cloud cms collector stub performs only thin translation to ajax hub adapter schema", () => {
  const normalized = normalizeAjaxCloudCmsCollectorStub({
    sourceEventId: "CMS-1",
    collectorSource: "cms",
    hubId: "hub-1",
    hubName: "Objekt Nord",
    eventType: "intrusion_alarm",
    eventSubType: "motion",
    occurredAt: "2026-04-10T15:00:00.000Z",
    siteId: "site-1",
    deviceId: "device-1",
    detectorId: "detector-1",
    deviceName: "MotionProtect Flur",
    media: [
      {
        mediaType: "snapshot",
        uri: "https://example.test/ajax-photo-1.jpg"
      }
    ],
    rawPayload: {
      upstreamEvent: "event-1"
    }
  });

  assert.equal(normalized.sourceEventId, "CMS-1");
  assert.equal(normalized.eventType, "intrusion_alarm");
  assert.equal(normalized.eventSubType, "motion");
  assert.equal(normalized.eventTime, "2026-04-10T15:00:00.000Z");
  assert.equal(normalized.deviceId, "device-1");
  assert.equal(normalized.media?.[0]?.url, "https://example.test/ajax-photo-1.jpg");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["collectorStub"], "ajax-cloud-cms");
});

test("ajax cloud cms collector stub delegates shared secret and payload to ajax hub adapter", async () => {
  let delegatedPayload: any;

  const stub = createAjaxCloudCmsCollectorStub({
    ajaxHubAlarmAdapter: {
      ingest: async (payload: any, _requestId: string, providedSharedSecret?: string) => {
        delegatedPayload = { payload, providedSharedSecret };
        return {
          alarmCase: {
            id: "alarm-1",
            siteId: "site-1",
            alarmType: "motion",
            priority: "high",
            priorityRank: 2,
            lifecycleStatus: "received",
            assessmentStatus: "pending",
            technicalState: "complete",
            title: "Ajax detector | Motion",
            receivedAt: "2026-04-10T15:00:00.000Z",
            lastEventAt: "2026-04-10T15:00:00.000Z",
            createdAt: "2026-04-10T15:00:00.000Z",
            updatedAt: "2026-04-10T15:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false,
          duplicate: false,
          resolution: {
            sourceSystem: "ajax",
            sourceType: "hub",
            externalEventId: "CMS-2",
            externalSourceRef: "ajax:hub:CMS-2",
            siteId: "site-1",
            primaryDeviceId: "device-1"
          }
        };
      }
    }
  });

  const result = await stub.ingest({
    sourceEventId: "CMS-2",
    collectorSource: "cloud_signaling",
    eventType: "connection_lost",
    occurredAt: "2026-04-10T15:05:00.000Z",
    siteId: "site-1",
    deviceId: "device-1"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "CMS-2");
  assert.equal(delegatedPayload.payload.eventType, "connection_lost");
  assert.equal(delegatedPayload.payload.eventTime, "2026-04-10T15:05:00.000Z");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});
