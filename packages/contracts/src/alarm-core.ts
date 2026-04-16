/**
 * Gemeinsame Vertraege fuer den fachlichen Alarm-Core.
 *
 * Die Datei enthaelt den zentralen Typkatalog fuer Alarmfaelle, Medien,
 * Pipeline, Bewertungen, Aktionen, Archiv, Ingestion und zugehoerige
 * Hilfskataloge. Backend, Frontend und Worker beziehen hieraus dieselbe
 * fachliche Sprache.
 */
export const alarmPriorities = ["low", "normal", "high", "critical"] as const;
export const alarmTypes = [
  "motion",
  "line_crossing",
  "area_entry",
  "sabotage",
  "video_loss",
  "camera_offline",
  "nvr_offline",
  "router_offline",
  "technical",
  "other_disturbance"
] as const;
export const alarmLifecycleStatuses = ["received", "queued", "reserved", "in_progress", "resolved", "archived"] as const;
export const alarmAssessmentStatuses = ["pending", "confirmed_incident", "false_positive"] as const;
export const alarmTechnicalStates = ["complete", "incomplete"] as const;
export const alarmResponseDeadlineStates = ["within_deadline", "due_soon", "overdue", "met"] as const;
export const alarmEventKinds = [
  "case_created",
  "payload_updated",
  "status_changed",
  "assessment_changed",
  "technical_state_changed",
  "media_attached",
  "assignment_changed",
  "comment_added",
  "action_documented",
  "follow_up_updated",
  "follow_up_cleared"
] as const;
export const alarmMediaKinds = ["snapshot", "clip", "audio", "thermal", "document", "other"] as const;
export const alarmMediaInboxStatuses = ["pending", "attached", "duplicate", "orphaned", "error"] as const;
export const mediaBundleProfileKeys = [
  "three_images_one_clip",
  "single_snapshot",
  "clip_only",
  "nvr_channel_snapshot_clip",
  "event_without_media"
] as const;
export const alarmAssignmentKinds = ["owner"] as const;
export const alarmAssignmentStatuses = ["active", "released"] as const;
export const alarmCommentKinds = ["operator_note", "closure_note", "technical_note"] as const;
export const alarmActionTypeCodes = [
  "call_police",
  "call_security_service",
  "call_customer",
  "speaker_live_announcement",
  "speaker_pre_recorded_announcement"
] as const;
export const alarmActionStatusCodes = [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "not_reachable",
  "not_required"
] as const;
export const alarmInstructionTimeContexts = ["normal", "weekend", "special"] as const;

export type AlarmPriority = (typeof alarmPriorities)[number];
export type AlarmType = (typeof alarmTypes)[number];
export type AlarmLifecycleStatus = (typeof alarmLifecycleStatuses)[number];
export type AlarmAssessmentStatus = (typeof alarmAssessmentStatuses)[number];
export type AlarmTechnicalState = (typeof alarmTechnicalStates)[number];
export type AlarmResponseDeadlineState = (typeof alarmResponseDeadlineStates)[number];
export type AlarmEventKind = (typeof alarmEventKinds)[number];
export type AlarmMediaKind = (typeof alarmMediaKinds)[number];
export type AlarmMediaInboxStatus = (typeof alarmMediaInboxStatuses)[number];
export type MediaBundleProfileKey = (typeof mediaBundleProfileKeys)[number];
export type AlarmAssignmentKind = (typeof alarmAssignmentKinds)[number];
export type AlarmAssignmentStatus = (typeof alarmAssignmentStatuses)[number];
export type AlarmCommentKind = (typeof alarmCommentKinds)[number];
export type AlarmActionTypeCode = (typeof alarmActionTypeCodes)[number];
export type AlarmActionStatusCode = (typeof alarmActionStatusCodes)[number];
export type AlarmInstructionTimeContext = (typeof alarmInstructionTimeContexts)[number];

export type AlarmCaseRecord = {
  id: string;
  siteId: string;
  primaryDeviceId?: string;
  externalSourceRef?: string;
  alarmType: AlarmType;
  priority: AlarmPriority;
  priorityRank: number;
  lifecycleStatus: AlarmLifecycleStatus;
  assessmentStatus: AlarmAssessmentStatus;
  technicalState: AlarmTechnicalState;
  incompleteReason?: string;
  title: string;
  description?: string;
  sourceOccurredAt?: string;
  receivedAt: string;
  firstOpenedAt?: string;
  resolvedAt?: string;
  followUpAt?: string;
  followUpNote?: string;
  responseDueAt?: string;
  responseDeadlineState: AlarmResponseDeadlineState;
  isEscalationReady: boolean;
  closureReasonId?: string;
  closedByUserId?: string;
  closureComment?: string;
  archivedAt?: string;
  archivedByUserId?: string;
  lastEventAt: string;
  sourcePayload?: Record<string, unknown>;
  technicalDetails?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AlarmEventRecord = {
  id: string;
  alarmCaseId: string;
  eventKind: AlarmEventKind;
  actorUserId?: string;
  occurredAt: string;
  message?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

export type AlarmMediaRecord = {
  id: string;
  alarmCaseId: string;
  deviceId?: string;
  mediaKind: AlarmMediaKind;
  storageKey: string;
  mimeType?: string;
  capturedAt?: string;
  isPrimary: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type ParsedVendorMediaResult = {
  vendor: string;
  sourceType: string;
  parserKey: string;
  filename: string;
  relativePath?: string;
  sourceId: string;
  sourceName?: string;
  channelId?: string;
  channelNumber?: number;
  eventType: string;
  eventTs: string;
  vendorEventId?: string;
  externalDeviceId?: string;
  externalRecorderId?: string;
  serialNumber?: string;
  correlationKey: string;
  mediaKind: AlarmMediaKind;
  mediaType: "image" | "clip";
  sequenceNo?: number;
  issues?: string[];
};

export type AlarmMediaBundleSummary = {
  correlationKey: string;
  vendor: string;
  sourceType: string;
  sourceId: string;
  eventType: string;
  eventTs: string;
  mediaBundleProfileKey: MediaBundleProfileKey;
  expectedImages: number;
  expectedClips: number;
  receivedImages: number;
  receivedClips: number;
  completenessState: "empty" | "partial" | "complete";
  siteId?: string;
  componentId?: string;
  nvrComponentId?: string;
  channelId?: string;
  vendorEventId?: string;
  mediaIds: string[];
};

export type AlarmAssignmentRecord = {
  id: string;
  alarmCaseId: string;
  userId: string;
  assignmentKind: AlarmAssignmentKind;
  assignmentStatus: AlarmAssignmentStatus;
  assignedAt: string;
  releasedAt?: string;
  releaseReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type AlarmCommentRecord = {
  id: string;
  alarmCaseId: string;
  userId: string;
  commentKind: AlarmCommentKind;
  body: string;
  context?: string;
  createdAt: string;
  updatedAt: string;
  userDisplayName?: string;
};

export type AlarmFalsePositiveReason = {
  id: string;
  code: string;
  label: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
};

export type AlarmClosureReason = {
  id: string;
  code: string;
  label: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
};

export type AlarmActionTypeCatalogEntry = {
  id: string;
  code: AlarmActionTypeCode;
  label: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
};

export type AlarmActionStatusCatalogEntry = {
  id: string;
  code: AlarmActionStatusCode;
  label: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
};

export type AlarmWorkflowChecklistStep = {
  id: string;
  profileId: string;
  stepCode: string;
  title: string;
  instruction?: string;
  sortOrder: number;
  isRequiredByDefault: boolean;
  actionTypeId?: string;
  actionTypeCode?: AlarmActionTypeCode;
  actionTypeLabel?: string;
  activeFromTime?: string;
  activeToTime?: string;
};

export type AlarmWorkflowProfile = {
  id: string;
  siteId: string;
  siteName: string;
  code: string;
  label: string;
  description?: string;
  timeContext: AlarmInstructionTimeContext;
  specialContextLabel?: string;
  isActive: boolean;
  sortOrder: number;
  activeFromTime?: string;
  activeToTime?: string;
  steps: AlarmWorkflowChecklistStep[];
};

export type AlarmWorkflowProfileFilter = {
  siteId?: string;
  timeContext?: AlarmInstructionTimeContext;
};

export type AlarmWorkflowProfileUpsertStepInput = {
  id?: string;
  stepCode: string;
  title: string;
  instruction?: string;
  sortOrder: number;
  isRequiredByDefault: boolean;
  actionTypeId?: string;
  activeFromTime?: string;
  activeToTime?: string;
};

export type AlarmWorkflowProfileUpsertInput = {
  id?: string;
  siteId: string;
  code: string;
  label: string;
  description?: string;
  timeContext: AlarmInstructionTimeContext;
  specialContextLabel?: string;
  activeFromTime?: string;
  activeToTime?: string;
  isActive: boolean;
  sortOrder: number;
  steps: AlarmWorkflowProfileUpsertStepInput[];
};

export type AlarmInstructionContext = {
  siteId: string;
  timeContext: AlarmInstructionTimeContext;
  specialContextLabel?: string;
  profiles: AlarmWorkflowProfile[];
};

export type AlarmActionRecord = {
  id: string;
  alarmCaseId: string;
  actionTypeId: string;
  actionTypeCode: AlarmActionTypeCode;
  actionTypeLabel: string;
  statusId: string;
  statusCode: AlarmActionStatusCode;
  statusLabel: string;
  userId: string;
  userDisplayName?: string;
  comment: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AlarmCaseCreateInput = {
  id?: string;
  siteId: string;
  primaryDeviceId?: string;
  externalSourceRef?: string;
  alarmType: AlarmType;
  priority: AlarmPriority;
  lifecycleStatus: AlarmLifecycleStatus;
  assessmentStatus: AlarmAssessmentStatus;
  technicalState: AlarmTechnicalState;
  incompleteReason?: string;
  title: string;
  description?: string;
  sourceOccurredAt?: string;
  receivedAt?: string;
  firstOpenedAt?: string;
  resolvedAt?: string;
  closureReasonId?: string;
  closedByUserId?: string;
  closureComment?: string;
  archivedAt?: string;
  archivedByUserId?: string;
  sourcePayload?: Record<string, unknown>;
  technicalDetails?: Record<string, unknown>;
};

export type AlarmEventCreateInput = {
  id?: string;
  alarmCaseId: string;
  eventKind: AlarmEventKind;
  actorUserId?: string;
  occurredAt?: string;
  message?: string;
  payload?: Record<string, unknown>;
};

export type AlarmMediaCreateInput = {
  id?: string;
  alarmCaseId: string;
  deviceId?: string;
  mediaKind: AlarmMediaKind;
  storageKey: string;
  mimeType?: string;
  capturedAt?: string;
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
};

export type AlarmAssignmentCreateInput = {
  id?: string;
  alarmCaseId: string;
  userId: string;
  assignmentKind: AlarmAssignmentKind;
  assignmentStatus?: AlarmAssignmentStatus;
  assignedAt?: string;
  releasedAt?: string;
  releaseReason?: string;
};

export type AlarmCommentCreateInput = {
  id?: string;
  alarmCaseId: string;
  userId: string;
  commentKind: AlarmCommentKind;
  body: string;
  context?: string;
};

export type AlarmActionCreateInput = {
  id?: string;
  alarmCaseId: string;
  actionTypeId: string;
  statusId: string;
  userId: string;
  comment: string;
  occurredAt?: string;
};

export type AlarmIngestionMediaInput = {
  deviceId?: string;
  mediaKind?: string;
  storageKey: string;
  mimeType?: string;
  capturedAt?: string;
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
};

export type AlarmIngestionRequest = {
  siteId: string;
  primaryDeviceId?: string;
  externalSourceRef?: string;
  alarmType?: string;
  priority?: string;
  title?: string;
  description?: string;
  sourceOccurredAt?: string;
  sourcePayload?: Record<string, unknown>;
  technicalDetails?: Record<string, unknown>;
  media?: AlarmIngestionMediaInput[];
};

export type AlarmIngestionResult = {
  alarmCase: AlarmCaseRecord;
  events: AlarmEventRecord[];
  media: AlarmMediaRecord[];
  acceptedAsTechnicalError: boolean;
};

export type ExternalAlarmDeviceReference = {
  deviceId?: string;
  deviceSerialNumber?: string;
  deviceNetworkAddress?: string;
  externalDeviceId?: string;
  externalRecorderId?: string;
  channelNumber?: number;
  analyticsName?: string;
  sourceName?: string;
  eventNamespace?: string;
};

export type ExternalAlarmMediaInput = ExternalAlarmDeviceReference & {
  mediaKind?: string;
  storageKey: string;
  mimeType?: string;
  capturedAt?: string;
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
};

export type ExternalAlarmMediaIngestionRequest = {
  vendor: string;
  sourceType: string;
  storageKey: string;
  filename?: string;
  relativePath?: string;
  mimeType?: string;
  capturedAt?: string;
  uploadedAt?: string;
  metadata?: Record<string, unknown>;
};

export type ExternalAlarmMediaIngestionResult = {
  status: "attached" | "pending" | "duplicate" | "orphaned";
  inboxId: string;
  correlationKey?: string;
  matchedAlarmCaseId?: string;
  attachedMediaId?: string;
  parseError?: string;
  parsedMedia?: ParsedVendorMediaResult;
  bundle?: AlarmMediaBundleSummary;
};

export type AlarmMediaInboxFilter = {
  status?: AlarmMediaInboxStatus;
  limit?: number;
  siteId?: string;
  vendor?: string;
};

export type AlarmMediaInboxItem = {
  id: string;
  status: AlarmMediaInboxStatus;
  vendor: string;
  sourceType: string;
  filename?: string;
  storageKey: string;
  correlationKey?: string;
  parsedTimestamp?: string;
  matchedAlarmCaseId?: string;
  createdAt: string;
  updatedAt: string;
  errorReason?: string;
};

export type AlarmMediaInboxResult = {
  items: AlarmMediaInboxItem[];
  filter: AlarmMediaInboxFilter;
};

export type ExternalAlarmIngestionRequest = ExternalAlarmDeviceReference & {
  sourceSystem: string;
  sourceType: string;
  externalEventId: string;
  siteId?: string;
  eventType: string;
  eventTime: string;
  severity?: string;
  title?: string;
  description?: string;
  zone?: string;
  cameraName?: string;
  rawPayload?: Record<string, unknown>;
  media?: ExternalAlarmMediaInput[];
};

export type ExternalAlarmIngestionResolution = {
  sourceSystem: string;
  sourceType: string;
  externalEventId: string;
  externalSourceRef: string;
  siteId: string;
  primaryDeviceId?: string;
  mappingId?: string;
  matchedBy?: "direct_device_id" | "alarm_source_mapping" | "serial_number" | "network_address";
};

export type ExternalAlarmIngestionResult = AlarmIngestionResult & {
  duplicate: boolean;
  resolution: ExternalAlarmIngestionResolution;
};

export type DahuaNvrAlarmMediaInput = {
  mediaType: "snapshot" | "clip";
  url: string;
  mimeType?: string;
  capturedAt?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  metadata?: Record<string, unknown>;
};

export type DahuaNvrAlarmIngestionRequest = {
  sourceEventId: string;
  eventCode: string;
  eventTime: string;
  siteId?: string;
  recorderSerialNumber?: string;
  recorderIp?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  channel?: number;
  cameraName?: string;
  eventAction?: string;
  severity?: string;
  zone?: string;
  ruleName?: string;
  description?: string;
  media?: DahuaNvrAlarmMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type GrundigGuRnAc5104nAlarmMediaInput = {
  mediaType: "snapshot" | "clip";
  url: string;
  mimeType?: string;
  capturedAt?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  metadata?: Record<string, unknown>;
};

export type GrundigGuRnAc5104nAlarmIngestionRequest = {
  sourceEventId: string;
  eventCode: string;
  eventTime: string;
  siteId?: string;
  recorderId?: string;
  recorderSerialNumber?: string;
  recorderIp?: string;
  cameraId?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  channel?: number;
  cameraName?: string;
  eventAction?: string;
  severity?: string;
  zone?: string;
  ruleName?: string;
  description?: string;
  media?: GrundigGuRnAc5104nAlarmMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type AjaxHub2FourGJewellerAlarmMediaInput = {
  mediaType: "snapshot" | "document";
  url: string;
  mimeType?: string;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
};

export type AjaxHub2FourGJewellerAlarmIngestionRequest = {
  sourceEventId: string;
  hubId?: string;
  hubName?: string;
  hubExternalId?: string;
  eventCode?: string;
  eventType: string;
  eventSubType?: string;
  eventTime: string;
  siteId?: string;
  deviceId?: string;
  detectorId?: string;
  deviceName?: string;
  room?: string;
  zone?: string;
  group?: string;
  partition?: string;
  user?: string;
  triggerSource?: string;
  severity?: string;
  title?: string;
  description?: string;
  media?: AjaxHub2FourGJewellerAlarmMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type AjaxCloudCmsCollectorStubMediaInput = {
  mediaType: "snapshot" | "document";
  uri: string;
  mimeType?: string;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
};

export type AjaxCloudCmsCollectorStubRequest = {
  sourceEventId: string;
  collectorSource?: "cloud_signaling" | "cms" | "enterprise_api";
  hubId?: string;
  hubName?: string;
  hubExternalId?: string;
  eventType: string;
  eventCode?: string;
  eventSubType?: string;
  occurredAt: string;
  siteId?: string;
  deviceId?: string;
  detectorId?: string;
  deviceName?: string;
  room?: string;
  zone?: string;
  group?: string;
  partition?: string;
  user?: string;
  triggerSource?: string;
  severity?: string;
  title?: string;
  description?: string;
  media?: AjaxCloudCmsCollectorStubMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type AjaxNvr8chAlarmMediaInput = {
  mediaType: "snapshot" | "clip" | "archive_reference";
  url: string;
  mimeType?: string;
  capturedAt?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  metadata?: Record<string, unknown>;
};

export type AjaxNvr8chAlarmIngestionRequest = {
  sourceEventId: string;
  eventCode: string;
  eventTime: string;
  eventType?: string;
  siteId?: string;
  siteExternalHint?: string;
  nvrId?: string;
  nvrName?: string;
  nvrSerialNumber?: string;
  nvrIp?: string;
  cameraId?: string;
  cameraName?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  channel?: number;
  severity?: string;
  zone?: string;
  ruleName?: string;
  description?: string;
  media?: AjaxNvr8chAlarmMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type GrundigGuSeriesIpCameraAlarmMediaInput = {
  mediaType: "snapshot" | "clip";
  url: string;
  mimeType?: string;
  capturedAt?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  metadata?: Record<string, unknown>;
};

export type GrundigGuSeriesIpCameraAlarmIngestionRequest = {
  sourceEventId: string;
  eventCode: string;
  eventTime: string;
  eventType?: string;
  siteId?: string;
  siteExternalHint?: string;
  cameraId?: string;
  cameraName?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  severity?: string;
  zone?: string;
  ruleName?: string;
  analyticsName?: string;
  description?: string;
  media?: GrundigGuSeriesIpCameraAlarmMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type HikvisionIpCameraAlarmMediaInput = {
  mediaType: "snapshot" | "clip";
  url: string;
  mimeType?: string;
  capturedAt?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  metadata?: Record<string, unknown>;
};

export type HikvisionIpCameraAlarmIngestionRequest = {
  sourceEventId: string;
  eventCode: string;
  eventTime: string;
  eventType?: string;
  siteId?: string;
  siteExternalHint?: string;
  cameraId?: string;
  cameraName?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  severity?: string;
  zone?: string;
  ruleName?: string;
  analyticsName?: string;
  description?: string;
  media?: HikvisionIpCameraAlarmMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type HikvisionNvrAlarmMediaInput = {
  mediaType: "snapshot" | "clip";
  url: string;
  mimeType?: string;
  capturedAt?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  metadata?: Record<string, unknown>;
};

export type HikvisionNvrAlarmIngestionRequest = {
  sourceEventId: string;
  eventCode: string;
  eventTime: string;
  eventType?: string;
  siteId?: string;
  siteExternalHint?: string;
  nvrId?: string;
  nvrName?: string;
  nvrSerialNumber?: string;
  nvrIp?: string;
  cameraId?: string;
  cameraName?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  channel?: number;
  severity?: string;
  zone?: string;
  ruleName?: string;
  description?: string;
  media?: HikvisionNvrAlarmMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type AxisIpCameraAlarmMediaInput = {
  mediaType: "snapshot" | "clip";
  url: string;
  mimeType?: string;
  capturedAt?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  metadata?: Record<string, unknown>;
};

export type AxisIpCameraAlarmIngestionRequest = {
  sourceEventId: string;
  eventCode: string;
  eventTime: string;
  eventType?: string;
  siteId?: string;
  siteExternalHint?: string;
  cameraId?: string;
  cameraName?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  severity?: string;
  zone?: string;
  ruleName?: string;
  analyticsName?: string;
  description?: string;
  media?: AxisIpCameraAlarmMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type AxisNvrAlarmMediaInput = {
  mediaType: "snapshot" | "clip";
  url: string;
  mimeType?: string;
  capturedAt?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  metadata?: Record<string, unknown>;
};

export type AxisNvrAlarmIngestionRequest = {
  sourceEventId: string;
  eventCode: string;
  eventTime: string;
  eventType?: string;
  siteId?: string;
  siteExternalHint?: string;
  nvrId?: string;
  nvrName?: string;
  nvrSerialNumber?: string;
  nvrIp?: string;
  cameraId?: string;
  cameraName?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  channel?: number;
  severity?: string;
  zone?: string;
  ruleName?: string;
  description?: string;
  media?: AxisNvrAlarmMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type UniviewIpCameraAlarmMediaInput = {
  mediaType: "snapshot" | "clip";
  url: string;
  mimeType?: string;
  capturedAt?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  metadata?: Record<string, unknown>;
};

export type UniviewIpCameraAlarmIngestionRequest = {
  sourceEventId: string;
  eventCode: string;
  eventTime: string;
  eventType?: string;
  siteId?: string;
  siteExternalHint?: string;
  cameraId?: string;
  cameraName?: string;
  cameraSerialNumber?: string;
  cameraIp?: string;
  severity?: string;
  zone?: string;
  ruleName?: string;
  analyticsName?: string;
  description?: string;
  media?: UniviewIpCameraAlarmMediaInput[];
  rawPayload?: Record<string, unknown>;
};

export type AlarmPipelineFilter = {
  siteId?: string;
  alarmType?: AlarmType;
  technicalState?: AlarmTechnicalState;
  limit?: number;
};

export type AlarmPipelineItem = AlarmCaseRecord & {
  siteName: string;
  customerName: string;
  primaryDeviceName?: string;
  mediaCount: number;
  eventCount: number;
  hasTechnicalIssue: boolean;
  activeAssignment?: {
    userId: string;
    displayName: string;
    assignmentStatus: AlarmAssignmentStatus;
    assignedAt: string;
  };
};

export type AlarmPipelineResult = {
  items: AlarmPipelineItem[];
  filters: AlarmPipelineFilter;
};

export type AlarmReservationInput = {
  targetUserId?: string;
  override?: boolean;
  reason?: string;
};

export type AlarmReleaseInput = {
  reason?: string;
  override?: boolean;
};

export type AlarmAssignmentActionResult = {
  alarmCase: AlarmCaseRecord;
  assignment?: AlarmAssignmentRecord;
  releasedAssignmentId?: string;
};

export type AlarmAcknowledgeInput = {
  comment?: string;
};

export type AlarmAssessmentUpdateInput = {
  assessmentStatus: AlarmAssessmentStatus;
  falsePositiveReasonIds?: string[];
};

export type AlarmCommentInput = {
  body: string;
  commentKind?: AlarmCommentKind;
  context?: string;
};

export type AlarmFollowUpInput = {
  followUpAt?: string;
  note?: string;
  clear?: boolean;
};

export type AlarmActionInput = {
  actionTypeId: string;
  statusId: string;
  comment: string;
  occurredAt?: string;
};

export type AlarmCloseInput = {
  closureReasonId: string;
  comment?: string;
};

export type AlarmArchiveInput = {
  comment?: string;
};

export type AlarmAcknowledgeActionResult = {
  alarmCase: AlarmCaseRecord;
};

export type AlarmAssessmentActionResult = {
  alarmCase: AlarmCaseRecord;
  falsePositiveReasons: AlarmFalsePositiveReason[];
};

export type AlarmFollowUpActionResult = {
  alarmCase: AlarmCaseRecord;
};

export type AlarmCommentActionResult = {
  comment: AlarmCommentRecord;
};

export type AlarmActionDocumentResult = {
  action: AlarmActionRecord;
};

export type AlarmCloseActionResult = {
  alarmCase: AlarmCaseRecord;
  closureReason: AlarmClosureReason;
};

export type AlarmArchiveActionResult = {
  alarmCase: AlarmCaseRecord;
};

export type AlarmCaseDetail = {
  alarmCase: AlarmCaseRecord;
  events: AlarmEventRecord[];
  media: AlarmMediaRecord[];
  mediaBundles: AlarmMediaBundleSummary[];
  assignments: AlarmAssignmentRecord[];
  comments: AlarmCommentRecord[];
  actions: AlarmActionRecord[];
  instructionContext: AlarmInstructionContext;
  falsePositiveReasons: AlarmFalsePositiveReason[];
  closureReason?: AlarmClosureReason;
  isArchived: boolean;
};

export type AlarmCatalogs = {
  falsePositiveReasons: AlarmFalsePositiveReason[];
  closureReasons: AlarmClosureReason[];
  actionTypes: AlarmActionTypeCatalogEntry[];
  actionStatuses: AlarmActionStatusCatalogEntry[];
  workflowProfiles: AlarmWorkflowProfile[];
};

export const alarmCaseExportFormats = ["case_report", "pdf", "excel"] as const;
export type AlarmCaseExportFormat = (typeof alarmCaseExportFormats)[number];
export const alarmArchivePeriods = ["day", "week", "month", "year", "custom"] as const;
export const alarmArchiveLifecycleScopes = ["archived", "resolved", "open", "all"] as const;
export const alarmMediaAccessModes = ["inline", "download"] as const;
export type AlarmArchivePeriod = (typeof alarmArchivePeriods)[number];
export type AlarmArchiveLifecycleScope = (typeof alarmArchiveLifecycleScopes)[number];
export type AlarmMediaAccessMode = (typeof alarmMediaAccessModes)[number];

export type AlarmCaseReportActor = {
  id: string;
  displayName: string;
  primaryRole: string;
};

export type AlarmCaseReport = {
  generatedAt: string;
  generatedBy: AlarmCaseReportActor;
  alarmCase: AlarmCaseRecord;
  site: {
    id: string;
    siteName: string;
    customerId: string;
    customerName: string;
    address: string;
  };
  primaryDevice?: {
    id: string;
    name: string;
    type: string;
  };
  actors: AlarmCaseReportActor[];
  events: AlarmEventRecord[];
  media: AlarmMediaRecord[];
  assignments: Array<AlarmAssignmentRecord & { displayName?: string }>;
  comments: AlarmCommentRecord[];
  actions: AlarmActionRecord[];
  falsePositiveReasons: AlarmFalsePositiveReason[];
  closureReason?: AlarmClosureReason;
  isArchived: boolean;
  narrative: {
    overview: string[];
    progress: string[];
    actions: string[];
    completion: string[];
  };
};

export type AlarmCaseExportDocument = {
  format: AlarmCaseExportFormat;
  filename: string;
  mimeType: string;
  contentBase64: string;
};

export type AlarmArchiveFilter = {
  period: AlarmArchivePeriod;
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  siteId?: string;
  cameraId?: string;
  alarmType?: AlarmType;
  assessmentStatus?: AlarmAssessmentStatus;
  operatorUserId?: string;
  closureReasonId?: string;
  lifecycleScope?: AlarmArchiveLifecycleScope;
  disturbanceType?: string;
  limit?: number;
};

export type AlarmArchiveItem = AlarmCaseRecord & {
  siteName: string;
  customerName: string;
  primaryDeviceName?: string;
  closureReasonLabel?: string;
  closedByDisplayName?: string;
  archivedByDisplayName?: string;
  mediaCount: number;
  eventCount: number;
};

export type AlarmArchiveResult = {
  items: AlarmArchiveItem[];
  filters: AlarmArchiveFilter;
};

export type AlarmMediaAccessDocument = {
  mediaId: string;
  alarmCaseId: string;
  mode: AlarmMediaAccessMode;
  filename: string;
  mimeType: string;
  contentBase64: string;
  title: string;
  sourceKind: "embedded" | "reference_preview";
};
