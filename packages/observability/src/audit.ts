import type { AuditEvent } from "@leitstelle/contracts";

import type { Logger } from "./logger.js";

type AuditDefaults = {
  service: string;
};

type AuditContext = {
  requestId: string;
};

export type AuditTrail = {
  record: (event: AuditEvent, context: AuditContext) => Promise<void>;
};

type PersistAuditEntry = (event: AuditEvent, context: AuditContext) => Promise<void>;

type AuditOptions = {
  persist?: PersistAuditEntry;
};

export function createAuditTrail(logger: Logger, defaults: AuditDefaults, options: AuditOptions = {}): AuditTrail {
  return {
    async record(event, context) {
      logger.info("audit.recorded", {
        service: defaults.service,
        requestId: context.requestId,
        category: event.category,
        action: event.action,
        outcome: event.outcome,
        actorId: event.actorId,
        subjectId: event.subjectId,
        metadata: event.metadata
      });

      if (options.persist) {
        await options.persist(event, context);
      }
    }
  };
}
