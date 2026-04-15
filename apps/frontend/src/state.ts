import type {
  AlarmArchiveFilter,
  AlarmArchiveLifecycleScope,
  AlarmArchivePeriod,
  AlarmArchiveResult,
  AlarmCaseDetail,
  AlarmMediaAccessDocument,
  AlarmCaseReport,
  AlarmCatalogs,
  AlarmInstructionTimeContext,
  AlarmPipelineItem,
  AlarmTechnicalState,
  AlarmType,
  AlarmWorkflowProfile,
  DashboardOverview,
  DeviceType,
  MasterDataOverview,
  MonitoringDisturbanceDetail,
  MonitoringDisturbanceType,
  MonitoringPipelineItem,
  MonitoringPriority,
  PlanKind,
  ReportingFilter,
  ReportingGroupDimension,
  ReportingOverview,
  ReportingPeriod,
  SessionInfo,
  LoginMode,
  ShiftPlanningFilter,
  ShiftPlanningOverview,
  ShiftPlanningPeriod,
  ShiftPlanningState,
  SiteStatus,
  SiteMapMarkerCollection,
  SiteTechnicalOverallStatus,
  UserAdministrationOverview,
  UserRole
} from "@leitstelle/contracts";

export type PipelineAssignmentScope = "all" | "mine" | "unassigned";
export type PipelineLifecycleScope = "" | "queued" | "reserved" | "in_progress";
export type PipelineFilterState = { siteId?: string; technicalState?: AlarmTechnicalState; lifecycleScope?: PipelineLifecycleScope; assignmentScope?: PipelineAssignmentScope };
export type MonitoringFilterState = { siteId?: string; priority?: MonitoringPriority; siteTechnicalStatus?: SiteTechnicalOverallStatus };
export type ReportingFilterState = ReportingFilter;
export type ArchiveFilterState = AlarmArchiveFilter;
export type ShiftPlanningFilterState = ShiftPlanningFilter;
export type SiteManagementSection = "overview" | "master-data" | "technology" | "network" | "audio" | "alarm-sources" | "history";
export type SiteManagementView = "list" | "detail";
export type SettingsSection = "overview" | "general" | "users" | "roles";
export type WorkspaceId = "dashboard" | "leitstelle" | "map" | "sites" | "archive-reporting" | "settings" | "administration";
export type LeitstelleMode = "overview" | "alarms" | "disturbances" | "operator" | "wallboard";
export type ThemeMode = "light" | "dark";
export type ShellMenuPosition = "left" | "top";
export type BusyStateMap = Record<string, string>;
export type UserAdministrationView = "list" | "detail";
export type AlarmSoundPermissionState = "unknown" | "ready" | "blocked" | "unsupported";
export type OperatorWindowRole = "primary" | "secondary";
export type OperatorLayoutWidgetId = "queue" | "site" | "instructions" | "actions" | "documentation" | "media" | "plan" | "source";
export type OperatorLayoutPresetId = "two-screen" | "single-screen";
export type OperatorLayoutWidgetWidth = "normal" | "wide" | "full";
export type OperatorLayoutWidgetHeight = "normal" | "tall";
export type OperatorLayoutWidgetSize = {
  width: OperatorLayoutWidgetWidth;
  height: OperatorLayoutWidgetHeight;
};
export type OperatorLayoutConfig = {
  primary: OperatorLayoutWidgetId[];
  secondary: OperatorLayoutWidgetId[];
  widgetSizes: Record<OperatorLayoutWidgetId, OperatorLayoutWidgetSize>;
  presetId: OperatorLayoutPresetId | "custom";
};
export type OperatorLayoutProfile = {
  id: string;
  name: string;
  layout: OperatorLayoutConfig;
};

export type FrontendState = {
  session: SessionInfo | null;
  userAdministration: UserAdministrationOverview | null;
  overview: MasterDataOverview | null;
  dashboard: DashboardOverview | null;
  shiftPlanning: ShiftPlanningOverview | null;
  reporting: ReportingOverview | null;
  archive: AlarmArchiveResult | null;
  catalogs: AlarmCatalogs | null;
  workflowProfiles: AlarmWorkflowProfile[];
  selectedAlarmDetail: AlarmCaseDetail | null;
  selectedAlarmReport: AlarmCaseReport | null;
  selectedMonitoringDetail: MonitoringDisturbanceDetail | null;
  selectedAlarmCaseId?: string;
  selectedMonitoringDisturbanceId?: string;
  selectedSiteId?: string;
  siteMarkers: SiteMapMarkerCollection | null;
  selectedMapSiteId?: string;
  mapZoom: number;
  mapCenterLatitude?: number;
  mapCenterLongitude?: number;
  mapPanX: number;
  mapPanY: number;
  siteManagementView: SiteManagementView;
  selectedSiteManagementSection: SiteManagementSection;
  siteManagementSearch: string;
  siteManagementStatusFilter: SiteStatus | "all";
  siteManagementShowArchived: boolean;
  siteManagementCreateSiteMode: boolean;
  selectedSiteEditorId?: string;
  siteManagementDeviceModalOpen: boolean;
  selectedDeviceEditorId?: string;
  siteManagementDeviceDraftType: DeviceType;
  selectedAlarmSourceMappingEditorId?: string;
  selectedSitePlanIds: Record<string, string>;
  selectedSitePlanMarkerIds: Record<string, string>;
  selectedSitePlanZooms: Record<string, number>;
  selectedInstructionTimeContext?: AlarmInstructionTimeContext;
  openAlarms: AlarmPipelineItem[];
  openDisturbances: MonitoringPipelineItem[];
  selectedAlarmMediaPreviews: Record<string, AlarmMediaAccessDocument>;
  selectedAlarmMediaPreviewErrors: Record<string, string>;
  activeWorkspace: WorkspaceId;
  leitstelleMode: LeitstelleMode;
  operatorWindowRole: OperatorWindowRole;
  operatorLayout: OperatorLayoutConfig;
  operatorLayoutProfiles: OperatorLayoutProfile[];
  operatorLayoutDraftName: string;
  operatorLayoutEditorOpen: boolean;
  leitstelleNavigationCollapsed: boolean;
  shellMenuPosition: ShellMenuPosition;
  themeMode: ThemeMode;
  loginMode: LoginMode;
  kioskMode: boolean;
  alarmSoundEnabled: boolean;
  alarmSoundIncludeNormalPriority: boolean;
  alarmSoundPermissionState: AlarmSoundPermissionState;
  selectedSettingsSection: SettingsSection;
  userAdministrationView: UserAdministrationView;
  selectedAdministrationUserId?: string;
  selectedAdministrationUserEditorId?: string;
  userAdministrationCreateMode: boolean;
  userAdministrationSearch: string;
  userAdministrationStatusFilter: "all" | "active" | "inactive";
  userAdministrationRoleFilter: UserRole | "all";
  pipelineFilter: PipelineFilterState;
  monitoringFilter: MonitoringFilterState;
  reportingFilter: ReportingFilterState;
  archiveFilter: ArchiveFilterState;
  shiftPlanningFilter: ShiftPlanningFilterState;
  selectedShiftPlanningShiftId?: string;
  pendingOperations: BusyStateMap;
  message: string | null;
  error: string | null;
};

export const siteStatusOptions: SiteStatus[] = ["planned", "active", "limited", "offline"];
export const deviceTypeOptions: DeviceType[] = ["router", "nvr", "camera", "dome_ptz_camera", "bi_spectral_camera", "speaker", "sensor", "io_module"];
export const planKindOptions: PlanKind[] = ["site_plan", "camera_plan"];
export const technicalStateOptions: AlarmTechnicalState[] = ["complete", "incomplete"];
export const monitoringPriorityOptions: MonitoringPriority[] = ["critical", "high", "normal"];
export const siteTechnicalStatusOptions: SiteTechnicalOverallStatus[] = ["offline", "disturbed", "ok"];
export const reportingPeriodOptions: ReportingPeriod[] = ["day", "week", "month", "year", "custom"];
export const archivePeriodOptions: AlarmArchivePeriod[] = ["day", "week", "month", "year", "custom"];
export const shiftPlanningPeriodOptions: ShiftPlanningPeriod[] = ["day", "week", "month", "year", "custom"];
export const shiftPlanningStateOptions: ShiftPlanningState[] = ["planned", "running", "completed"];
export const archiveLifecycleScopeOptions: AlarmArchiveLifecycleScope[] = ["archived", "resolved", "open", "all"];
export const userAdministrationRoleOptions: UserRole[] = ["administrator", "leitstellenleiter", "operator", "service"];
export const reportingGroupOptions: ReportingGroupDimension[] = ["customer", "site", "camera", "alarm_type", "operator", "disturbance_type"];
export const reportingAlarmTypeOptions: AlarmType[] = ["motion", "line_crossing", "area_entry", "sabotage", "video_loss", "camera_offline", "nvr_offline", "router_offline", "technical", "other_disturbance"];
export const reportingDisturbanceTypeOptions: MonitoringDisturbanceType[] = ["router_unreachable", "nvr_unreachable", "camera_unreachable", "site_connection_disturbed", "technical_alarm", "other_disturbance"];

export const defaultReportingFilter: ReportingFilterState = { period: "week", groupBy: "site" };
export const defaultArchiveFilter: ArchiveFilterState = { period: "month", lifecycleScope: "archived" };
export const defaultShiftPlanningFilter: ShiftPlanningFilterState = { period: "week" };

export const state: FrontendState = {
  session: null,
  userAdministration: null,
  overview: null,
  dashboard: null,
  shiftPlanning: null,
  reporting: null,
  archive: null,
  catalogs: null,
  workflowProfiles: [],
  selectedAlarmDetail: null,
  selectedAlarmReport: null,
  selectedMonitoringDetail: null,
  pendingOperations: {},
  siteMarkers: null,
  mapZoom: 6,
  mapCenterLatitude: 51.2,
  mapCenterLongitude: 10.45,
  mapPanX: 0,
  mapPanY: 0,
  siteManagementView: "list",
  selectedSiteManagementSection: "overview",
  siteManagementSearch: "",
  siteManagementStatusFilter: "all",
  siteManagementShowArchived: false,
  siteManagementCreateSiteMode: false,
  siteManagementDeviceModalOpen: false,
  siteManagementDeviceDraftType: "camera",
  selectedSitePlanIds: {},
  selectedSitePlanMarkerIds: {},
  selectedSitePlanZooms: {},
  openAlarms: [],
  openDisturbances: [],
  selectedAlarmMediaPreviews: {},
  selectedAlarmMediaPreviewErrors: {},
  activeWorkspace: "dashboard",
  leitstelleMode: "alarms",
  operatorWindowRole: "primary",
  operatorLayout: {
    primary: ["site", "instructions", "actions", "documentation"],
    secondary: ["queue", "media", "plan", "source"],
    widgetSizes: {
      queue: { width: "full", height: "tall" },
      site: { width: "wide", height: "normal" },
      instructions: { width: "normal", height: "normal" },
      actions: { width: "wide", height: "normal" },
      documentation: { width: "wide", height: "tall" },
      media: { width: "wide", height: "tall" },
      plan: { width: "wide", height: "tall" },
      source: { width: "normal", height: "normal" }
    },
    presetId: "two-screen"
  },
  operatorLayoutProfiles: [],
  operatorLayoutDraftName: "",
  operatorLayoutEditorOpen: false,
  leitstelleNavigationCollapsed: false,
  shellMenuPosition: "left",
  themeMode: "light",
  loginMode: "password",
  kioskMode: false,
  alarmSoundEnabled: true,
  alarmSoundIncludeNormalPriority: false,
  alarmSoundPermissionState: "unknown",
  selectedSettingsSection: "overview",
  userAdministrationView: "list",
  userAdministrationCreateMode: false,
  userAdministrationSearch: "",
  userAdministrationStatusFilter: "all",
  userAdministrationRoleFilter: "all",
  pipelineFilter: {},
  monitoringFilter: {},
  reportingFilter: { ...defaultReportingFilter },
  archiveFilter: { ...defaultArchiveFilter },
  shiftPlanningFilter: { ...defaultShiftPlanningFilter },
  message: null,
  error: null
};

export function resetSessionScopedState(): void {
  state.session = null;
  state.userAdministration = null;
  state.overview = null;
  state.dashboard = null;
  state.shiftPlanning = null;
  state.reporting = null;
  state.archive = null;
  state.catalogs = null;
  state.workflowProfiles = [];
  state.selectedAlarmDetail = null;
  state.selectedAlarmReport = null;
  state.selectedMonitoringDetail = null;
  delete state.selectedAlarmCaseId;
  delete state.selectedMonitoringDisturbanceId;
  delete state.selectedSiteId;
  state.siteMarkers = null;
  state.mapZoom = 6;
  state.mapCenterLatitude = 51.2;
  state.mapCenterLongitude = 10.45;
  state.mapPanX = 0;
  state.mapPanY = 0;
  state.siteManagementView = "list";
  state.selectedSiteManagementSection = "overview";
  state.siteManagementSearch = "";
  state.siteManagementStatusFilter = "all";
  state.siteManagementShowArchived = false;
  state.siteManagementCreateSiteMode = false;
  delete state.selectedSiteEditorId;
  state.siteManagementDeviceModalOpen = false;
  delete state.selectedDeviceEditorId;
  state.siteManagementDeviceDraftType = "camera";
  delete state.selectedAlarmSourceMappingEditorId;
  state.selectedSitePlanIds = {};
  state.selectedSitePlanMarkerIds = {};
  state.selectedSitePlanZooms = {};
  delete state.selectedMapSiteId;
  delete state.selectedInstructionTimeContext;
  state.openAlarms = [];
  state.openDisturbances = [];
  state.selectedAlarmMediaPreviews = {};
  state.selectedAlarmMediaPreviewErrors = {};
  state.activeWorkspace = "dashboard";
  state.leitstelleMode = "alarms";
  state.operatorLayout = {
    primary: ["site", "instructions", "actions", "documentation"],
    secondary: ["queue", "media", "plan", "source"],
    widgetSizes: {
      queue: { width: "full", height: "tall" },
      site: { width: "wide", height: "normal" },
      instructions: { width: "normal", height: "normal" },
      actions: { width: "wide", height: "normal" },
      documentation: { width: "wide", height: "tall" },
      media: { width: "wide", height: "tall" },
      plan: { width: "wide", height: "tall" },
      source: { width: "normal", height: "normal" }
    },
    presetId: "two-screen"
  };
  state.operatorLayoutProfiles = [];
  state.operatorLayoutDraftName = "";
  state.operatorLayoutEditorOpen = false;
  state.leitstelleNavigationCollapsed = false;
  state.shellMenuPosition = "left";
  state.selectedSettingsSection = "overview";
  state.userAdministrationView = "list";
  state.userAdministrationCreateMode = false;
  state.userAdministrationSearch = "";
  state.userAdministrationStatusFilter = "all";
  state.userAdministrationRoleFilter = "all";
  delete state.selectedAdministrationUserId;
  delete state.selectedAdministrationUserEditorId;
  state.pipelineFilter = {};
  state.monitoringFilter = {};
  state.reportingFilter = { ...defaultReportingFilter };
  state.archiveFilter = { ...defaultArchiveFilter };
  state.shiftPlanningFilter = { ...defaultShiftPlanningFilter };
  delete state.selectedShiftPlanningShiftId;
  state.pendingOperations = {};
}
