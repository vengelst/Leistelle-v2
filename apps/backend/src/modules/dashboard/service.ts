import type { DashboardOverview } from "@leitstelle/contracts";
import type { AuditTrail } from "@leitstelle/observability";

import type { AlarmCoreStore } from "../alarm-core/types.js";
import type { AlarmPipelineService } from "../alarm-core/pipeline-service.js";
import type { IdentityService } from "../identity/types.js";
import type { MasterDataService } from "../master-data/service.js";
import type { MonitoringPipelineService } from "../monitoring/pipeline-service.js";

export type DashboardService = {
  getOverview: (token: string, requestId: string) => Promise<DashboardOverview>;
};

type CreateDashboardServiceInput = {
  identity: IdentityService;
  alarmPipeline: AlarmPipelineService;
  alarmStore: AlarmCoreStore;
  monitoring: MonitoringPipelineService;
  masterData: MasterDataService;
  audit: AuditTrail;
};

export function createDashboardService(input: CreateDashboardServiceInput): DashboardService {
  return {
    async getOverview(token, requestId) {
      const [session, alarmPipeline, disturbancePipeline, siteMarkers, activeOperators, todaysFalsePositives] = await Promise.all([
        input.identity.getSession(token),
        input.alarmPipeline.listOpenCases(token, {}, requestId),
        input.monitoring.listOpenDisturbances(token, {}, requestId),
        input.masterData.getSiteMarkers(token, requestId),
        input.identity.listActiveOperators(token),
        input.alarmStore.countTodaysFalsePositives()
      ]);

      const criticalSites = siteMarkers.markers
        .filter((marker) => marker.technicalStatus.overallStatus === "offline" || marker.openDisturbanceCount > 0)
        .sort((left, right) => {
          const leftRank = left.technicalStatus.overallStatus === "offline" ? 2 : left.openDisturbanceCount > 0 ? 1 : 0;
          const rightRank = right.technicalStatus.overallStatus === "offline" ? 2 : right.openDisturbanceCount > 0 ? 1 : 0;
          return rightRank - leftRank || right.openDisturbanceCount - left.openDisturbanceCount || right.openAlarmCount - left.openAlarmCount;
        });

      await input.audit.record(
        {
          category: "dashboard",
          action: "dashboard.overview.read",
          outcome: "success",
          actorId: session.user.id,
          subjectId: session.user.id,
          metadata: {
            openAlarmCount: alarmPipeline.items.length,
            openDisturbanceCount: disturbancePipeline.items.length,
            todaysFalsePositives,
            criticalSiteCount: criticalSites.length,
            activeOperatorCount: activeOperators.length
          }
        },
        { requestId }
      );

      return {
        metrics: {
          openAlarms: {
            value: alarmPipeline.items.length,
            label: "Offene Alarme",
            hint: "Aktuell offene Alarmfaelle in der Pipeline."
          },
          openDisturbances: {
            value: disturbancePipeline.items.length,
            label: "Offene Stoerungen",
            hint: "Aktuell offene technische Stoerungen."
          },
          todaysFalsePositives: {
            value: todaysFalsePositives,
            label: "Heutige Fehlalarme",
            hint: "Heute als Fehlalarm bewertete Alarmfaelle."
          },
          criticalSites: {
            value: criticalSites.length,
            label: "Kritische Standorte",
            hint: "Offline- oder stoerungsrelevante Standorte."
          },
          activeOperators: {
            value: activeOperators.length,
            label: "Aktive Operatoren",
            hint: "Operatoren mit aktiver Session."
          }
        },
        highlights: {
          alarms: alarmPipeline.items.slice(0, 5).map((alarm) => ({
            id: alarm.id,
            title: alarm.title,
            priority: alarm.priority,
            siteName: alarm.siteName,
            customerName: alarm.customerName,
            receivedAt: alarm.receivedAt
          })),
          disturbances: disturbancePipeline.items.slice(0, 5).map((disturbance) => ({
            id: disturbance.id,
            title: disturbance.title,
            priority: disturbance.priority,
            siteName: disturbance.siteName,
            customerName: disturbance.customerName,
            startedAt: disturbance.startedAt,
            siteTechnicalStatus: disturbance.siteTechnicalStatus
          })),
          criticalSites: criticalSites.slice(0, 5).map((site) => ({
            siteId: site.siteId,
            siteName: site.siteName,
            customerName: site.customerName,
            siteTechnicalStatus: site.technicalStatus.overallStatus,
            openDisturbanceCount: site.openDisturbanceCount,
            openAlarmCount: site.openAlarmCount
          })),
          activeOperators: activeOperators.slice(0, 5).map((operator) => ({
            id: operator.id,
            displayName: operator.displayName,
            status: operator.status,
            primaryRole: operator.primaryRole,
            lastStatusChangeAt: operator.lastStatusChangeAt
          }))
        }
      };
    }
  };
}
