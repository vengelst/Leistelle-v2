/**
 * Testet die Normalisierung von AJAX-Hub-2-(4G)-Jeweller-Ereignissen.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createAjaxHub2FourGJewellerAlarmAdapter,
  normalizeAjaxHub2FourGJewellerAlarm
} from "../modules/alarm-core/ajax-hub-2-4g-jeweller-adapter.js";

test("ajax hub adapter normalizes hub event payload into external ingestion schema", () => {
  const normalized = normalizeAjaxHub2FourGJewellerAlarm({
    sourceEventId: "AJAX-1",
    hubId: "hub-1",
    hubName: "Objekt Nord",
    eventType: "intrusion_alarm",
    eventSubType: "motion",
    eventTime: "2026-04-10T14:00:00.000Z",
    siteId: "site-1",
    deviceId: "device-1",
    detectorId: "detector-1",
    deviceName: "MotionProtect Flur",
    room: "Flur",
    group: "EG",
    user: "Leitstelle Nord",
    triggerSource: "detector",
    media: [
      {
        mediaType: "snapshot",
        url: "https://example.test/ajax-photo-1.jpg"
      }
    ]
  });

  assert.equal(normalized.sourceSystem, "ajax");
  assert.equal(normalized.sourceType, "hub");
  assert.equal(normalized.externalEventId, "AJAX-1");
  assert.equal(normalized.eventType, "motion");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.siteId, "site-1");
  assert.equal(normalized.deviceId, "device-1");
  assert.equal(normalized.cameraName, "MotionProtect Flur");
  assert.equal(normalized.media?.[0]?.mediaKind, "snapshot");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["adapter"], "ajax-hub-2-4g-jeweller");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["detectorId"], "detector-1");
});

test("ajax hub adapter maps sabotage and technical events explicitly", () => {
  const sabotage = normalizeAjaxHub2FourGJewellerAlarm({
    sourceEventId: "AJAX-2",
    eventType: "tamper_alarm",
    eventTime: "2026-04-10T14:05:00.000Z",
    hubName: "Objekt Nord"
  });
  const technical = normalizeAjaxHub2FourGJewellerAlarm({
    sourceEventId: "AJAX-3",
    eventType: "connection_lost",
    eventTime: "2026-04-10T14:06:00.000Z",
    hubName: "Objekt Nord"
  });

  assert.equal(sabotage.eventType, "sabotage");
  assert.equal(sabotage.severity, "critical");
  assert.equal(technical.eventType, "technical");
  assert.equal(technical.severity, "normal");
});

test("ajax hub adapter delegates normalized payload to external ingestion", async () => {
  let delegatedPayload: any;

  const adapter = createAjaxHub2FourGJewellerAlarmAdapter({
    externalAlarmIngestion: {
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
            receivedAt: "2026-04-10T14:00:00.000Z",
            lastEventAt: "2026-04-10T14:00:00.000Z",
            createdAt: "2026-04-10T14:00:00.000Z",
            updatedAt: "2026-04-10T14:00:00.000Z",
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
            externalEventId: "AJAX-4",
            externalSourceRef: "ajax:hub:AJAX-4",
            siteId: "site-1",
            primaryDeviceId: "device-1"
          }
        };
      }
    }
  });

  const result = await adapter.ingest({
    sourceEventId: "AJAX-4",
    eventType: "intrusion_alarm",
    eventTime: "2026-04-10T14:10:00.000Z",
    siteId: "site-1",
    deviceId: "device-1",
    deviceName: "DoorProtect Eingang"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "AJAX-4");
  assert.equal(delegatedPayload.payload.eventType, "motion");
  assert.equal(delegatedPayload.payload.sourceType, "hub");
  assert.equal(delegatedPayload.payload.deviceId, "device-1");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});