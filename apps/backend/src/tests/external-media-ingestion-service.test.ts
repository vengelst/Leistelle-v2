/**
 * Testet die Zuordnung und Korrelation externer Medien zu Alarmfaellen.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createExternalAlarmMediaIngestionService } from "../modules/alarm-core/external-media-ingestion-service.js";

test("external media ingestion uses vendor specific correlation tolerance override", async () => {
  const seenToleranceSeconds: number[] = [];

  const service = createExternalAlarmMediaIngestionService({
    store: {
      getVendorMediaInboxByStorageKey: async () => null,
      resolveAlarmSourceMapping: async () => ({
        mappingId: "mapping-1",
        siteId: "site-1",
        componentId: "device-1",
        matchedFields: ["externalDeviceId"]
      }),
      createVendorMediaInboxEntry: async (input: any) => ({
        ...input,
        createdAt: "2026-04-12T12:00:00.000Z",
        updatedAt: "2026-04-12T12:00:00.000Z"
      }),
      getCaseByExternalSourceRef: async () => null,
      findCaseByVendorCorrelationKey: async () => null,
      findCaseByComponentEventTime: async (input: any) => {
        seenToleranceSeconds.push(input.toleranceSeconds ?? -1);
        return input.toleranceSeconds === 12
          ? {
              id: "alarm-1",
              siteId: "site-1",
              primaryDeviceId: "device-1",
              alarmType: "motion",
              priority: "high",
              priorityRank: 3,
              lifecycleStatus: "received",
              assessmentStatus: "pending",
              technicalState: "complete",
              title: "Alarm",
              receivedAt: "2026-04-12T12:00:00.000Z",
              lastEventAt: "2026-04-12T12:00:00.000Z",
              createdAt: "2026-04-12T12:00:00.000Z",
              updatedAt: "2026-04-12T12:00:00.000Z",
              responseDeadlineState: "within_deadline",
              isEscalationReady: false
            }
          : null;
      },
      attachMedia: async (input: any) => ({
        id: "media-1",
        alarmCaseId: input.alarmCaseId,
        mediaKind: input.mediaKind,
        storageKey: input.storageKey,
        isPrimary: Boolean(input.isPrimary),
        createdAt: "2026-04-12T12:00:01.000Z",
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(input.capturedAt ? { capturedAt: input.capturedAt } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {})
      }),
      appendEvent: async () => ({
        id: "event-1",
        alarmCaseId: "alarm-1",
        eventKind: "media_attached",
        occurredAt: "2026-04-12T12:00:01.000Z",
        createdAt: "2026-04-12T12:00:01.000Z"
      }),
      updateVendorMediaInboxEntry: async (_id: string, patch: any) => ({
        id: "inbox-1",
        vendor: "hikvision",
        sourceType: "camera",
        storageKey: "/alarms/2026/04/KW15/12/HIK_CAM_014/example/file.jpg",
        mediaKind: "snapshot",
        status: patch.status ?? "attached",
        createdAt: "2026-04-12T12:00:00.000Z",
        updatedAt: "2026-04-12T12:00:01.000Z",
        ...(patch.alarmCaseId ? { alarmCaseId: patch.alarmCaseId } : {}),
        ...(patch.attachedMediaId ? { attachedMediaId: patch.attachedMediaId } : {})
      })
    } as any,
    audit: {
      record: async () => undefined
    } as any,
    logger: {
      info: () => undefined
    } as any,
    correlationToleranceSeconds: 30,
    vendorCorrelationToleranceSeconds: {
      hikvision: 12
    }
  });

  const result = await service.ingestReference({
    vendor: "hikvision",
    sourceType: "camera",
    storageKey: "/incoming/HIK_CAM_014_CH01_lineDetectionStart_20260411T143321Z_HIK991_001.jpg",
    filename: "HIK_CAM_014_CH01_lineDetectionStart_20260411T143321Z_HIK991_001.jpg",
    mimeType: "image/jpeg"
  }, "req-1");

  assert.equal(result.status, "attached");
  assert.deepEqual(seenToleranceSeconds, [0, 12]);
});