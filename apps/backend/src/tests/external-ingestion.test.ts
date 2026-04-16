/**
 * Testet die Anbindung externer Alarmquellen an die bestehende Ingestion.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createExternalAlarmIngestionService } from "../modules/alarm-core/external-ingestion-service.js";

test("external ingestion resolves device hints and delegates to existing alarm ingestion", async () => {
  const ingestionCalls: any[] = [];
  const auditActions: string[] = [];

  const service = createExternalAlarmIngestionService({
    store: {
      getCaseByExternalSourceRef: async () => null,
      hasSite: async (siteId: string) => siteId === "site-1",
      hasDevice: async (deviceId: string) => deviceId === "device-1",
      resolveSiteIdByDeviceId: async (deviceId: string) => deviceId === "device-1" ? "site-1" : null,
      resolveAlarmSourceMapping: async () => null,
      resolveDeviceIdBySerialNumber: async (serialNumber: string) => serialNumber === "SER-1" ? "device-1" : null,
      resolveDeviceIdByNetworkAddress: async (networkAddress: string) => networkAddress === "10.0.0.10" ? "device-1" : null,
      appendEvent: async (input: any) => ({
        id: "event-2",
        alarmCaseId: input.alarmCaseId,
        eventKind: input.eventKind,
        occurredAt: "2026-04-10T12:00:01.000Z",
        message: input.message,
        payload: input.payload,
        createdAt: "2026-04-10T12:00:01.000Z"
      }),
      listEventsByCaseId: async () => [],
      listMediaByCaseId: async () => []
    } as any,
    alarmIngestion: {
      ingest: async (payload: any) => {
        ingestionCalls.push(payload);
        return {
          alarmCase: {
            id: "alarm-1",
            siteId: payload.siteId,
            primaryDeviceId: payload.primaryDeviceId,
            externalSourceRef: payload.externalSourceRef,
            alarmType: "motion",
            priority: "critical",
            priorityRank: 3,
            lifecycleStatus: "received",
            assessmentStatus: "pending",
            technicalState: "complete",
            title: "Fence intrusion",
            receivedAt: "2026-04-10T12:00:00.000Z",
            lastEventAt: "2026-04-10T12:00:00.000Z",
            createdAt: "2026-04-10T12:00:00.000Z",
            updatedAt: "2026-04-10T12:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [{
            id: "event-1",
            alarmCaseId: "alarm-1",
            eventKind: "case_created",
            occurredAt: "2026-04-10T12:00:00.000Z",
            createdAt: "2026-04-10T12:00:00.000Z"
          }],
          media: [{
            id: "media-1",
            alarmCaseId: "alarm-1",
            deviceId: "device-1",
            mediaKind: "snapshot",
            storageKey: "https://example.test/snapshot.jpg",
            isPrimary: true,
            createdAt: "2026-04-10T12:00:00.000Z"
          }],
          acceptedAsTechnicalError: false
        };
      }
    },
    audit: {
      record: async (event: any) => {
        auditActions.push(event.action);
      }
    } as any,
    logger: {
      info: () => undefined
    } as any
  });

  const result = await service.ingest({
    sourceSystem: "dahua",
    sourceType: "nvr",
    externalEventId: "EVT-1",
    deviceSerialNumber: "SER-1",
    eventType: "intrusion",
    eventTime: "2026-04-10T12:00:00.000Z",
    severity: "major",
    media: [{
      deviceNetworkAddress: "10.0.0.10",
      storageKey: "https://example.test/snapshot.jpg",
      mediaKind: "snapshot",
      isPrimary: true
    }]
  }, "req-1");

  assert.equal(result.duplicate, false);
  assert.equal(result.resolution.siteId, "site-1");
  assert.equal(result.resolution.primaryDeviceId, "device-1");
  assert.equal(ingestionCalls[0]?.siteId, "site-1");
  assert.equal(ingestionCalls[0]?.primaryDeviceId, "device-1");
  assert.equal(ingestionCalls[0]?.priority, "critical");
  assert.equal(ingestionCalls[0]?.media?.[0]?.deviceId, "device-1");
  assert.ok(result.events.some((entry) => entry.eventKind === "payload_updated"));
  assert.ok(auditActions.includes("alarm.external_ingestion.accepted"));
});

test("external ingestion treats duplicate external event ids idempotently", async () => {
  let delegated = false;

  const service = createExternalAlarmIngestionService({
    store: {
      getCaseByExternalSourceRef: async () => ({
        id: "alarm-existing",
        siteId: "site-1",
        externalSourceRef: "dahua:nvr:EVT-1",
        alarmType: "motion",
        priority: "high",
        priorityRank: 2,
        lifecycleStatus: "received",
        assessmentStatus: "pending",
        technicalState: "complete",
        title: "Existing alarm",
        receivedAt: "2026-04-10T12:00:00.000Z",
        lastEventAt: "2026-04-10T12:00:00.000Z",
        createdAt: "2026-04-10T12:00:00.000Z",
        updatedAt: "2026-04-10T12:00:00.000Z"
      }),
      resolveDeviceIdBySerialNumber: async () => "device-1",
      resolveDeviceIdByNetworkAddress: async () => null,
      resolveAlarmSourceMapping: async () => null,
      hasDevice: async () => true,
      hasSite: async () => true,
      resolveSiteIdByDeviceId: async () => "site-1",
      listEventsByCaseId: async () => [],
      listMediaByCaseId: async () => [],
      appendEvent: async () => undefined
    } as any,
    alarmIngestion: {
      ingest: async () => {
        delegated = true;
        throw new Error("should not be called");
      }
    },
    audit: {
      record: async () => undefined
    } as any,
    logger: {
      info: () => undefined
    } as any
  });

  const result = await service.ingest({
    sourceSystem: "dahua",
    sourceType: "nvr",
    externalEventId: "EVT-1",
    deviceSerialNumber: "SER-1",
    eventType: "intrusion",
    eventTime: "2026-04-10T12:00:00.000Z"
  }, "req-2");

  assert.equal(result.duplicate, true);
  assert.equal(result.alarmCase.id, "alarm-existing");
  assert.equal(delegated, false);
});

test("external ingestion prefers active alarm source mappings before serial fallback", async () => {
  const ingestionCalls: any[] = [];

  const service = createExternalAlarmIngestionService({
    store: {
      getCaseByExternalSourceRef: async () => null,
      hasSite: async (siteId: string) => siteId === "site-1",
      hasDevice: async () => false,
      resolveSiteIdByDeviceId: async (deviceId: string) => deviceId === "device-camera-1" ? "site-1" : null,
      resolveAlarmSourceMapping: async (input: any) => {
        assert.equal(input.sourceSystem, "hikvision");
        assert.equal(input.sourceType, "nvr");
        assert.equal(input.externalRecorderId, "nvr-nord");
        assert.equal(input.channelNumber, 4);
        return {
          mappingId: "mapping-1",
          siteId: "site-1",
          componentId: "device-camera-1",
          nvrComponentId: "device-nvr-1",
          matchedFields: ["externalRecorderId", "channelNumber"]
        };
      },
      resolveDeviceIdBySerialNumber: async () => "device-fallback",
      resolveDeviceIdByNetworkAddress: async () => null,
      appendEvent: async (input: any) => ({
        id: "event-2",
        alarmCaseId: input.alarmCaseId,
        eventKind: input.eventKind,
        occurredAt: "2026-04-10T12:00:01.000Z",
        message: input.message,
        payload: input.payload,
        createdAt: "2026-04-10T12:00:01.000Z"
      }),
      listEventsByCaseId: async () => [],
      listMediaByCaseId: async () => []
    } as any,
    alarmIngestion: {
      ingest: async (payload: any) => {
        ingestionCalls.push(payload);
        return {
          alarmCase: {
            id: "alarm-2",
            siteId: payload.siteId,
            primaryDeviceId: payload.primaryDeviceId,
            externalSourceRef: payload.externalSourceRef,
            alarmType: "motion",
            priority: "high",
            priorityRank: 3,
            lifecycleStatus: "received",
            assessmentStatus: "pending",
            technicalState: "complete",
            title: "Mapped alarm",
            receivedAt: "2026-04-10T12:00:00.000Z",
            lastEventAt: "2026-04-10T12:00:00.000Z",
            createdAt: "2026-04-10T12:00:00.000Z",
            updatedAt: "2026-04-10T12:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false
        };
      }
    },
    audit: {
      record: async () => undefined
    } as any,
    logger: {
      info: () => undefined
    } as any
  });

  const result = await service.ingest({
    sourceSystem: "hikvision",
    sourceType: "nvr",
    externalEventId: "EVT-2",
    externalRecorderId: "nvr-nord",
    channelNumber: 4,
    deviceSerialNumber: "SER-FALLBACK",
    eventType: "motion",
    eventTime: "2026-04-10T12:00:00.000Z",
    sourceName: "cam-nord"
  }, "req-3");

  assert.equal(result.resolution.siteId, "site-1");
  assert.equal(result.resolution.primaryDeviceId, "device-camera-1");
  assert.equal(result.resolution.mappingId, "mapping-1");
  assert.equal(result.resolution.matchedBy, "alarm_source_mapping");
  assert.equal(ingestionCalls[0]?.primaryDeviceId, "device-camera-1");
});