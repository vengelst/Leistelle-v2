/**
 * Definiert die internen Typen und Storevertraege des Stammdatenmoduls.
 */
import type {
  AlarmSourceMappingRecord,
  AlarmSourceMappingUpsertInput,
  CustomerRecord,
  CustomerUpsertInput,
  DeviceUpsertInput,
  GlobalMasterDataSettings,
  GlobalSettingsUpdateInput,
  MasterDataOverview,
  PlanUpsertInput,
  SitePlan,
  SiteMapMarkerCollection,
  SiteRecord,
  SiteSettings,
  SiteTechnicalStatusRecord,
  SiteUpsertInput,
  TechnicalCredential,
  UserRole
} from "@leitstelle/contracts";

export type CustomerEntity = CustomerRecord;

export type SiteEntity = {
  id: string;
  customerId: string;
  siteName: string;
  address: SiteRecord["address"];
  coordinates?: NonNullable<SiteRecord["coordinates"]>;
  status: SiteRecord["status"];
  technicalStatus: SiteTechnicalStatusRecord;
  isArchived: boolean;
  settings: SiteSettings;
  credentials: TechnicalCredential[];
};

export type DeviceEntity = Omit<import("@leitstelle/contracts").SiteDevice, "credentials"> & {
  credentials: TechnicalCredential[];
};

export type AlarmSourceMappingEntity = AlarmSourceMappingRecord;
export type PlanEntity = Omit<SitePlan, never>;

export type MasterDataStore = {
  getOverview: (roles: UserRole[]) => Promise<MasterDataOverview>;
  getSiteMarkers: () => Promise<SiteMapMarkerCollection>;
  upsertCustomer: (input: CustomerUpsertInput) => Promise<CustomerEntity>;
  upsertSite: (input: SiteUpsertInput) => Promise<SiteEntity>;
  upsertDevice: (input: DeviceUpsertInput) => Promise<DeviceEntity>;
  deleteDevice: (deviceId: string) => Promise<void>;
  upsertAlarmSourceMapping: (input: AlarmSourceMappingUpsertInput) => Promise<AlarmSourceMappingEntity>;
  upsertPlan: (input: PlanUpsertInput) => Promise<PlanEntity>;
  updateGlobalSettings: (input: GlobalSettingsUpdateInput) => Promise<GlobalMasterDataSettings>;
};