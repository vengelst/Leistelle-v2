/**
 * Stellt Lese- und Exportfunktionen fuer archivierte Alarmfaelle bereit.
 */
import type {
  AlarmArchiveFilter,
  AlarmArchiveResult,
  AlarmMediaAccessDocument,
  AlarmMediaAccessMode,
  UserRole
} from "@leitstelle/contracts";
import { AppError, type AuditTrail } from "@leitstelle/observability";

import type { IdentityService } from "../identity/types.js";
import type { AlarmCoreStore, AlarmMediaAccessContext } from "./types.js";
import { createMediaAccessDocument, type MediaAccessOptions } from "./media-access.js";

export type AlarmArchiveService = {
  listCases: (token: string, filter: AlarmArchiveFilter, requestId: string) => Promise<AlarmArchiveResult>;
  getMediaAccess: (token: string, mediaId: string, mode: AlarmMediaAccessMode, requestId: string) => Promise<AlarmMediaAccessDocument>;
};

type CreateAlarmArchiveServiceInput = {
  identity: IdentityService;
  store: AlarmCoreStore;
  audit: AuditTrail;
  mediaAccess?: MediaAccessOptions;
};

const archiveReadRoles: UserRole[] = ["administrator", "leitstellenleiter", "operator"];

export function createAlarmArchiveService(input: CreateAlarmArchiveServiceInput): AlarmArchiveService {
  return {
    async listCases(token, filter, requestId) {
      const session = await requireArchiveReadAccess(input.identity, token);
      const normalizedFilter = normalizeArchiveFilter(filter);
      const items = await input.store.listArchiveCases(normalizedFilter);

      await input.audit.record(
        {
          category: "alarm.archive",
          action: "alarm.archive.list.read",
          outcome: "success",
          actorId: session.user.id,
          metadata: {
            filters: normalizedFilter,
            resultCount: items.length
          }
        },
        { requestId }
      );

      return {
        items,
        filters: normalizedFilter
      };
    },
    async getMediaAccess(token, mediaId, mode, requestId) {
      const session = await requireArchiveReadAccess(input.identity, token);
      const context = await input.store.getMediaAccessContext(mediaId);
      if (!context) {
        throw new AppError("Alarm media not found.", {
          status: 404,
          code: "ALARM_MEDIA_NOT_FOUND"
        });
      }

      if (context.alarmCase.lifecycleStatus !== "archived") {
        throw new AppError("Alarm media is only accessible after archiving the alarm case.", {
          status: 409,
          code: "ALARM_MEDIA_ARCHIVE_REQUIRED"
        });
      }

      const document = createMediaAccessDocument(context, mode, "archive", input.mediaAccess);

      await input.audit.record(
        {
          category: "alarm.media",
          action: "alarm.media.access.read",
          outcome: "success",
          actorId: session.user.id,
          subjectId: mediaId,
          metadata: {
            alarmCaseId: context.alarmCase.id,
            mode,
            sourceKind: document.sourceKind
          }
        },
        { requestId }
      );

      return document;
    }
  };
}

async function requireArchiveReadAccess(identity: IdentityService, token: string) {
  const session = await identity.getSession(token);
  if (!session.user.roles.some((role) => archiveReadRoles.includes(role))) {
    throw new AppError("User is not allowed to read archived alarm cases or media.", {
      status: 403,
      code: "ALARM_ARCHIVE_FORBIDDEN"
    });
  }

  return session;
}

function normalizeArchiveFilter(filter: AlarmArchiveFilter): AlarmArchiveFilter {
  if (filter.period === "custom" && (!filter.dateFrom || !filter.dateTo)) {
    throw new AppError("Custom archive ranges require dateFrom and dateTo.", {
      status: 400,
      code: "ALARM_ARCHIVE_DATE_RANGE_REQUIRED"
    });
  }

  return {
    ...filter,
    lifecycleScope: filter.lifecycleScope ?? "archived",
    limit: Math.max(1, Math.min(filter.limit ?? 100, 250))
  };
}