/**
 * Liefert die operative Alarm-Pipeline als gefilterte Sicht auf offene Faelle.
 */
import type { AlarmPipelineFilter, AlarmPipelineResult } from "@leitstelle/contracts";
import type { AuditTrail } from "@leitstelle/observability";

import type { IdentityService } from "../identity/types.js";
import type { AlarmCoreStore } from "./types.js";

export type AlarmPipelineService = {
  listOpenCases: (token: string, filter: AlarmPipelineFilter, requestId: string) => Promise<AlarmPipelineResult>;
};

type CreateAlarmPipelineServiceInput = {
  identity: IdentityService;
  store: AlarmCoreStore;
  audit: AuditTrail;
};

export function createAlarmPipelineService(input: CreateAlarmPipelineServiceInput): AlarmPipelineService {
  return {
    async listOpenCases(token, filter, requestId) {
      await input.identity.getSession(token);
      const items = await input.store.listOpenCases(filter);

      await input.audit.record(
        {
          category: "alarm.pipeline",
          action: "alarm.pipeline.open.read",
          outcome: "success",
          metadata: {
            filter,
            resultCount: items.length
          }
        },
        { requestId }
      );

      return {
        items,
        filters: filter
      };
    }
  };
}