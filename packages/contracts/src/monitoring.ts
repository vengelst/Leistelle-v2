export const monitoringDisturbanceTypes = [
  "router_unreachable",
  "nvr_unreachable",
  "camera_unreachable",
  "site_connection_disturbed",
  "technical_alarm",
  "other_disturbance"
] as const;
export const monitoringPriorities = ["normal", "high", "critical"] as const;
export const monitoringDisturbanceStatuses = ["open", "acknowledged", "resolved"] as const;
export const siteTechnicalOverallStatuses = ["ok", "disturbed", "offline"] as const;
export const monitoringCheckKinds = ["vpn", "ping", "http", "api", "onvif"] as const;
export const monitoringCheckScopes = ["site", "device"] as const;
export const monitoringCheckStateStatuses = ["ok", "failed", "skipped"] as const;
export const monitoringDisturbanceEventKinds = [
  "disturbance_opened",
  "observation_updated",
  "status_changed",
  "note_added",
  "service_case_created"
] as const;
export const monitoringServiceCaseStatuses = ["open", "accepted", "resolved"] as const;

export type MonitoringDisturbanceType = (typeof monitoringDisturbanceTypes)[number];
export type MonitoringPriority = (typeof monitoringPriorities)[number];
export type MonitoringDisturbanceStatus = (typeof monitoringDisturbanceStatuses)[number];
export type SiteTechnicalOverallStatus = (typeof siteTechnicalOverallStatuses)[number];
export type MonitoringCheckKind = (typeof monitoringCheckKinds)[number];
export type MonitoringCheckScope = (typeof monitoringCheckScopes)[number];
export type MonitoringCheckStateStatus = (typeof monitoringCheckStateStatuses)[number];
export type MonitoringDisturbanceEventKind = (typeof monitoringDisturbanceEventKinds)[number];
export type MonitoringServiceCaseStatus = (typeof monitoringServiceCaseStatuses)[number];

export type MonitoringDisturbanceTypeCatalogEntry = {
  id: string;
  code: MonitoringDisturbanceType;
  label: string;
  description?: string;
  defaultPriority: MonitoringPriority;
  isActive: boolean;
  sortOrder: number;
};

export type SiteTechnicalStatusRecord = {
  overallStatus: SiteTechnicalOverallStatus;
  updatedAt: string;
};

export type MonitoringDisturbanceRecord = {
  id: string;
  siteId: string;
  checkTargetId?: string;
  deviceId?: string;
  referenceLabel?: string;
  disturbanceTypeId: string;
  disturbanceTypeCode: MonitoringDisturbanceType;
  disturbanceTypeLabel: string;
  priority: MonitoringPriority;
  priorityRank: number;
  status: MonitoringDisturbanceStatus;
  title: string;
  description?: string;
  comment?: string;
  ownerUserId?: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  createdAt: string;
  updatedAt: string;
};

export type MonitoringDisturbanceCreateInput = {
  id?: string;
  siteId: string;
  checkTargetId?: string;
  deviceId?: string;
  referenceLabel?: string;
  disturbanceTypeId: string;
  priority?: MonitoringPriority;
  status?: MonitoringDisturbanceStatus;
  title: string;
  description?: string;
  comment?: string;
  ownerUserId?: string;
  startedAt?: string;
  endedAt?: string;
};

export type MonitoringDisturbanceResolveInput = {
  endedAt?: string;
  comment?: string;
  ownerUserId?: string;
};

export type MonitoringSiteStatusUpdateInput = {
  siteId: string;
  overallStatus: SiteTechnicalOverallStatus;
  updatedAt?: string;
};

export type MonitoringCheckTargetRecord = {
  id: string;
  scope: MonitoringCheckScope;
  siteId: string;
  deviceId?: string;
  label: string;
  checkKind: MonitoringCheckKind;
  endpoint: string;
  port?: number;
  path?: string;
  requestMethod?: "GET" | "HEAD";
  expectedStatusCodes: number[];
  timeoutMs: number;
  requiresVpn: boolean;
  disturbanceTypeId: string;
  isActive: boolean;
  sortOrder: number;
};

export type MonitoringCheckStateRecord = {
  targetId: string;
  lastStatus?: MonitoringCheckStateStatus;
  consecutiveFailures: number;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
  activeDisturbanceId?: string;
};

export type MonitoringDisturbanceEventRecord = {
  id: string;
  disturbanceId: string;
  eventKind: MonitoringDisturbanceEventKind;
  message?: string;
  note?: string;
  previousStatus?: MonitoringDisturbanceStatus;
  status?: MonitoringDisturbanceStatus;
  actorUserId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type MonitoringServiceCaseRecord = {
  id: string;
  disturbanceId: string;
  siteId: string;
  deviceId?: string;
  referenceLabel?: string;
  status: MonitoringServiceCaseStatus;
  createdAt: string;
  createdByUserId: string;
  comment: string;
};

export type MonitoringPipelineFilter = {
  siteId?: string;
  priority?: MonitoringPriority;
  siteTechnicalStatus?: SiteTechnicalOverallStatus;
  limit?: number;
};

export type MonitoringPipelineItem = {
  id: string;
  siteId: string;
  siteName: string;
  customerId: string;
  customerName: string;
  siteTechnicalStatus: SiteTechnicalOverallStatus;
  disturbanceTypeId: string;
  disturbanceTypeCode: MonitoringDisturbanceType;
  disturbanceTypeLabel: string;
  priority: MonitoringPriority;
  priorityRank: number;
  status: MonitoringDisturbanceStatus;
  title: string;
  startedAt: string;
  durationSeconds: number;
  deviceId?: string;
  deviceName?: string;
  referenceLabel?: string;
  checkTargetId?: string;
  checkTargetLabel?: string;
  latestEventAt?: string;
  lastNote?: string;
  serviceCaseId?: string;
  serviceCaseStatus?: MonitoringServiceCaseStatus;
  isCritical: boolean;
  isOfflineRelated: boolean;
};

export type MonitoringPipelineResult = {
  items: MonitoringPipelineItem[];
  filters: MonitoringPipelineFilter;
};

export type MonitoringDisturbanceDetail = {
  disturbance: MonitoringDisturbanceRecord;
  site: {
    id: string;
    siteName: string;
    customerId: string;
    customerName: string;
    technicalStatus: SiteTechnicalOverallStatus;
    technicalStatusUpdatedAt: string;
  };
  device?: {
    id: string;
    name: string;
    type: string;
    networkAddress?: string;
  };
  checkTarget?: {
    id: string;
    label: string;
    scope: MonitoringCheckScope;
    checkKind: MonitoringCheckKind;
    endpoint: string;
    path?: string;
    requiresVpn: boolean;
  };
  serviceCase?: MonitoringServiceCaseRecord;
  history: MonitoringDisturbanceEventRecord[];
  notes: MonitoringDisturbanceEventRecord[];
};

export type MonitoringDisturbanceAcknowledgeInput = {
  comment?: string;
};

export type MonitoringDisturbanceNoteInput = {
  note: string;
};

export type MonitoringServiceCaseCreateInput = {
  comment: string;
};
