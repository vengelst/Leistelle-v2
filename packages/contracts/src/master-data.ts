/**
 * Gemeinsame Stammdatenvertraege.
 *
 * Diese Datei fasst Kunden, Standorte, Geraete, Plaene, globale Einstellungen
 * und Standortmarker zusammen. Sie bildet damit die fachliche Grundlage fuer
 * Pflegeoberflaechen, Karten und backendseitige Referenzen.
 */
import type { UserRole } from "./identity.js";
import type { SiteTechnicalStatusRecord } from "./monitoring.js";
import type { MediaBundleProfileKey } from "./alarm-core.js";

export const siteStatuses = ["planned", "active", "limited", "offline"] as const;
export const deviceTypes = ["router", "nvr", "camera", "dome_ptz_camera", "bi_spectral_camera", "speaker", "sensor", "io_module"] as const;
export const planKinds = ["site_plan", "camera_plan"] as const;

export type SiteStatus = (typeof siteStatuses)[number];
export type DeviceType = (typeof deviceTypes)[number];
export type PlanKind = (typeof planKinds)[number];

export type CustomerRecord = {
  id: string;
  name: string;
  externalRef?: string;
  isActive: boolean;
};

export type GeoAddress = {
  street: string;
  houseNumber?: string;
  postalCode: string;
  city: string;
  country: string;
};

export type GeoCoordinates = {
  latitude: number;
  longitude: number;
};

export type TechnicalCredential = {
  id: string;
  scope: "site" | "device";
  label: string;
  username: string;
  password: string;
  notes?: string;
  visibleToRoles: UserRole[];
};

export type CredentialView = {
  id: string;
  scope: "site" | "device";
  label: string;
  usernameMasked: string;
  passwordMasked: string;
  notes?: string;
  visibleToRoles: UserRole[];
  isVisible: boolean;
};

export type GlobalMasterDataSettings = {
  monitoringIntervalSeconds: number;
  failureThreshold: number;
  uiDensity: "compact" | "comfortable";
  escalationProfile: "standard" | "elevated";
  workflowProfile: "default" | "weekend_sensitive";
  passwordMinLength: number;
  kioskCodeLength: number;
};

export type SiteSettings = {
  monitoringIntervalSeconds: number;
  failureThreshold: number;
  highlightCriticalDevices: boolean;
  defaultAlarmPriority: "normal" | "high" | "critical";
  defaultWorkflowProfile: "default" | "event_sensitive";
  mapLabelMode: "short" | "full";
};

export type CameraPlanMarker = {
  id: string;
  label: string;
  x: number;
  y: number;
  deviceId?: string;
  markerType: "camera" | "entry" | "speaker" | "custom";
};

export type SitePlan = {
  id: string;
  siteId: string;
  name: string;
  kind: PlanKind;
  assetName: string;
  markers: CameraPlanMarker[];
};

export type SiteDevice = {
  id: string;
  siteId: string;
  name: string;
  type: DeviceType;
  vendor?: string;
  model?: string;
  serialNumber?: string;
  status: "planned" | "installed" | "retired";
  isActive: boolean;
  networkAddress?: string;
  liveViewUrl?: string;
  macAddress?: string;
  externalDeviceId?: string;
  linkedNvrDeviceId?: string;
  channelNumber?: number;
  zone?: string;
  viewingDirection?: string;
  mountLocation?: string;
  analyticsName?: string;
  ruleName?: string;
  storageLabel?: string;
  wanIp?: string;
  lanIp?: string;
  vpnType?: string;
  provider?: string;
  simIdentifier?: string;
  audioZone?: string;
  supportsPaging?: boolean;
  credentials: CredentialView[];
};

export type AlarmSourceMappingRecord = {
  id: string;
  siteId: string;
  componentId: string;
  nvrComponentId?: string;
  vendor: string;
  sourceType: string;
  externalSourceKey?: string;
  externalDeviceId?: string;
  externalRecorderId?: string;
  channelNumber?: number;
  serialNumber?: string;
  analyticsName?: string;
  eventNamespace?: string;
  mediaBundleProfileKey?: MediaBundleProfileKey;
  description?: string;
  sortOrder: number;
  isActive: boolean;
};

export type SiteRecord = {
  id: string;
  customer: CustomerRecord;
  siteName: string;
  internalReference?: string;
  description?: string;
  address: GeoAddress;
  coordinates?: GeoCoordinates;
  status: SiteStatus;
  siteType?: string;
  contactPerson?: string;
  contactPhone?: string;
  notes?: string;
  technicalStatus: SiteTechnicalStatusRecord;
  isArchived: boolean;
  settings: SiteSettings;
  credentials: CredentialView[];
};

export type MasterDataOverview = {
  globalSettings: GlobalMasterDataSettings;
  customers: CustomerRecord[];
  sites: Array<SiteRecord & { devices: SiteDevice[]; plans: SitePlan[]; alarmSourceMappings: AlarmSourceMappingRecord[] }>;
};

export type SiteMapMarker = {
  siteId: string;
  siteName: string;
  customerId: string;
  customerName: string;
  latitude: number;
  longitude: number;
  technicalStatus: SiteTechnicalStatusRecord;
  openAlarmCount: number;
  openDisturbanceCount: number;
  hasOpenAlarm: boolean;
  hasOpenDisturbance: boolean;
};

export type SiteMapMarkerCollection = {
  regionHint: "dach";
  markers: SiteMapMarker[];
};

export type CustomerUpsertInput = {
  id?: string;
  name: string;
  externalRef?: string;
  isActive: boolean;
};

export type SiteUpsertInput = {
  id?: string;
  customerId: string;
  siteName: string;
  internalReference?: string;
  description?: string;
  status: SiteStatus;
  street: string;
  houseNumber?: string;
  postalCode: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  siteType?: string;
  contactPerson?: string;
  contactPhone?: string;
  notes?: string;
  isArchived: boolean;
  monitoringIntervalSeconds: number;
  failureThreshold: number;
  highlightCriticalDevices: boolean;
  defaultAlarmPriority: "normal" | "high" | "critical";
  defaultWorkflowProfile: "default" | "event_sensitive";
  mapLabelMode: "short" | "full";
};

export type DeviceUpsertInput = {
  id?: string;
  siteId: string;
  name: string;
  type: DeviceType;
  vendor?: string;
  model?: string;
  serialNumber?: string;
  status: "planned" | "installed" | "retired";
  isActive: boolean;
  networkAddress?: string;
  liveViewUrl?: string;
  macAddress?: string;
  externalDeviceId?: string;
  linkedNvrDeviceId?: string;
  channelNumber?: number;
  zone?: string;
  viewingDirection?: string;
  mountLocation?: string;
  analyticsName?: string;
  ruleName?: string;
  storageLabel?: string;
  wanIp?: string;
  lanIp?: string;
  vpnType?: string;
  provider?: string;
  simIdentifier?: string;
  audioZone?: string;
  supportsPaging?: boolean;
};

export type AlarmSourceMappingUpsertInput = {
  id?: string;
  siteId: string;
  componentId: string;
  nvrComponentId?: string;
  vendor: string;
  sourceType: string;
  externalSourceKey?: string;
  externalDeviceId?: string;
  externalRecorderId?: string;
  channelNumber?: number;
  serialNumber?: string;
  analyticsName?: string;
  eventNamespace?: string;
  mediaBundleProfileKey?: MediaBundleProfileKey;
  description?: string;
  sortOrder: number;
  isActive: boolean;
};

export type PlanUpsertInput = {
  id?: string;
  siteId: string;
  name: string;
  kind: PlanKind;
  assetName: string;
  markerLabel: string;
  markerType: "camera" | "entry" | "speaker" | "custom";
  markerX: number;
  markerY: number;
  deviceId?: string;
};

export type GlobalSettingsUpdateInput = GlobalMasterDataSettings;
