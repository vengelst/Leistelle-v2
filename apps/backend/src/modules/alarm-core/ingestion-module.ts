/**
 * Verdrahtet die Alarm-Ingestion mit Store, Zuweisung, Audit und optionalem Logging.
 */
import type { AuditTrail, Logger } from "@leitstelle/observability";

import type { DatabaseClient } from "../../db/client.js";
import type { AlarmAssignmentService } from "./assignment-service.js";
import { createAlarmIngestionService, type AlarmIngestionService } from "./service.js";
import { createAlarmCoreStore } from "./store.js";

type CreateAlarmIngestionModuleInput = {
  database: DatabaseClient;
  audit: AuditTrail;
  logger: Logger;
  autoAssignLightEnabled: boolean;
  alarmAssignment: Pick<AlarmAssignmentService, "tryAutoAssignLight">;
};

export function createAlarmIngestionModule(input: CreateAlarmIngestionModuleInput): AlarmIngestionService {
  const store = createAlarmCoreStore(input.database);
  const service = createAlarmIngestionService({
    store,
    audit: input.audit,
    logger: input.logger
  });

  return {
    async ingest(payload, requestId) {
      const result = await service.ingest(payload, requestId);
      if (input.autoAssignLightEnabled) {
        await input.alarmAssignment.tryAutoAssignLight(result.alarmCase.id, requestId);
      }
      return result;
    }
  };
}