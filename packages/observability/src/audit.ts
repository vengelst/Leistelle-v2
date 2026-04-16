/**
 * Aufbau und Schnittstellen fuer das Audit-Trail des Systems.
 *
 * Die Datei verbindet strukturierte Audit-Events mit Logging und optionaler
 * Persistenz, damit fachliche und revisionsrelevante Aktionen einheitlich
 * erfasst werden koennen.
 */
import type { AuditEvent } from "@leitstelle/contracts";

import type { Logger } from "./logger.js";

/**
 * Audit unterscheidet sich hier bewusst vom normalen Logging:
 * - Logeintrag fuer technische Nachvollziehbarkeit
 * - optionale Persistenz fuer fachliche und revisionsrelevante Spuren
 *
 * Dadurch koennen lokale Tests leichtgewichtig bleiben, waehrend Produktion
 * dieselbe API mit einer DB-Persistenz hinterlegt.
 */
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
      // Jede Audit-Aktion wird immer zuerst als strukturierter Logeintrag geschrieben.
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

      // Persistenz bleibt optional, damit Module nicht an eine konkrete Storage-Art gekoppelt werden.
      if (options.persist) {
        await options.persist(event, context);
      }
    }
  };
}
