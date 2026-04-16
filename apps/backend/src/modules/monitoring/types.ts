/**
 * Interne Typen und Store-Vertraege des Monitoring-Moduls.
 *
 * Diese Datei beschreibt die Backend-internen Arbeitsstrukturen fuer Checks,
 * Stoerungen, Servicefaelle und technische Standortzustaende.
 */
import type {
  MonitoringDisturbanceAcknowledgeInput,
  MonitoringDisturbanceDetail,
  MonitoringDisturbanceEventKind,
  MonitoringDisturbanceEventRecord,
  MonitoringDisturbanceNoteInput,
  MonitoringServiceCaseCreateInput,
  MonitoringServiceCaseRecord,
  MonitoringPipelineFilter,
  MonitoringPipelineItem,
  MonitoringCheckStateRecord,
  MonitoringCheckStateStatus,
  MonitoringCheckTargetRecord,
  MonitoringDisturbanceCreateInput,
  MonitoringDisturbanceRecord,
  MonitoringDisturbanceResolveInput,
  MonitoringDisturbanceStatus,
  MonitoringDisturbanceTypeCatalogEntry,
  MonitoringSiteStatusUpdateInput,
  SiteTechnicalStatusRecord
} from "@leitstelle/contracts";

export type MonitoringCheckPlanItem = {
  target: MonitoringCheckTargetRecord;
  site: {
    id: string;
    siteName: string;
    monitoringIntervalSeconds: number;
    failureThreshold: number;
  };
  device?: {
    id: string;
    name: string;
    type: string;
    networkAddress?: string;
  };
  state?: MonitoringCheckStateRecord;
};

export type MonitoringStore = {
  getDisturbanceTypeCatalog: () => Promise<MonitoringDisturbanceTypeCatalogEntry[]>;
  listDisturbancesForSite: (siteId: string, status?: MonitoringDisturbanceStatus) => Promise<MonitoringDisturbanceRecord[]>;
  listOpenDisturbancesForSite: (siteId: string) => Promise<MonitoringDisturbanceRecord[]>;
  listOpenPipelineItems: (filter: MonitoringPipelineFilter) => Promise<MonitoringPipelineItem[]>;
  getDisturbanceDetail: (disturbanceId: string) => Promise<MonitoringDisturbanceDetail | null>;
  createDisturbance: (input: MonitoringDisturbanceCreateInput) => Promise<MonitoringDisturbanceRecord>;
  resolveDisturbance: (disturbanceId: string, input: MonitoringDisturbanceResolveInput) => Promise<MonitoringDisturbanceRecord>;
  acknowledgeDisturbance: (
    disturbanceId: string,
    input: MonitoringDisturbanceAcknowledgeInput & { ownerUserId?: string }
  ) => Promise<MonitoringDisturbanceRecord>;
  updateDisturbanceObservation: (
    disturbanceId: string,
    input: Pick<MonitoringDisturbanceCreateInput, "priority" | "title" | "description" | "comment">
  ) => Promise<MonitoringDisturbanceRecord>;
  appendDisturbanceEvent: (input: {
    disturbanceId: string;
    eventKind: MonitoringDisturbanceEventKind;
    previousStatus?: MonitoringDisturbanceStatus;
    status?: MonitoringDisturbanceStatus;
    actorUserId?: string;
    message?: string;
    note?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<MonitoringDisturbanceEventRecord>;
  addDisturbanceNote: (
    disturbanceId: string,
    input: MonitoringDisturbanceNoteInput & { actorUserId: string }
  ) => Promise<MonitoringDisturbanceEventRecord>;
  getServiceCaseByDisturbanceId: (disturbanceId: string) => Promise<MonitoringServiceCaseRecord | null>;
  createServiceCase: (
    disturbanceId: string,
    input: MonitoringServiceCaseCreateInput & { actorUserId: string }
  ) => Promise<MonitoringServiceCaseRecord>;
  getSiteTechnicalStatus: (siteId: string) => Promise<SiteTechnicalStatusRecord>;
  updateSiteTechnicalStatus: (input: MonitoringSiteStatusUpdateInput) => Promise<SiteTechnicalStatusRecord>;
  listActiveCheckPlan: () => Promise<MonitoringCheckPlanItem[]>;
  upsertCheckState: (input: {
    targetId: string;
    lastStatus: MonitoringCheckStateStatus;
    consecutiveFailures: number;
    lastCheckedAt: string;
    lastSuccessAt?: string;
    lastFailureAt?: string;
    lastError?: string;
    activeDisturbanceId?: string;
  }) => Promise<MonitoringCheckStateRecord>;
  clearCheckStateDisturbance: (targetId: string) => Promise<void>;
};
