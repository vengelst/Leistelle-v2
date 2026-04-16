/**
 * Nimmt AJAX-Cloud- oder CMS-Eingaenge entgegen und delegiert sie in den bestehenden AJAX-Hub-Ingestion-Pfad.
 */
import type {
  AjaxCloudCmsCollectorStubRequest,
  AjaxHub2FourGJewellerAlarmIngestionRequest,
  ExternalAlarmIngestionResult
} from "@leitstelle/contracts";

import type { AjaxHub2FourGJewellerAlarmAdapterService } from "./ajax-hub-2-4g-jeweller-adapter.js";

export type AjaxCloudCmsCollectorStubService = {
  ingest: (input: AjaxCloudCmsCollectorStubRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateAjaxCloudCmsCollectorStubInput = {
  ajaxHubAlarmAdapter: Pick<AjaxHub2FourGJewellerAlarmAdapterService, "ingest">;
};

export function createAjaxCloudCmsCollectorStub(
  input: CreateAjaxCloudCmsCollectorStubInput
): AjaxCloudCmsCollectorStubService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      const normalized = normalizeAjaxCloudCmsCollectorStub(payload);
      return await input.ajaxHubAlarmAdapter.ingest(normalized, requestId, providedSharedSecret);
    }
  };
}

export function normalizeAjaxCloudCmsCollectorStub(
  payload: AjaxCloudCmsCollectorStubRequest
): AjaxHub2FourGJewellerAlarmIngestionRequest {
  const rawPayload = buildCollectorRawPayload(payload);
  const media = (payload.media ?? []).map((entry) => ({
    mediaType: entry.mediaType,
    url: entry.uri,
    ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
    ...(entry.capturedAt ? { capturedAt: entry.capturedAt } : {}),
    ...(entry.metadata ? { metadata: entry.metadata } : {})
  }));

  return {
    sourceEventId: payload.sourceEventId.trim(),
    ...(payload.hubId?.trim() ? { hubId: payload.hubId.trim() } : {}),
    ...(payload.hubName?.trim() ? { hubName: payload.hubName.trim() } : {}),
    ...(payload.hubExternalId?.trim() ? { hubExternalId: payload.hubExternalId.trim() } : {}),
    eventType: payload.eventType.trim(),
    ...(payload.eventCode?.trim() ? { eventCode: payload.eventCode.trim() } : {}),
    ...(payload.eventSubType?.trim() ? { eventSubType: payload.eventSubType.trim() } : {}),
    eventTime: payload.occurredAt,
    ...(payload.siteId?.trim() ? { siteId: payload.siteId.trim() } : {}),
    ...(payload.deviceId?.trim() ? { deviceId: payload.deviceId.trim() } : {}),
    ...(payload.detectorId?.trim() ? { detectorId: payload.detectorId.trim() } : {}),
    ...(payload.deviceName?.trim() ? { deviceName: payload.deviceName.trim() } : {}),
    ...(payload.room?.trim() ? { room: payload.room.trim() } : {}),
    ...(payload.zone?.trim() ? { zone: payload.zone.trim() } : {}),
    ...(payload.group?.trim() ? { group: payload.group.trim() } : {}),
    ...(payload.partition?.trim() ? { partition: payload.partition.trim() } : {}),
    ...(payload.user?.trim() ? { user: payload.user.trim() } : {}),
    ...(payload.triggerSource?.trim() ? { triggerSource: payload.triggerSource.trim() } : {}),
    ...(payload.severity?.trim() ? { severity: payload.severity.trim() } : {}),
    ...(payload.title?.trim() ? { title: payload.title.trim() } : {}),
    ...(payload.description?.trim() ? { description: payload.description.trim() } : {}),
    ...(media.length > 0 ? { media } : {}),
    ...(rawPayload ? { rawPayload } : {})
  };
}

function buildCollectorRawPayload(payload: AjaxCloudCmsCollectorStubRequest): Record<string, unknown> | undefined {
  const collectorPayload: Record<string, unknown> = {
    collectorStub: "ajax-cloud-cms",
    ...(payload.collectorSource ? { collectorSource: payload.collectorSource } : {})
  };
  if (payload.rawPayload) {
    collectorPayload["upstreamPayload"] = payload.rawPayload;
  }
  return Object.keys(collectorPayload).length > 0 ? collectorPayload : undefined;
}