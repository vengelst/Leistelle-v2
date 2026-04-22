/**
 * Definiert die internen Typen und Servicevertraege des Alarm-Core-Moduls.
 */
import type {
  AlarmActionCreateInput,
  AlarmActionRecord,
  AlarmActionStatusCatalogEntry,
  AlarmActionTypeCatalogEntry,
  AlarmArchiveFilter,
  AlarmArchiveItem,
  AlarmAssignmentCreateInput,
  AlarmAssignmentRecord,
  AlarmCaseDetail,
  AlarmCaseCreateInput,
  AlarmCaseRecord,
  AlarmClosureReason,
  AlarmCommentCreateInput,
  AlarmCommentRecord,
  AlarmEventCreateInput,
  AlarmEventRecord,
  AlarmFalsePositiveReason,
  AlarmMediaInboxFilter,
  AlarmMediaBundleSummary,
  AlarmMediaCreateInput,
  AlarmMediaRecord,
  MediaBundleProfileKey,
  AlarmInstructionContext,
  AlarmPipelineFilter,
  ParsedVendorMediaResult,
  AlarmPipelineItem,
  AlarmWorkflowProfile,
  AlarmWorkflowProfileFilter,
  AlarmWorkflowProfileUpsertInput
} from "@leitstelle/contracts";

export type AlarmCaseEntity = AlarmCaseRecord;
export type AlarmEventEntity = AlarmEventRecord;
export type AlarmMediaEntity = AlarmMediaRecord;
export type AlarmAssignmentEntity = AlarmAssignmentRecord;
export type AlarmPipelineEntity = AlarmPipelineItem;
export type AlarmCommentEntity = AlarmCommentRecord;
export type AlarmActionEntity = AlarmActionRecord;

export type ActiveOwnerAssignment = AlarmAssignmentRecord & {
  displayName: string;
};

export type AlarmMediaAccessContext = {
  alarmCase: AlarmCaseRecord;
  media: AlarmMediaRecord;
  siteName: string;
  customerName: string;
  deviceName?: string;
};

export type AlarmSourceMappingResolution = {
  mappingId: string;
  siteId: string;
  componentId: string;
  nvrComponentId?: string;
  mediaBundleProfileKey?: MediaBundleProfileKey;
  matchedFields: string[];
};

export type VendorMediaInboxEntry = {
  id: string;
  vendor: string;
  sourceType: string;
  parserKey?: string;
  mediaBundleProfileKey?: MediaBundleProfileKey;
  storageKey: string;
  originalFilename?: string;
  relativePath?: string;
  mimeType?: string;
  mediaKind: AlarmMediaRecord["mediaKind"];
  sequenceNo?: number;
  sourceId?: string;
  channelId?: string;
  eventType?: string;
  eventTs?: string;
  vendorEventId?: string;
  correlationKey?: string;
  siteId?: string;
  componentId?: string;
  nvrComponentId?: string;
  alarmCaseId?: string;
  attachedMediaId?: string;
  status: "pending" | "attached" | "duplicate" | "orphaned" | "error";
  parseError?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AlarmCoreStore = {
  createCase: (input: AlarmCaseCreateInput) => Promise<AlarmCaseEntity>;
  appendEvent: (input: AlarmEventCreateInput) => Promise<AlarmEventEntity>;
  attachMedia: (input: AlarmMediaCreateInput) => Promise<AlarmMediaEntity>;
  createAssignment: (input: AlarmAssignmentCreateInput) => Promise<AlarmAssignmentEntity>;
  createComment: (input: AlarmCommentCreateInput) => Promise<AlarmCommentEntity>;
  createAction: (input: AlarmActionCreateInput) => Promise<AlarmActionEntity>;
  getCaseById: (id: string) => Promise<AlarmCaseEntity | null>;
  listOpenCases: (filter?: AlarmPipelineFilter) => Promise<AlarmPipelineEntity[]>;
  listArchiveCases: (filter: AlarmArchiveFilter) => Promise<AlarmArchiveItem[]>;
  countTodaysFalsePositives: () => Promise<number>;
  listEventsByCaseId: (alarmCaseId: string) => Promise<AlarmEventEntity[]>;
  listMediaByCaseId: (alarmCaseId: string) => Promise<AlarmMediaEntity[]>;
  listAssignmentsByCaseId: (alarmCaseId: string) => Promise<AlarmAssignmentEntity[]>;
  listCommentsByCaseId: (alarmCaseId: string) => Promise<AlarmCommentEntity[]>;
  listActionsByCaseId: (alarmCaseId: string) => Promise<AlarmActionEntity[]>;
  getCaseDetail: (alarmCaseId: string) => Promise<AlarmCaseDetail | null>;
  getMediaAccessContext: (mediaId: string) => Promise<AlarmMediaAccessContext | null>;
  getActiveOwnerAssignment: (alarmCaseId: string) => Promise<ActiveOwnerAssignment | null>;
  reserveCase: (input: AlarmAssignmentCreateInput) => Promise<AlarmAssignmentEntity>;
  releaseAssignment: (alarmCaseId: string, releasedAt: string, reason?: string) => Promise<AlarmAssignmentEntity | null>;
  updateLifecycleStatus: (alarmCaseId: string, status: AlarmCaseRecord["lifecycleStatus"], openedAt?: string) => Promise<AlarmCaseEntity>;
  updateAssessment: (alarmCaseId: string, assessmentStatus: AlarmCaseRecord["assessmentStatus"]) => Promise<AlarmCaseEntity>;
  updateFollowUp: (alarmCaseId: string, input: { followUpAt?: string; followUpNote?: string }) => Promise<AlarmCaseEntity>;
  closeCase: (alarmCaseId: string, input: { resolvedAt: string; closureReasonId: string; closedByUserId: string; closureComment?: string }) => Promise<AlarmCaseEntity>;
  archiveCase: (alarmCaseId: string, input: { archivedAt: string; archivedByUserId: string }) => Promise<AlarmCaseEntity>;
  replaceFalsePositiveReasons: (alarmCaseId: string, reasonIds: string[]) => Promise<void>;
  listFalsePositiveReasons: () => Promise<AlarmFalsePositiveReason[]>;
  listClosureReasons: () => Promise<AlarmClosureReason[]>;
  listActionTypes: () => Promise<AlarmActionTypeCatalogEntry[]>;
  listActionStatuses: () => Promise<AlarmActionStatusCatalogEntry[]>;
  listWorkflowProfiles: (filter?: AlarmWorkflowProfileFilter) => Promise<AlarmWorkflowProfile[]>;
  upsertWorkflowProfile: (input: AlarmWorkflowProfileUpsertInput) => Promise<AlarmWorkflowProfile>;
  resolveInstructionContextForCase: (alarmCaseId: string, filter?: { timeContext?: AlarmInstructionContext["timeContext"]; specialContextLabel?: string }) => Promise<AlarmInstructionContext | null>;
  getActionTypeById: (actionTypeId: string) => Promise<AlarmActionTypeCatalogEntry | null>;
  getActionStatusById: (statusId: string) => Promise<AlarmActionStatusCatalogEntry | null>;
  listFalsePositiveReasonsForCase: (alarmCaseId: string) => Promise<AlarmFalsePositiveReason[]>;
  getClosureReasonById: (reasonId: string) => Promise<AlarmClosureReason | null>;
  getClosureReasonForCase: (alarmCaseId: string) => Promise<AlarmClosureReason | null>;
  countActiveAssignmentsForUser: (userId: string) => Promise<number>;
  forceReleaseActiveAssignmentsForUser: (userId: string, releasedAt: string, reason?: string) => Promise<number>;
  hasSite: (id: string) => Promise<boolean>;
  hasDevice: (id: string) => Promise<boolean>;
  getCaseByExternalSourceRef: (externalSourceRef: string) => Promise<AlarmCaseEntity | null>;
  resolveSiteIdByDeviceId: (deviceId: string) => Promise<string | null>;
  findCaseByVendorCorrelationKey: (correlationKey: string) => Promise<AlarmCaseEntity | null>;
  findCaseByComponentEventTime: (input: {
    siteId: string;
    componentId: string;
    alarmType: AlarmCaseRecord["alarmType"];
    sourceOccurredAt: string;
    toleranceSeconds?: number;
  }) => Promise<AlarmCaseEntity | null>;
  resolveAlarmSourceMapping: (input: {
    siteId?: string;
    sourceSystem: string;
    sourceType: string;
    externalDeviceId?: string;
    externalRecorderId?: string;
    serialNumber?: string;
    channelNumber?: number;
    analyticsName?: string;
    sourceName?: string;
    eventNamespace?: string;
  }) => Promise<AlarmSourceMappingResolution | null>;
  getVendorMediaInboxByStorageKey: (storageKey: string) => Promise<VendorMediaInboxEntry | null>;
  createVendorMediaInboxEntry: (input: Omit<VendorMediaInboxEntry, "createdAt" | "updatedAt">) => Promise<VendorMediaInboxEntry>;
  updateVendorMediaInboxEntry: (id: string, patch: Partial<Omit<VendorMediaInboxEntry, "id" | "createdAt" | "updatedAt">>) => Promise<VendorMediaInboxEntry>;
  listPendingVendorMediaInboxEntriesForAlarm: (input: {
    vendor: string;
    sourceType: string;
    vendorEventId?: string;
    correlationKey?: string;
    siteId?: string;
    componentId?: string;
    alarmType?: AlarmCaseRecord["alarmType"];
    sourceOccurredAt?: string;
    toleranceSeconds?: number;
  }) => Promise<VendorMediaInboxEntry[]>;
  listVendorMediaInbox: (filter: AlarmMediaInboxFilter) => Promise<VendorMediaInboxEntry[]>;
  resolveDeviceIdBySerialNumber: (serialNumber: string) => Promise<string | null>;
  resolveDeviceIdByNetworkAddress: (networkAddress: string) => Promise<string | null>;
};

export type AlarmMediaBundleSummaryBuilder = (media: AlarmMediaRecord[]) => AlarmMediaBundleSummary[];
export type ParsedVendorMediaBuilder = ParsedVendorMediaResult;