/**
 * Testet die Normalisierung von Grundig-GU-RN-AC5104N-Recorder-Ereignissen.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createGrundigGuRnAc5104nAlarmAdapter,
  normalizeGrundigGuRnAc5104nAlarm
} from "../modules/alarm-core/grundig-gu-rn-ac5104n-adapter.js";

test("grundig adapter normalizes recorder payload into external ingestion schema", () => {
  const normalized = normalizeGrundigGuRnAc5104nAlarm({
    sourceEventId: "GRUNDIG-1",
    eventCode: "LCD",
    eventTime: "2026-04-10T13:00:00.000Z",
    cameraSerialNumber: "CAM-1",
    recorderIp: "10.0.0.50",
    channel: 2,
    cameraName: "Tor Kamera 1",
    severity: "2",
    ruleName: "Tor Linie",
    zone: "gate-line",
    media: [
      {
        mediaType: "snapshot",
        url: "https://example.test/grundig-snapshot.jpg",
        cameraIp: "10.0.0.21"
      }
    ]
  });

  assert.equal(normalized.sourceSystem, "grundig");
  assert.equal(normalized.sourceType, "nvr");
  assert.equal(normalized.externalEventId, "GRUNDIG-1");
  assert.equal(normalized.eventType, "line_crossing");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.deviceSerialNumber, "CAM-1");
  assert.equal(normalized.title, "Grundig Tor Kamera 1 | Line Crossing");
  assert.match(normalized.description ?? "", /Tor Linie/);
  assert.equal(normalized.media?.[0]?.storageKey, "https://example.test/grundig-snapshot.jpg");
  assert.equal(normalized.media?.[0]?.deviceNetworkAddress, "10.0.0.21");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["adapter"], "grundig-gu-rn-ac5104n");
});

test("grundig adapter keeps unknown event codes transparent", () => {
  const normalized = normalizeGrundigGuRnAc5104nAlarm({
    sourceEventId: "GRUNDIG-2",
    eventCode: "HeatMap",
    eventTime: "2026-04-10T13:05:00.000Z",
    recorderSerialNumber: "NVR-1"
  });

  assert.equal(normalized.eventType, "heat_map");
  assert.equal(normalized.deviceSerialNumber, "NVR-1");
  assert.equal(normalized.title, "Grundig HeatMap | Heat Map");
});

test("grundig adapter delegates normalized payload to external ingestion", async () => {
  let delegatedPayload: any;

  const adapter = createGrundigGuRnAc5104nAlarmAdapter({
    externalAlarmIngestion: {
      ingest: async (payload: any, _requestId: string, providedSharedSecret?: string) => {
        delegatedPayload = { payload, providedSharedSecret };
        return {
          alarmCase: {
            id: "alarm-1",
            siteId: "site-1",
            alarmType: "area_entry",
            priority: "critical",
            priorityRank: 3,
            lifecycleStatus: "received",
            assessmentStatus: "pending",
            technicalState: "complete",
            title: "Grundig Cam | Area Entry",
            receivedAt: "2026-04-10T13:00:00.000Z",
            lastEventAt: "2026-04-10T13:00:00.000Z",
            createdAt: "2026-04-10T13:00:00.000Z",
            updatedAt: "2026-04-10T13:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false,
          duplicate: false,
          resolution: {
            sourceSystem: "grundig",
            sourceType: "nvr",
            externalEventId: "GRUNDIG-3",
            externalSourceRef: "grundig:nvr:GRUNDIG-3",
            siteId: "site-1"
          }
        };
      }
    }
  });

  const result = await adapter.ingest({
    sourceEventId: "GRUNDIG-3",
    eventCode: "PID",
    eventTime: "2026-04-10T13:10:00.000Z",
    siteId: "site-1",
    recorderSerialNumber: "NVR-1",
    severity: "major"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "GRUNDIG-3");
  assert.equal(delegatedPayload.payload.eventType, "area_entry");
  assert.equal(delegatedPayload.payload.severity, "critical");
  assert.equal(delegatedPayload.payload.deviceSerialNumber, "NVR-1");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});