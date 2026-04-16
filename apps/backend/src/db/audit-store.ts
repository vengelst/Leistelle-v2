/**
 * Persistenzadapter fuer Audit-Ereignisse.
 *
 * Waehren das Observability-Paket nur die Audit-API kennt, sorgt diese Datei
 * fuer die konkrete Speicherung im Backend-Postgres.
 */
import { randomUUID } from "node:crypto";

import type { AuditEvent } from "@leitstelle/contracts";

import type { DatabaseClient } from "./client.js";

export function createAuditPersistence(database: DatabaseClient) {
  return async (event: AuditEvent, context: { requestId: string }): Promise<void> => {
    await database.query(
      `
        insert into audit_events(
          id, request_id, category, action, outcome, actor_user_id, subject_id, metadata, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      `,
      [
        randomUUID(),
        context.requestId,
        event.category,
        event.action,
        event.outcome,
        event.actorId ?? null,
        event.subjectId ?? null,
        JSON.stringify(event.metadata ?? {}),
        event.createdAt ?? new Date().toISOString()
      ]
    );
  };
}
