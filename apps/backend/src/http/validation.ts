/**
 * Zentrale Request-Validierung des HTTP-Layers.
 *
 * Die Datei definiert Zod-Schemata und Reader fuer Bodies, Query-Parameter und
 * Filterobjekte, damit Service- und Store-Schichten nur bereits validierte
 * Eingaben sehen.
 */
import type { ZodType } from "zod";
import { z } from "zod";

import type {
  AlarmSourceMappingUpsertInput,
  AxisNvrAlarmIngestionRequest,
  AxisIpCameraAlarmIngestionRequest,
  UniviewIpCameraAlarmIngestionRequest,
  AjaxNvr8chAlarmIngestionRequest,
  AjaxCloudCmsCollectorStubRequest,
  AjaxHub2FourGJewellerAlarmIngestionRequest,
  AlarmAcknowledgeInput,
  AlarmActionInput,
  AlarmArchiveFilter,
  AlarmArchiveInput,
  AlarmCaseExportFormat,
  AlarmMediaAccessMode,
  AlarmMediaInboxFilter,
  AlarmMediaInboxStatus,
  AlarmAssessmentUpdateInput,
  AlarmCommentInput,
  AlarmFollowUpInput,
  AlarmReleaseInput,
  AlarmReservationInput,
  AlarmIngestionRequest,
  AlarmInstructionTimeContext,
  AlarmPipelineFilter,
  AlarmCloseInput,
  DahuaNvrAlarmIngestionRequest,
  ExternalAlarmIngestionRequest,
  ExternalAlarmMediaIngestionRequest,
  GrundigGuSeriesIpCameraAlarmIngestionRequest,
  GrundigGuRnAc5104nAlarmIngestionRequest,
  AlarmWorkflowProfileFilter,
  AlarmWorkflowProfileUpsertInput,
  CustomerUpsertInput,
  DeviceUpsertInput,
  GlobalSettingsUpdateInput,
  HikvisionIpCameraAlarmIngestionRequest,
  HikvisionNvrAlarmIngestionRequest,
  LoginRequest,
  MonitoringDisturbanceAcknowledgeInput,
  MonitoringDisturbanceNoteInput,
  MonitoringPipelineFilter,
  ReportingFilter,
  MonitoringServiceCaseCreateInput,
  PlanUpsertInput,
  SiteUpsertInput,
  ShiftPlanningFilter,
  ShiftUpsertInput,
  StatusChangeRequest,
  UserActivationInput,
  UserUpsertInput,
} from "@leitstelle/contracts";
import {
  alarmActionStatusCodes,
  alarmArchiveLifecycleScopes,
  alarmArchivePeriods,
  alarmCaseExportFormats,
  alarmAssessmentStatuses,
  alarmCommentKinds,
  alarmInstructionTimeContexts,
  alarmMediaAccessModes,
  alarmMediaInboxStatuses,
  alarmTypes,
  alarmTechnicalStates,
  deviceTypes,
  monitoringPriorities,
  monitoringDisturbanceTypes,
  mediaBundleProfileKeys,
  planKinds,
  reportingGroupDimensions,
  reportingPeriods,
  shiftPlanningPeriods,
  shiftPlanningStates,
  loginModes,
  siteTechnicalOverallStatuses,
  siteStatuses,
  userRoles
} from "@leitstelle/contracts";
import { AppError } from "@leitstelle/observability";

import { readJsonBody } from "./body.js";

const trimmedString = z.string().trim().min(1);
const optionalTrimmedString = z.string().trim().optional().transform((value) => (value && value.length > 0 ? value : undefined));
const optionalNullableTrimmedString = z.union([z.string().trim(), z.null()]).optional().transform((value) => {
  if (value === null) {
    return null;
  }

  return value && value.length > 0 ? value : undefined;
});
const optionalLatitude = z.number().min(-90).max(90).optional();
const optionalLongitude = z.number().min(-180).max(180).optional();

export const loginRequestSchema: ZodType<LoginRequest> = z
  .object({
    mode: z.enum(loginModes),
    identifier: optionalTrimmedString,
    password: optionalTrimmedString,
    kioskCode: optionalTrimmedString
  })
  .superRefine((value, context) => {
    if (value.mode === "password") {
      if (!value.identifier) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "identifier is required for password login.", path: ["identifier"] });
      }
      if (!value.password) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "password is required for password login.", path: ["password"] });
      }
      return;
    }

    if (!value.kioskCode) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "kioskCode is required for kiosk login.", path: ["kioskCode"] });
    }
  })
  .transform((value) => compactOptionalProperties(value) as LoginRequest);

export const statusChangeSchema: ZodType<StatusChangeRequest> = z
  .object({
    reason: optionalTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as StatusChangeRequest);

export const userUpsertSchema: ZodType<UserUpsertInput> = z
  .object({
    id: optionalTrimmedString,
    username: trimmedString,
    email: z.string().trim().email(),
    displayName: trimmedString,
    primaryRole: z.enum(userRoles),
    roles: z.array(z.enum(userRoles)).min(1),
    isActive: z.boolean(),
    password: optionalTrimmedString,
    kioskCode: optionalNullableTrimmedString,
    avatarDataUrl: optionalNullableTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as UserUpsertInput);

export const userActivationSchema: ZodType<UserActivationInput> = z.object({
  isActive: z.boolean()
});

export const customerUpsertSchema: ZodType<CustomerUpsertInput> = z
  .object({
    id: optionalTrimmedString,
    name: trimmedString,
    externalRef: optionalTrimmedString,
    isActive: z.boolean()
  })
  .transform((value) => compactOptionalProperties(value) as CustomerUpsertInput);

export const siteUpsertSchema: ZodType<SiteUpsertInput> = z
  .object({
    id: optionalTrimmedString,
    customerId: trimmedString,
    siteName: trimmedString,
    internalReference: optionalTrimmedString,
    description: optionalTrimmedString,
    status: z.enum(siteStatuses),
    street: trimmedString,
    houseNumber: optionalTrimmedString,
    postalCode: trimmedString,
    city: trimmedString,
    country: trimmedString,
    latitude: optionalLatitude,
    longitude: optionalLongitude,
    siteType: optionalTrimmedString,
    contactPerson: optionalTrimmedString,
    contactPhone: optionalTrimmedString,
    notes: optionalTrimmedString,
    isArchived: z.boolean(),
    monitoringIntervalSeconds: z.number().int().positive(),
    failureThreshold: z.number().int().nonnegative(),
    highlightCriticalDevices: z.boolean(),
    defaultAlarmPriority: z.enum(["normal", "high", "critical"]),
    defaultWorkflowProfile: z.enum(["default", "event_sensitive"]),
    mapLabelMode: z.enum(["short", "full"])
  })
  .transform((value) => compactOptionalProperties(value) as SiteUpsertInput);

export const deviceUpsertSchema: ZodType<DeviceUpsertInput> = z
  .object({
    id: optionalTrimmedString,
    siteId: trimmedString,
    name: trimmedString,
    type: z.enum(deviceTypes),
    vendor: optionalTrimmedString,
    model: optionalTrimmedString,
    serialNumber: optionalTrimmedString,
    status: z.enum(["planned", "installed", "retired"]),
    isActive: z.boolean(),
    networkAddress: optionalTrimmedString,
    liveViewUrl: optionalTrimmedString,
    macAddress: optionalTrimmedString,
    externalDeviceId: optionalTrimmedString,
    linkedNvrDeviceId: optionalTrimmedString,
    channelNumber: z.number().int().positive().optional(),
    zone: optionalTrimmedString,
    viewingDirection: optionalTrimmedString,
    mountLocation: optionalTrimmedString,
    analyticsName: optionalTrimmedString,
    ruleName: optionalTrimmedString,
    storageLabel: optionalTrimmedString,
    wanIp: optionalTrimmedString,
    lanIp: optionalTrimmedString,
    vpnType: optionalTrimmedString,
    provider: optionalTrimmedString,
    simIdentifier: optionalTrimmedString,
    audioZone: optionalTrimmedString,
    supportsPaging: z.boolean().optional()
  })
  .transform((value) => compactOptionalProperties(value) as DeviceUpsertInput);

export const alarmSourceMappingUpsertSchema: ZodType<AlarmSourceMappingUpsertInput> = z
  .object({
    id: optionalTrimmedString,
    siteId: trimmedString,
    componentId: trimmedString,
    nvrComponentId: optionalTrimmedString,
    vendor: trimmedString,
    sourceType: trimmedString,
    externalSourceKey: optionalTrimmedString,
    externalDeviceId: optionalTrimmedString,
    externalRecorderId: optionalTrimmedString,
    channelNumber: z.number().int().positive().optional(),
    serialNumber: optionalTrimmedString,
    analyticsName: optionalTrimmedString,
    eventNamespace: optionalTrimmedString,
    mediaBundleProfileKey: z.enum(mediaBundleProfileKeys).optional(),
    description: optionalTrimmedString,
    sortOrder: z.number().int().min(0),
    isActive: z.boolean()
  })
  .transform((value) => compactOptionalProperties(value) as AlarmSourceMappingUpsertInput);

export const planUpsertSchema: ZodType<PlanUpsertInput> = z
  .object({
    id: optionalTrimmedString,
    siteId: trimmedString,
    name: trimmedString,
    kind: z.enum(planKinds),
    assetName: trimmedString,
    markerLabel: trimmedString,
    markerType: z.enum(["camera", "entry", "speaker", "custom"]),
    markerX: z.number().min(0).max(10000),
    markerY: z.number().min(0).max(10000),
    deviceId: optionalTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as PlanUpsertInput);

export const globalSettingsSchema: ZodType<GlobalSettingsUpdateInput> = z.object({
  monitoringIntervalSeconds: z.number().int().positive(),
  failureThreshold: z.number().int().nonnegative(),
  uiDensity: z.enum(["compact", "comfortable"]),
  escalationProfile: z.enum(["standard", "elevated"]),
  workflowProfile: z.enum(["default", "weekend_sensitive"]),
  passwordMinLength: z.number().int().min(4).max(128),
  kioskCodeLength: z.number().int().min(4).max(24)
});

const optionalDateTimeString = z
  .string()
  .trim()
  .datetime({ offset: true })
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const jsonRecordSchema = z.record(z.string(), z.unknown());

export const alarmIngestionSchema: ZodType<AlarmIngestionRequest> = z
  .object({
    siteId: trimmedString,
    primaryDeviceId: optionalTrimmedString,
    externalSourceRef: optionalTrimmedString,
    alarmType: optionalTrimmedString,
    priority: optionalTrimmedString,
    title: optionalTrimmedString,
    description: optionalTrimmedString,
    sourceOccurredAt: optionalDateTimeString,
    sourcePayload: jsonRecordSchema.optional(),
    technicalDetails: jsonRecordSchema.optional(),
    media: z
      .array(
        z
          .object({
            deviceId: optionalTrimmedString,
            mediaKind: optionalTrimmedString,
            storageKey: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            isPrimary: z.boolean().optional(),
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional()
  })
  .transform((value) => compactOptionalProperties(value) as AlarmIngestionRequest);

export const externalAlarmIngestionSchema: ZodType<ExternalAlarmIngestionRequest> = z
  .object({
    sourceSystem: trimmedString,
    sourceType: trimmedString,
    externalEventId: trimmedString,
    siteId: optionalTrimmedString,
    deviceId: optionalTrimmedString,
    deviceSerialNumber: optionalTrimmedString,
    deviceNetworkAddress: optionalTrimmedString,
    externalDeviceId: optionalTrimmedString,
    externalRecorderId: optionalTrimmedString,
    channelNumber: z.number().int().positive().optional(),
    analyticsName: optionalTrimmedString,
    sourceName: optionalTrimmedString,
    eventNamespace: optionalTrimmedString,
    eventType: trimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    severity: optionalTrimmedString,
    title: optionalTrimmedString,
    description: optionalTrimmedString,
    zone: optionalTrimmedString,
    cameraName: optionalTrimmedString,
    rawPayload: jsonRecordSchema.optional(),
    media: z
      .array(
        z
          .object({
            deviceId: optionalTrimmedString,
            deviceSerialNumber: optionalTrimmedString,
            deviceNetworkAddress: optionalTrimmedString,
            mediaKind: optionalTrimmedString,
            storageKey: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            isPrimary: z.boolean().optional(),
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional()
  })
  .transform((value) => compactOptionalProperties(value) as ExternalAlarmIngestionRequest);

export const externalAlarmMediaIngestionSchema: ZodType<ExternalAlarmMediaIngestionRequest> = z
  .object({
    vendor: trimmedString,
    sourceType: trimmedString,
    storageKey: trimmedString,
    filename: optionalTrimmedString,
    relativePath: optionalTrimmedString,
    mimeType: optionalTrimmedString,
    capturedAt: optionalDateTimeString,
    uploadedAt: optionalDateTimeString,
    metadata: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as ExternalAlarmMediaIngestionRequest);

export const dahuaNvrAlarmIngestionSchema: ZodType<DahuaNvrAlarmIngestionRequest> = z
  .object({
    sourceEventId: trimmedString,
    eventCode: trimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    siteId: optionalTrimmedString,
    recorderSerialNumber: optionalTrimmedString,
    recorderIp: optionalTrimmedString,
    cameraSerialNumber: optionalTrimmedString,
    cameraIp: optionalTrimmedString,
    channel: z.number().int().positive().optional(),
    cameraName: optionalTrimmedString,
    eventAction: optionalTrimmedString,
    severity: optionalTrimmedString,
    zone: optionalTrimmedString,
    ruleName: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "clip"]),
            url: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            cameraSerialNumber: optionalTrimmedString,
            cameraIp: optionalTrimmedString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as DahuaNvrAlarmIngestionRequest);

export const grundigGuRnAc5104nAlarmIngestionSchema: ZodType<GrundigGuRnAc5104nAlarmIngestionRequest> = z
  .object({
    sourceEventId: trimmedString,
    eventCode: trimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    siteId: optionalTrimmedString,
    recorderId: optionalTrimmedString,
    recorderSerialNumber: optionalTrimmedString,
    recorderIp: optionalTrimmedString,
    cameraId: optionalTrimmedString,
    cameraSerialNumber: optionalTrimmedString,
    cameraIp: optionalTrimmedString,
    channel: z.number().int().positive().optional(),
    cameraName: optionalTrimmedString,
    eventAction: optionalTrimmedString,
    severity: optionalTrimmedString,
    zone: optionalTrimmedString,
    ruleName: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "clip"]),
            url: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            cameraSerialNumber: optionalTrimmedString,
            cameraIp: optionalTrimmedString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as GrundigGuRnAc5104nAlarmIngestionRequest);

export const grundigGuSeriesIpCameraAlarmIngestionSchema: ZodType<GrundigGuSeriesIpCameraAlarmIngestionRequest> = z
  .object({
    sourceEventId: trimmedString,
    eventCode: trimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    eventType: optionalTrimmedString,
    siteId: optionalTrimmedString,
    siteExternalHint: optionalTrimmedString,
    cameraId: optionalTrimmedString,
    cameraName: optionalTrimmedString,
    cameraSerialNumber: optionalTrimmedString,
    cameraIp: optionalTrimmedString,
    severity: optionalTrimmedString,
    zone: optionalTrimmedString,
    ruleName: optionalTrimmedString,
    analyticsName: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "clip"]),
            url: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            cameraSerialNumber: optionalTrimmedString,
            cameraIp: optionalTrimmedString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as GrundigGuSeriesIpCameraAlarmIngestionRequest);

export const hikvisionIpCameraAlarmIngestionSchema: ZodType<HikvisionIpCameraAlarmIngestionRequest> = z
  .object({
    sourceEventId: trimmedString,
    eventCode: trimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    eventType: optionalTrimmedString,
    siteId: optionalTrimmedString,
    siteExternalHint: optionalTrimmedString,
    cameraId: optionalTrimmedString,
    cameraName: optionalTrimmedString,
    cameraSerialNumber: optionalTrimmedString,
    cameraIp: optionalTrimmedString,
    severity: optionalTrimmedString,
    zone: optionalTrimmedString,
    ruleName: optionalTrimmedString,
    analyticsName: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "clip"]),
            url: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            cameraSerialNumber: optionalTrimmedString,
            cameraIp: optionalTrimmedString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as HikvisionIpCameraAlarmIngestionRequest);

export const hikvisionNvrAlarmIngestionSchema: ZodType<HikvisionNvrAlarmIngestionRequest> = z
  .object({
    sourceEventId: trimmedString,
    eventCode: trimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    eventType: optionalTrimmedString,
    siteId: optionalTrimmedString,
    siteExternalHint: optionalTrimmedString,
    nvrId: optionalTrimmedString,
    nvrName: optionalTrimmedString,
    nvrSerialNumber: optionalTrimmedString,
    nvrIp: optionalTrimmedString,
    cameraId: optionalTrimmedString,
    cameraName: optionalTrimmedString,
    cameraSerialNumber: optionalTrimmedString,
    cameraIp: optionalTrimmedString,
    channel: z.number().int().positive().optional(),
    severity: optionalTrimmedString,
    zone: optionalTrimmedString,
    ruleName: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "clip"]),
            url: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            cameraSerialNumber: optionalTrimmedString,
            cameraIp: optionalTrimmedString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as HikvisionNvrAlarmIngestionRequest);

export const axisIpCameraAlarmIngestionSchema: ZodType<AxisIpCameraAlarmIngestionRequest> = z
  .object({
    sourceEventId: trimmedString,
    eventCode: trimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    eventType: optionalTrimmedString,
    siteId: optionalTrimmedString,
    siteExternalHint: optionalTrimmedString,
    cameraId: optionalTrimmedString,
    cameraName: optionalTrimmedString,
    cameraSerialNumber: optionalTrimmedString,
    cameraIp: optionalTrimmedString,
    severity: optionalTrimmedString,
    zone: optionalTrimmedString,
    ruleName: optionalTrimmedString,
    analyticsName: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "clip"]),
            url: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            cameraSerialNumber: optionalTrimmedString,
            cameraIp: optionalTrimmedString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as AxisIpCameraAlarmIngestionRequest);

export const axisNvrAlarmIngestionSchema: ZodType<AxisNvrAlarmIngestionRequest> = z
  .object({
    sourceEventId: trimmedString,
    eventCode: trimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    eventType: optionalTrimmedString,
    siteId: optionalTrimmedString,
    siteExternalHint: optionalTrimmedString,
    nvrId: optionalTrimmedString,
    nvrName: optionalTrimmedString,
    nvrSerialNumber: optionalTrimmedString,
    nvrIp: optionalTrimmedString,
    cameraId: optionalTrimmedString,
    cameraName: optionalTrimmedString,
    cameraSerialNumber: optionalTrimmedString,
    cameraIp: optionalTrimmedString,
    channel: z.number().int().positive().optional(),
    severity: optionalTrimmedString,
    zone: optionalTrimmedString,
    ruleName: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "clip"]),
            url: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            cameraSerialNumber: optionalTrimmedString,
            cameraIp: optionalTrimmedString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as AxisNvrAlarmIngestionRequest);

export const univiewIpCameraAlarmIngestionSchema: ZodType<UniviewIpCameraAlarmIngestionRequest> = z
  .object({
    sourceEventId: trimmedString,
    eventCode: trimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    eventType: optionalTrimmedString,
    siteId: optionalTrimmedString,
    siteExternalHint: optionalTrimmedString,
    cameraId: optionalTrimmedString,
    cameraName: optionalTrimmedString,
    cameraSerialNumber: optionalTrimmedString,
    cameraIp: optionalTrimmedString,
    severity: optionalTrimmedString,
    zone: optionalTrimmedString,
    ruleName: optionalTrimmedString,
    analyticsName: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "clip"]),
            url: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            cameraSerialNumber: optionalTrimmedString,
            cameraIp: optionalTrimmedString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as UniviewIpCameraAlarmIngestionRequest);

export const ajaxHub2FourGJewellerAlarmIngestionSchema: ZodType<AjaxHub2FourGJewellerAlarmIngestionRequest> = z
  .object({
    sourceEventId: trimmedString,
    hubId: optionalTrimmedString,
    hubName: optionalTrimmedString,
    hubExternalId: optionalTrimmedString,
    eventCode: optionalTrimmedString,
    eventType: trimmedString,
    eventSubType: optionalTrimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    siteId: optionalTrimmedString,
    deviceId: optionalTrimmedString,
    detectorId: optionalTrimmedString,
    deviceName: optionalTrimmedString,
    room: optionalTrimmedString,
    zone: optionalTrimmedString,
    group: optionalTrimmedString,
    partition: optionalTrimmedString,
    user: optionalTrimmedString,
    triggerSource: optionalTrimmedString,
    severity: optionalTrimmedString,
    title: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "document"]),
            url: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as AjaxHub2FourGJewellerAlarmIngestionRequest);

export const ajaxCloudCmsCollectorStubSchema: ZodType<AjaxCloudCmsCollectorStubRequest> = z
  .object({
    sourceEventId: trimmedString,
    collectorSource: z.enum(["cloud_signaling", "cms", "enterprise_api"]).optional(),
    hubId: optionalTrimmedString,
    hubName: optionalTrimmedString,
    hubExternalId: optionalTrimmedString,
    eventType: trimmedString,
    eventCode: optionalTrimmedString,
    eventSubType: optionalTrimmedString,
    occurredAt: z.string().trim().datetime({ offset: true }),
    siteId: optionalTrimmedString,
    deviceId: optionalTrimmedString,
    detectorId: optionalTrimmedString,
    deviceName: optionalTrimmedString,
    room: optionalTrimmedString,
    zone: optionalTrimmedString,
    group: optionalTrimmedString,
    partition: optionalTrimmedString,
    user: optionalTrimmedString,
    triggerSource: optionalTrimmedString,
    severity: optionalTrimmedString,
    title: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "document"]),
            uri: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as AjaxCloudCmsCollectorStubRequest);

export const ajaxNvr8chAlarmIngestionSchema: ZodType<AjaxNvr8chAlarmIngestionRequest> = z
  .object({
    sourceEventId: trimmedString,
    eventCode: trimmedString,
    eventTime: z.string().trim().datetime({ offset: true }),
    eventType: optionalTrimmedString,
    siteId: optionalTrimmedString,
    siteExternalHint: optionalTrimmedString,
    nvrId: optionalTrimmedString,
    nvrName: optionalTrimmedString,
    nvrSerialNumber: optionalTrimmedString,
    nvrIp: optionalTrimmedString,
    cameraId: optionalTrimmedString,
    cameraName: optionalTrimmedString,
    cameraSerialNumber: optionalTrimmedString,
    cameraIp: optionalTrimmedString,
    channel: z.number().int().positive().optional(),
    severity: optionalTrimmedString,
    zone: optionalTrimmedString,
    ruleName: optionalTrimmedString,
    description: optionalTrimmedString,
    media: z
      .array(
        z
          .object({
            mediaType: z.enum(["snapshot", "clip", "archive_reference"]),
            url: trimmedString,
            mimeType: optionalTrimmedString,
            capturedAt: optionalDateTimeString,
            cameraSerialNumber: optionalTrimmedString,
            cameraIp: optionalTrimmedString,
            metadata: jsonRecordSchema.optional()
          })
          .transform((value) => compactOptionalProperties(value))
      )
      .optional(),
    rawPayload: jsonRecordSchema.optional()
  })
  .transform((value) => compactOptionalProperties(value) as AjaxNvr8chAlarmIngestionRequest);

export const alarmReservationSchema: ZodType<AlarmReservationInput> = z
  .object({
    targetUserId: optionalTrimmedString,
    override: z.boolean().optional(),
    reason: optionalTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as AlarmReservationInput);

export const alarmReleaseSchema: ZodType<AlarmReleaseInput> = z
  .object({
    override: z.boolean().optional(),
    reason: optionalTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as AlarmReleaseInput);

export const alarmAcknowledgeSchema: ZodType<AlarmAcknowledgeInput> = z
  .object({
    comment: optionalTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as AlarmAcknowledgeInput);

export const alarmAssessmentSchema: ZodType<AlarmAssessmentUpdateInput> = z
  .object({
    assessmentStatus: z.enum(alarmAssessmentStatuses),
    falsePositiveReasonIds: z.array(trimmedString).optional()
  })
  .transform((value) => compactOptionalProperties(value) as AlarmAssessmentUpdateInput);

export const alarmCommentSchema: ZodType<AlarmCommentInput> = z
  .object({
    body: trimmedString,
    commentKind: z.enum(alarmCommentKinds).optional(),
    context: optionalTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as AlarmCommentInput);

export const alarmFollowUpSchema: ZodType<AlarmFollowUpInput> = z
  .object({
    followUpAt: optionalDateTimeString,
    note: optionalTrimmedString,
    clear: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (value.clear) {
      if (value.followUpAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["followUpAt"],
          message: "muss beim Entfernen leer bleiben"
        });
      }
      return;
    }

    if (!value.followUpAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["followUpAt"],
        message: "ist erforderlich"
      });
    }
  })
  .transform((value) => compactOptionalProperties(value) as AlarmFollowUpInput);

export const alarmActionSchema: ZodType<AlarmActionInput> = z
  .object({
    actionTypeId: trimmedString,
    statusId: trimmedString,
    comment: trimmedString,
    occurredAt: optionalDateTimeString
  })
  .transform((value) => compactOptionalProperties(value) as AlarmActionInput);

export const alarmCloseSchema: ZodType<AlarmCloseInput> = z
  .object({
    closureReasonId: trimmedString,
    comment: optionalTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as AlarmCloseInput);

export const alarmArchiveSchema: ZodType<AlarmArchiveInput> = z
  .object({
    comment: optionalTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as AlarmArchiveInput);

const optionalTimeString = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}:\d{2}$/)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

export const alarmWorkflowProfileSchema: ZodType<AlarmWorkflowProfileUpsertInput> = z
  .object({
    id: optionalTrimmedString,
    siteId: trimmedString,
    code: trimmedString,
    label: trimmedString,
    description: optionalTrimmedString,
    timeContext: z.enum(alarmInstructionTimeContexts),
    specialContextLabel: optionalTrimmedString,
    activeFromTime: optionalTimeString,
    activeToTime: optionalTimeString,
    isActive: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
    steps: z.array(
      z.object({
        id: optionalTrimmedString,
        stepCode: trimmedString,
        title: trimmedString,
        instruction: optionalTrimmedString,
        sortOrder: z.number().int().nonnegative(),
        isRequiredByDefault: z.boolean(),
        actionTypeId: optionalTrimmedString,
        activeFromTime: optionalTimeString,
        activeToTime: optionalTimeString
      }).transform((value) => compactOptionalProperties(value))
    ).min(1)
  })
  .transform((value) => compactOptionalProperties(value) as AlarmWorkflowProfileUpsertInput);

export const monitoringDisturbanceAcknowledgeSchema: ZodType<MonitoringDisturbanceAcknowledgeInput> = z
  .object({
    comment: optionalTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as MonitoringDisturbanceAcknowledgeInput);

export const monitoringDisturbanceNoteSchema: ZodType<MonitoringDisturbanceNoteInput> = z
  .object({
    note: trimmedString
  })
  .transform((value) => compactOptionalProperties(value) as MonitoringDisturbanceNoteInput);

export const monitoringServiceCaseCreateSchema: ZodType<MonitoringServiceCaseCreateInput> = z
  .object({
    comment: trimmedString
  })
  .transform((value) => compactOptionalProperties(value) as MonitoringServiceCaseCreateInput);

export const shiftUpsertSchema: ZodType<ShiftUpsertInput> = z
  .object({
    id: optionalTrimmedString,
    title: trimmedString,
    startsAt: z.string().trim().datetime({ offset: true }),
    endsAt: z.string().trim().datetime({ offset: true }),
    assignmentUserIds: z.array(trimmedString).optional(),
    handoverNote: optionalTrimmedString
  })
  .transform((value) => compactOptionalProperties(value) as ShiftUpsertInput);

export function hasAnyRole(userRolesToCheck: string[], allowedRoles: readonly string[]): boolean {
  return userRolesToCheck.some((role) => allowedRoles.includes(role));
}

export async function readValidatedJsonBody<TValue>(req: Parameters<typeof readJsonBody>[0], schema: ZodType<TValue>): Promise<TValue> {
  const parsed = await readJsonBody(req);
  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new AppError("Request body validation failed.", {
      status: 400,
      code: "HTTP_BODY_VALIDATION_FAILED",
      detail: result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ")
    });
  }

  return result.data;
}

export function readAlarmPipelineFilter(searchParams: URLSearchParams): AlarmPipelineFilter {
  const siteId = normalizeSearchParam(searchParams.get("siteId"));
  const alarmType = normalizeSearchParam(searchParams.get("alarmType"));
  const technicalState = normalizeSearchParam(searchParams.get("technicalState"));
  const limit = normalizeSearchParam(searchParams.get("limit"));

  if (alarmType && !(alarmTypes as readonly string[]).includes(alarmType)) {
    throw new AppError("Alarm pipeline query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "alarmType has an unsupported value."
    });
  }

  if (technicalState && !(alarmTechnicalStates as readonly string[]).includes(technicalState)) {
    throw new AppError("Alarm pipeline query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "technicalState has an unsupported value."
    });
  }

  const parsedLimit = limit ? Number(limit) : undefined;
  if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
    throw new AppError("Alarm pipeline query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "limit must be a positive integer."
    });
  }

  return compactOptionalProperties({
    siteId,
    alarmType,
    technicalState,
    limit: parsedLimit
  }) as AlarmPipelineFilter;
}

export function readAlarmWorkflowProfileFilter(searchParams: URLSearchParams): AlarmWorkflowProfileFilter {
  const siteId = normalizeSearchParam(searchParams.get("siteId"));
  const timeContext = normalizeSearchParam(searchParams.get("timeContext")) as AlarmInstructionTimeContext | undefined;

  if (timeContext && !(alarmInstructionTimeContexts as readonly string[]).includes(timeContext)) {
    throw new AppError("Alarm workflow query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "timeContext has an unsupported value."
    });
  }

  return compactOptionalProperties({
    ...(siteId ? { siteId } : {}),
    ...(timeContext ? { timeContext } : {})
  }) as AlarmWorkflowProfileFilter;
}

export function readAlarmMediaInboxFilter(searchParams: URLSearchParams): AlarmMediaInboxFilter {
  const status = normalizeSearchParam(searchParams.get("status")) as AlarmMediaInboxStatus | undefined;
  const siteId = normalizeSearchParam(searchParams.get("siteId"));
  const vendor = normalizeSearchParam(searchParams.get("vendor"));
  const limit = normalizeSearchParam(searchParams.get("limit"));

  if (status && !(alarmMediaInboxStatuses as readonly string[]).includes(status)) {
    throw new AppError("Alarm media inbox query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "status has an unsupported value."
    });
  }

  const parsedLimit = limit ? Number(limit) : undefined;
  if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
    throw new AppError("Alarm media inbox query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "limit must be a positive integer."
    });
  }

  return compactOptionalProperties({
    status,
    siteId,
    vendor,
    limit: parsedLimit
  }) as AlarmMediaInboxFilter;
}

export function readAlarmArchiveFilter(searchParams: URLSearchParams): AlarmArchiveFilter {
  const period = normalizeSearchParam(searchParams.get("period")) ?? "month";
  const dateFrom = normalizeSearchParam(searchParams.get("dateFrom"));
  const dateTo = normalizeSearchParam(searchParams.get("dateTo"));
  const customerId = normalizeSearchParam(searchParams.get("customerId"));
  const siteId = normalizeSearchParam(searchParams.get("siteId"));
  const cameraId = normalizeSearchParam(searchParams.get("cameraId"));
  const alarmType = normalizeSearchParam(searchParams.get("alarmType"));
  const assessmentStatus = normalizeSearchParam(searchParams.get("assessmentStatus"));
  const operatorUserId = normalizeSearchParam(searchParams.get("operatorUserId"));
  const closureReasonId = normalizeSearchParam(searchParams.get("closureReasonId"));
  const lifecycleScope = normalizeSearchParam(searchParams.get("lifecycleScope"));
  const disturbanceType = normalizeSearchParam(searchParams.get("disturbanceType"));
  const limit = normalizeSearchParam(searchParams.get("limit"));

  if (!(alarmArchivePeriods as readonly string[]).includes(period)) {
    throw new AppError("Alarm archive query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "period has an unsupported value."
    });
  }

  if (alarmType && !(alarmTypes as readonly string[]).includes(alarmType)) {
    throw new AppError("Alarm archive query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "alarmType has an unsupported value."
    });
  }

  if (assessmentStatus && !(alarmAssessmentStatuses as readonly string[]).includes(assessmentStatus)) {
    throw new AppError("Alarm archive query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "assessmentStatus has an unsupported value."
    });
  }

  if (lifecycleScope && !(alarmArchiveLifecycleScopes as readonly string[]).includes(lifecycleScope)) {
    throw new AppError("Alarm archive query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "lifecycleScope has an unsupported value."
    });
  }

  if ((period === "custom") && (!dateFrom || !dateTo)) {
    throw new AppError("Alarm archive query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "dateFrom and dateTo are required for custom periods."
    });
  }

  const parsedLimit = limit ? Number(limit) : undefined;
  if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
    throw new AppError("Alarm archive query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "limit must be a positive integer."
    });
  }

  return compactOptionalProperties({
    period,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(customerId ? { customerId } : {}),
    ...(siteId ? { siteId } : {}),
    ...(cameraId ? { cameraId } : {}),
    ...(alarmType ? { alarmType } : {}),
    ...(assessmentStatus ? { assessmentStatus } : {}),
    ...(operatorUserId ? { operatorUserId } : {}),
    ...(closureReasonId ? { closureReasonId } : {}),
    ...(lifecycleScope ? { lifecycleScope } : {}),
    ...(disturbanceType ? { disturbanceType } : {}),
    ...(parsedLimit !== undefined ? { limit: parsedLimit } : {})
  }) as AlarmArchiveFilter;
}

export function readAlarmInstructionContext(searchParams: URLSearchParams): {
  timeContext?: AlarmInstructionTimeContext;
  specialContextLabel?: string;
} {
  const timeContext = normalizeSearchParam(searchParams.get("timeContext")) as AlarmInstructionTimeContext | undefined;
  const specialContextLabel = normalizeSearchParam(searchParams.get("specialContextLabel"));

  if (timeContext && !(alarmInstructionTimeContexts as readonly string[]).includes(timeContext)) {
    throw new AppError("Alarm instruction query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "timeContext has an unsupported value."
    });
  }

  return compactOptionalProperties({
    ...(timeContext ? { timeContext } : {}),
    ...(specialContextLabel ? { specialContextLabel } : {})
  });
}

export function readMonitoringPipelineFilter(searchParams: URLSearchParams): MonitoringPipelineFilter {
  const siteId = normalizeSearchParam(searchParams.get("siteId"));
  const priority = normalizeSearchParam(searchParams.get("priority"));
  const siteTechnicalStatus = normalizeSearchParam(searchParams.get("siteTechnicalStatus"));
  const limit = normalizeSearchParam(searchParams.get("limit"));

  if (priority && !(monitoringPriorities as readonly string[]).includes(priority)) {
    throw new AppError("Monitoring pipeline query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "priority has an unsupported value."
    });
  }

  if (siteTechnicalStatus && !(siteTechnicalOverallStatuses as readonly string[]).includes(siteTechnicalStatus)) {
    throw new AppError("Monitoring pipeline query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "siteTechnicalStatus has an unsupported value."
    });
  }

  const parsedLimit = limit ? Number(limit) : undefined;
  if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
    throw new AppError("Monitoring pipeline query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "limit must be a positive integer."
    });
  }

  return compactOptionalProperties({
    ...(siteId ? { siteId } : {}),
    ...(priority ? { priority } : {}),
    ...(siteTechnicalStatus ? { siteTechnicalStatus } : {}),
    ...(parsedLimit !== undefined ? { limit: parsedLimit } : {})
  }) as MonitoringPipelineFilter;
}

export function readAlarmMediaAccessMode(searchParams: URLSearchParams): AlarmMediaAccessMode {
  const mode = normalizeSearchParam(searchParams.get("mode")) ?? "inline";
  if (!(alarmMediaAccessModes as readonly string[]).includes(mode)) {
    throw new AppError("Alarm media query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "mode has an unsupported value."
    });
  }

  return mode as AlarmMediaAccessMode;
}

export function readReportingFilter(searchParams: URLSearchParams): ReportingFilter {
  const period = normalizeSearchParam(searchParams.get("period")) ?? "day";
  const dateFrom = normalizeSearchParam(searchParams.get("dateFrom"));
  const dateTo = normalizeSearchParam(searchParams.get("dateTo"));
  const customerId = normalizeSearchParam(searchParams.get("customerId"));
  const siteId = normalizeSearchParam(searchParams.get("siteId"));
  const cameraId = normalizeSearchParam(searchParams.get("cameraId"));
  const alarmType = normalizeSearchParam(searchParams.get("alarmType"));
  const operatorUserId = normalizeSearchParam(searchParams.get("operatorUserId"));
  const disturbanceType = normalizeSearchParam(searchParams.get("disturbanceType"));
  const groupBy = normalizeSearchParam(searchParams.get("groupBy"));

  if (!(reportingPeriods as readonly string[]).includes(period)) {
    throw new AppError("Reporting query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "period has an unsupported value."
    });
  }

  if (alarmType && !(alarmTypes as readonly string[]).includes(alarmType)) {
    throw new AppError("Reporting query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "alarmType has an unsupported value."
    });
  }

  if (disturbanceType && !(monitoringDisturbanceTypes as readonly string[]).includes(disturbanceType)) {
    throw new AppError("Reporting query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "disturbanceType has an unsupported value."
    });
  }

  if (groupBy && !(reportingGroupDimensions as readonly string[]).includes(groupBy)) {
    throw new AppError("Reporting query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "groupBy has an unsupported value."
    });
  }

  return compactOptionalProperties({
    period,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(customerId ? { customerId } : {}),
    ...(siteId ? { siteId } : {}),
    ...(cameraId ? { cameraId } : {}),
    ...(alarmType ? { alarmType } : {}),
    ...(operatorUserId ? { operatorUserId } : {}),
    ...(disturbanceType ? { disturbanceType } : {}),
    ...(groupBy ? { groupBy } : {})
  }) as ReportingFilter;
}

export function readShiftPlanningFilter(searchParams: URLSearchParams): ShiftPlanningFilter {
  const period = normalizeSearchParam(searchParams.get("period")) ?? "week";
  const dateFrom = normalizeSearchParam(searchParams.get("dateFrom"));
  const dateTo = normalizeSearchParam(searchParams.get("dateTo"));
  const planningState = normalizeSearchParam(searchParams.get("planningState"));
  const userId = normalizeSearchParam(searchParams.get("userId"));

  if (!(shiftPlanningPeriods as readonly string[]).includes(period)) {
    throw new AppError("Shift planning query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "period has an unsupported value."
    });
  }

  if (planningState && !(shiftPlanningStates as readonly string[]).includes(planningState)) {
    throw new AppError("Shift planning query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "planningState has an unsupported value."
    });
  }

  if (period === "custom" && (!dateFrom || !dateTo)) {
    throw new AppError("Shift planning query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "dateFrom and dateTo are required for custom periods."
    });
  }

  return compactOptionalProperties({
    period,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(planningState ? { planningState } : {}),
    ...(userId ? { userId } : {})
  }) as ShiftPlanningFilter;
}

export function readAlarmCaseExportFormat(searchParams: URLSearchParams): AlarmCaseExportFormat {
  const format = normalizeSearchParam(searchParams.get("format")) ?? "case_report";
  if (!(alarmCaseExportFormats as readonly string[]).includes(format)) {
    throw new AppError("Alarm case export query is invalid.", {
      status: 400,
      code: "HTTP_QUERY_VALIDATION_FAILED",
      detail: "format has an unsupported value."
    });
  }
  return format as AlarmCaseExportFormat;
}

function compactOptionalProperties<TValue extends Record<string, unknown>>(value: TValue): TValue {
  const compacted: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      compacted[key] = entry;
    }
  }

  return compacted as TValue;
}

function normalizeSearchParam(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
