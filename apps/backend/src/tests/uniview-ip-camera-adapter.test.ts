import assert from "node:assert/strict";
import test from "node:test";

import {
  createUniviewIpCameraAlarmAdapter,
  normalizeUniviewIpCameraAlarm
} from "../modules/alarm-core/uniview-ip-camera-adapter.js";

test("uniview ip camera adapter normalizes camera analytics payload into external ingestion schema", () => {
  const normalized = normalizeUniviewIpCameraAlarm({
    sourceEventId: "UNV-CAM-1",
    eventCode: "CrossLineDetection",
    eventType: "LineCrossing",
    eventTime: "2026-04-10T22:00:00.000Z",
    cameraSerialNumber: "AX-1468-001",
    cameraIp: "10.12.0.21",
    cameraName: "Yard Kamera 1",
    severity: "2",
    zone: "yard-entry",
    ruleName: "Nordtor Linie",
    analyticsName: "Cross Line Detection",
    media: [
      {
        mediaType: "snapshot",
        url: "https://example.test/uniview-camera-snapshot.jpg",
        cameraIp: "10.12.0.21"
      }
    ]
  });

  assert.equal(normalized.sourceSystem, "uniview");
  assert.equal(normalized.sourceType, "camera");
  assert.equal(normalized.externalEventId, "UNV-CAM-1");
  assert.equal(normalized.eventType, "line_crossing");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.deviceSerialNumber, "AX-1468-001");
  assert.equal(normalized.title, "Uniview Camera Yard Kamera 1 | Line Crossing");
  assert.match(normalized.description ?? "", /Nordtor Linie/);
  assert.equal(normalized.media?.[0]?.storageKey, "https://example.test/uniview-camera-snapshot.jpg");
  assert.equal(normalized.media?.[0]?.deviceNetworkAddress, "10.12.0.21");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["adapter"], "uniview-ip-camera");
});

test("uniview ip camera adapter keeps unknown analytics events transparent", () => {
  const normalized = normalizeUniviewIpCameraAlarm({
    sourceEventId: "UNV-CAM-2",
    eventCode: "ObjectLeftBehindStart",
    eventTime: "2026-04-10T22:05:00.000Z",
    cameraSerialNumber: "AX-1468-001"
  });

  assert.equal(normalized.eventType, "object_left_behind_start");
  assert.equal(normalized.deviceSerialNumber, "AX-1468-001");
  assert.equal(normalized.title, "Uniview Camera ObjectLeftBehindStart | Object Left Behind Start");
});

test("uniview ip camera adapter maps expected unv alias event forms", () => {
  assert.equal(
    normalizeUniviewIpCameraAlarm({
      sourceEventId: "UNV-CAM-ALIAS-1",
      eventCode: "line_crossing",
      eventTime: "2026-04-10T22:06:00.000Z",
      cameraSerialNumber: "AX-1468-001"
    }).eventType,
    "line_crossing"
  );
  assert.equal(
    normalizeUniviewIpCameraAlarm({
      sourceEventId: "UNV-CAM-ALIAS-2",
      eventCode: "regionalIntrusion",
      eventTime: "2026-04-10T22:06:10.000Z",
      cameraSerialNumber: "AX-1468-001"
    }).eventType,
    "area_entry"
  );
  assert.equal(
    normalizeUniviewIpCameraAlarm({
      sourceEventId: "UNV-CAM-ALIAS-3",
      eventCode: "coverAlarm",
      eventTime: "2026-04-10T22:06:20.000Z",
      cameraSerialNumber: "AX-1468-001"
    }).eventType,
    "sabotage"
  );
  assert.equal(
    normalizeUniviewIpCameraAlarm({
      sourceEventId: "UNV-CAM-ALIAS-4",
      eventCode: "deviceOffline",
      eventTime: "2026-04-10T22:06:30.000Z",
      cameraSerialNumber: "AX-1468-001"
    }).eventType,
    "camera_offline"
  );
});

test("uniview ip camera adapter delegates normalized payload to external ingestion", async () => {
  let delegatedPayload: any;

  const adapter = createUniviewIpCameraAlarmAdapter({
    externalAlarmIngestion: {
      ingest: async (payload: any, _requestId: string, providedSharedSecret?: string) => {
        delegatedPayload = { payload, providedSharedSecret };
        return {
          alarmCase: {
            id: "alarm-1",
            siteId: "site-1",
            alarmType: "motion",
            priority: "critical",
            priorityRank: 3,
            lifecycleStatus: "received",
            assessmentStatus: "pending",
            technicalState: "complete",
            title: "Uniview Camera Yard Kamera 1 | Motion",
            receivedAt: "2026-04-10T22:00:00.000Z",
            lastEventAt: "2026-04-10T22:00:00.000Z",
            createdAt: "2026-04-10T22:00:00.000Z",
            updatedAt: "2026-04-10T22:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false,
          duplicate: false,
          resolution: {
            sourceSystem: "uniview",
            sourceType: "camera",
            externalEventId: "UNV-CAM-3",
            externalSourceRef: "uniview:camera:UNV-CAM-3",
            siteId: "site-1"
          }
        };
      }
    }
  });

  const result = await adapter.ingest({
    sourceEventId: "UNV-CAM-3",
    eventCode: "VideoMotion",
    eventTime: "2026-04-10T22:10:00.000Z",
    siteId: "site-1",
    cameraSerialNumber: "AX-1468-001",
    severity: "major"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "UNV-CAM-3");
  assert.equal(delegatedPayload.payload.eventType, "motion");
  assert.equal(delegatedPayload.payload.severity, "critical");
  assert.equal(delegatedPayload.payload.deviceSerialNumber, "AX-1468-001");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});

test("uniview ip camera adapter remains separate from nvr domain", () => {
  const normalized = normalizeUniviewIpCameraAlarm({
    sourceEventId: "UNV-CAM-4",
    eventCode: "networkDisconnected",
    eventTime: "2026-04-10T22:15:00.000Z",
    cameraSerialNumber: "AX-1468-001"
  });

  assert.equal(normalized.sourceType, "camera");
  assert.notEqual(normalized.sourceType, "nvr");
});
