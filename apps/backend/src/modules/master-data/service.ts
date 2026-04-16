/**
 * Fachservice fuer Stammdaten und globale Einstellungen.
 *
 * Die Datei erzwingt die Rollenregeln fuer schreibende Aenderungen und baut die
 * Rueckgaben des Stores zu einem fuer das Frontend nutzbaren Gesamtueberblick
 * zusammen.
 */
import { AppError, type AuditTrail } from "@leitstelle/observability";
import type {
  AlarmSourceMappingUpsertInput,
  CustomerUpsertInput,
  DeviceUpsertInput,
  GlobalSettingsUpdateInput,
  MasterDataOverview,
  PlanUpsertInput,
  SiteMapMarkerCollection,
  SiteUpsertInput,
  UserRole
} from "@leitstelle/contracts";

import type { IdentityService } from "../identity/types.js";
import type { MasterDataStore } from "./types.js";

export type MasterDataService = {
  getOverview: (token: string, requestId: string) => Promise<MasterDataOverview>;
  getSiteMarkers: (token: string, requestId: string) => Promise<SiteMapMarkerCollection>;
  upsertCustomer: (token: string, input: CustomerUpsertInput, requestId: string) => Promise<MasterDataOverview>;
  upsertSite: (token: string, input: SiteUpsertInput, requestId: string) => Promise<MasterDataOverview>;
  upsertDevice: (token: string, input: DeviceUpsertInput, requestId: string) => Promise<MasterDataOverview>;
  deleteDevice: (token: string, deviceId: string, requestId: string) => Promise<MasterDataOverview>;
  upsertAlarmSourceMapping: (token: string, input: AlarmSourceMappingUpsertInput, requestId: string) => Promise<MasterDataOverview>;
  upsertPlan: (token: string, input: PlanUpsertInput, requestId: string) => Promise<MasterDataOverview>;
  updateGlobalSettings: (token: string, input: GlobalSettingsUpdateInput, requestId: string) => Promise<MasterDataOverview>;
};

type CreateMasterDataServiceInput = {
  identity: IdentityService;
  store: MasterDataStore;
  audit: AuditTrail;
};

const editorRoles: UserRole[] = ["administrator", "leitstellenleiter"];

export function createMasterDataService(input: CreateMasterDataServiceInput): MasterDataService {
  return {
    async getOverview(token, requestId) {
      const session = await input.identity.getSession(token);
      return await input.store.getOverview(session.user.roles);
    },
    async getSiteMarkers(token, requestId) {
      const session = await input.identity.getSession(token);
      const markers = await input.store.getSiteMarkers();
      await auditMutation(input.audit, requestId, session.user.id, "master-data.site-markers.read");
      return markers;
    },
    async upsertCustomer(token, customerInput, requestId) {
      // Nach jeder Mutation wird bewusst die komplette Overview frisch geladen,
      // damit die Verwaltungsoberflaeche sofort wieder konsistent ist.
      const session = await requireEditor(input.identity, token);
      await input.store.upsertCustomer(customerInput);
      await auditMutation(input.audit, requestId, session.user.id, "master-data.customer.upsert");
      return await input.store.getOverview(session.user.roles);
    },
    async upsertSite(token, siteInput, requestId) {
      const session = await requireEditor(input.identity, token);
      await input.store.upsertSite(siteInput);
      await auditMutation(input.audit, requestId, session.user.id, "master-data.site.upsert");
      return await input.store.getOverview(session.user.roles);
    },
    async upsertDevice(token, deviceInput, requestId) {
      const session = await requireEditor(input.identity, token);
      await input.store.upsertDevice(deviceInput);
      await auditMutation(input.audit, requestId, session.user.id, "master-data.device.upsert");
      return await input.store.getOverview(session.user.roles);
    },
    async deleteDevice(token, deviceId, requestId) {
      const session = await requireEditor(input.identity, token);
      await input.store.deleteDevice(deviceId);
      await auditMutation(input.audit, requestId, session.user.id, "master-data.device.delete");
      return await input.store.getOverview(session.user.roles);
    },
    async upsertAlarmSourceMapping(token, mappingInput, requestId) {
      const session = await requireEditor(input.identity, token);
      await input.store.upsertAlarmSourceMapping(mappingInput);
      await auditMutation(input.audit, requestId, session.user.id, "master-data.alarm-source-mapping.upsert");
      return await input.store.getOverview(session.user.roles);
    },
    async upsertPlan(token, planInput, requestId) {
      const session = await requireEditor(input.identity, token);
      await input.store.upsertPlan(planInput);
      await auditMutation(input.audit, requestId, session.user.id, "master-data.plan.upsert");
      return await input.store.getOverview(session.user.roles);
    },
    async updateGlobalSettings(token, settingsInput, requestId) {
      const session = await requireEditor(input.identity, token);
      await input.store.updateGlobalSettings(settingsInput);
      await auditMutation(input.audit, requestId, session.user.id, "master-data.settings.update");
      return await input.store.getOverview(session.user.roles);
    }
  };
}

async function requireEditor(identity: IdentityService, token: string) {
  const session = await identity.getSession(token);

  if (!session.user.roles.some((role) => editorRoles.includes(role))) {
    throw new AppError("Insufficient role for master-data changes.", {
      status: 403,
      code: "MASTER_DATA_FORBIDDEN"
    });
  }

  return session;
}

async function auditMutation(audit: AuditTrail, requestId: string, actorId: string, action: string): Promise<void> {
  await audit.record(
    {
      category: "master-data",
      action,
      outcome: "success",
      actorId,
      subjectId: actorId
    },
    { requestId }
  );
}
