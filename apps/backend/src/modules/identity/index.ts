import type { AuditTrail, Logger } from "@leitstelle/observability";

import type { BackendRuntimeConfig } from "../../config/runtime.js";
import type { DatabaseClient } from "../../db/client.js";
import { createLogoutGuard } from "./logout-guard.js";
import { createIdentitySessionStore } from "./session-store.js";
import { createIdentityService } from "./service.js";
import { createIdentityUserStore } from "./user-store.js";

export async function createIdentityModule(
  config: BackendRuntimeConfig,
  audit: AuditTrail,
  logger: Logger,
  database: DatabaseClient,
  options: {
    hasBlockingAssignments?: (userId: string) => Promise<boolean>;
  } = {}
) {
  const users = createIdentityUserStore(database);
  const sessions = createIdentitySessionStore(database, config.auth.sessionTtlHours);
  const logoutGuard = options.hasBlockingAssignments
    ? createLogoutGuard({
        hasBlockingAssignments: options.hasBlockingAssignments
      })
    : createLogoutGuard();

  return createIdentityService({
    audit,
    logger,
    users,
    sessions,
    logoutGuard
  });
}
