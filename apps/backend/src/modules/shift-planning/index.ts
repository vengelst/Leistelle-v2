import type { AuditTrail } from "@leitstelle/observability";

import type { DatabaseClient } from "../../db/client.js";
import type { IdentityService } from "../identity/types.js";
import { createShiftPlanningService, type ShiftPlanningService } from "./service.js";
import { createShiftPlanningStore } from "./store.js";

export function createShiftPlanningModule(identity: IdentityService, audit: AuditTrail, database: DatabaseClient): ShiftPlanningService {
  const store = createShiftPlanningStore(database);
  return createShiftPlanningService({
    identity,
    store,
    audit
  });
}
