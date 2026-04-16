/**
 * Testet die Normalisierung von AJAX-NVR-8CH-Ereignissen.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createAjaxNvr8chAlarmAdapter, normalizeAjaxNvr8chAlarm } from "../modules/alarm-core/ajax-nvr-8ch-adapter.js";

test("ajax nvr 8ch adapter normalizes recorder payload into external ingestion schema", () => {
  const normalized = normalizeAjaxNvr8chAlarm({
    sourceEventId: "AJAX-NVR-1",
    eventCode: "LineCrossing",
    eventTime: "2026-04-10T16:00:00.000Z",
    cameraSerialNumber: "CAM-1",
    nvrIp: "10.0.0.50",
    channel: 4,
    cameraName: "Pier Kamera 1",
    severity: "2",
    ruleName: "Kai Nord",
    zone: "pier-north",
    media: [
      {
        mediaType: "snapshot",
        url: "https://example.test/ajax-nvr-snapshot.jpg",
        cameraIp: "10.0.0.21"
      },
      {
        mediaType: "archive_reference",
        url: "https://example.test/archive/segment-1",
        metadata: {
          playbackWindow: "30s"
        }
      }
    ]
  });

  assert.equal(normalized.sourceSystem, "ajax");
  assert.equal(normalized.sourceType, "nvr");
  assert.equal(normalized.externalEventId, "AJAX-NVR-1");
  assert.equal(normalized.eventType, "line_crossing");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.deviceSerialNumber, "CAM-1");
  assert.equal(normalized.title, "Ajax NVR Pier Kamera 1 | Line Crossing");
  assert.match(normalized.description ?? "", /Kai Nord/);
  assert.equal(normalized.media?.[0]?.storageKey, "https://example.test/ajax-nvr-snapshot.jpg");
  assert.equal(normalized.media?.[0]?.deviceNetworkAddress, "10.0.0.21");
  assert.equal(normalized.media?.[1]?.mediaKind, "document");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["adapter"], "ajax-nvr-8ch");
});

test("ajax nvr 8ch adapter keeps unknown event codes transparent", () => {
  const normalized = normalizeAjaxNvr8chAlarm({
    sourceEventId: "AJAX-NVR-2",
    eventCode: "SceneAnalyticsAlarm",
    eventTime: "2026-04-10T16:05:00.000Z",
    nvrSerialNumber: "NVR-1"
  });

  assert.equal(normalized.eventType, "scene_analytics_alarm");
  assert.equal(normalized.deviceSerialNumber, "NVR-1");
  assert.equal(normalized.title, "Ajax NVR SceneAnalyticsAlarm | Scene Analytics Alarm");
});

test("ajax nvr 8ch adapter delegates normalized payload to external ingestion", async () => {
  let delegatedPayload: any;

  const adapter = createAjaxNvr8chAlarmAdapter({
    externalAlarmIngestion: {
      ingest: async (payload: any, _requestId: string, providedSharedSecret?: string) => {
        delegatedPayload = { payload, providedSharedSecret };
        return {
          alarmCase: {
            id: "alarm-1",
            siteId: "site-1",
            alarmType: "video_loss",
            priority: "critical",
            priorityRank: 3,
            lifecycleStatus: "received",
            assessmentStatus: "pending",
            technicalState: "complete",
            title: "Ajax NVR Recorder | Video Loss",
            receivedAt: "2026-04-10T16:00:00.000Z",
            lastEventAt: "2026-04-10T16:00:00.000Z",
            createdAt: "2026-04-10T16:00:00.000Z",
            updatedAt: "2026-04-10T16:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false,
          duplicate: false,
          resolution: {
            sourceSystem: "ajax",
            sourceType: "nvr",
            externalEventId: "AJAX-NVR-3",
            externalSourceRef: "ajax:nvr:AJAX-NVR-3",
            siteId: "site-1"
          }
        };
      }
    }
  });

  const result = await adapter.ingest({
    sourceEventId: "AJAX-NVR-3",
    eventCode: "VideoLoss",
    eventTime: "2026-04-10T16:10:00.000Z",
    siteId: "site-1",
    nvrSerialNumber: "NVR-1",
    severity: "major"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "AJAX-NVR-3");
  assert.equal(delegatedPayload.payload.eventType, "video_loss");
  assert.equal(delegatedPayload.payload.severity, "critical");
  assert.equal(delegatedPayload.payload.deviceSerialNumber, "NVR-1");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});