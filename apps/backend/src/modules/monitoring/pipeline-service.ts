import type {
  MonitoringDisturbanceAcknowledgeInput,
  MonitoringDisturbanceDetail,
  MonitoringDisturbanceNoteInput,
  MonitoringPipelineFilter,
  MonitoringPipelineResult,
  MonitoringServiceCaseCreateInput,
  UserRole
} from "@leitstelle/contracts";
import { AppError, type AuditTrail } from "@leitstelle/observability";

import type { IdentityService } from "../identity/types.js";
import type { MonitoringStore } from "./types.js";

export type MonitoringPipelineService = {
  listOpenDisturbances: (token: string, filter: MonitoringPipelineFilter, requestId: string) => Promise<MonitoringPipelineResult>;
  getDisturbanceDetail: (token: string, disturbanceId: string, requestId: string) => Promise<MonitoringDisturbanceDetail>;
  acknowledgeDisturbance: (
    token: string,
    disturbanceId: string,
    input: MonitoringDisturbanceAcknowledgeInput,
    requestId: string
  ) => Promise<{ disturbance: MonitoringDisturbanceDetail["disturbance"] }>;
  addDisturbanceNote: (
    token: string,
    disturbanceId: string,
    input: MonitoringDisturbanceNoteInput,
    requestId: string
  ) => Promise<{ note: NonNullable<MonitoringDisturbanceDetail["notes"]>[number] }>;
  createServiceCase: (
    token: string,
    disturbanceId: string,
    input: MonitoringServiceCaseCreateInput,
    requestId: string
  ) => Promise<{ serviceCase: NonNullable<MonitoringDisturbanceDetail["serviceCase"]> }>;
};

type CreateMonitoringPipelineServiceInput = {
  identity: IdentityService;
  store: MonitoringStore;
  audit: AuditTrail;
};

const mutationRoles: UserRole[] = ["administrator", "leitstellenleiter", "operator", "service"];

export function createMonitoringPipelineService(input: CreateMonitoringPipelineServiceInput): MonitoringPipelineService {
  return {
    async listOpenDisturbances(token, filter, requestId) {
      await input.identity.getSession(token);
      const items = await input.store.listOpenPipelineItems(filter);

      await input.audit.record(
        {
          category: "monitoring.pipeline",
          action: "monitoring.pipeline.open.read",
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
    },
    async getDisturbanceDetail(token, disturbanceId, requestId) {
      await input.identity.getSession(token);
      const detail = await input.store.getDisturbanceDetail(disturbanceId);
      if (!detail) {
        throw new AppError("Monitoring disturbance not found.", {
          status: 404,
          code: "MONITORING_DISTURBANCE_NOT_FOUND"
        });
      }

      await input.audit.record(
        {
          category: "monitoring.disturbance",
          action: "monitoring.disturbance.detail.read",
          outcome: "success",
          subjectId: disturbanceId
        },
        { requestId }
      );

      return detail;
    },
    async acknowledgeDisturbance(token, disturbanceId, ackInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      const detail = await requireDisturbanceDetail(input.store, disturbanceId);

      if (detail.disturbance.status === "resolved") {
        throw new AppError("Resolved monitoring disturbances cannot be acknowledged.", {
          status: 409,
          code: "MONITORING_DISTURBANCE_ALREADY_RESOLVED"
        });
      }

      const disturbance = await input.store.acknowledgeDisturbance(disturbanceId, {
        ...ackInput,
        ownerUserId: session.user.id
      });

      await input.store.appendDisturbanceEvent({
        disturbanceId,
        eventKind: "status_changed",
        previousStatus: detail.disturbance.status,
        status: disturbance.status,
        actorUserId: session.user.id,
        message: "Monitoring disturbance acknowledged.",
        ...(ackInput.comment ? { note: ackInput.comment } : {})
      });

      await input.audit.record(
        {
          category: "monitoring.disturbance",
          action: "monitoring.disturbance.acknowledged",
          outcome: "success",
          actorId: session.user.id,
          subjectId: disturbanceId,
          metadata: {
            previousStatus: detail.disturbance.status,
            status: disturbance.status
          }
        },
        { requestId }
      );

      return { disturbance };
    },
    async addDisturbanceNote(token, disturbanceId, noteInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      const detail = await requireDisturbanceDetail(input.store, disturbanceId);

      if (detail.disturbance.status === "resolved") {
        throw new AppError("Resolved monitoring disturbances are read-only for notes.", {
          status: 409,
          code: "MONITORING_DISTURBANCE_ALREADY_RESOLVED"
        });
      }

      const note = await input.store.addDisturbanceNote(disturbanceId, {
        ...noteInput,
        actorUserId: session.user.id
      });

      await input.audit.record(
        {
          category: "monitoring.disturbance",
          action: "monitoring.disturbance.note.added",
          outcome: "success",
          actorId: session.user.id,
          subjectId: disturbanceId
        },
        { requestId }
      );

      return { note };
    },
    async createServiceCase(token, disturbanceId, serviceCaseInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      const detail = await requireDisturbanceDetail(input.store, disturbanceId);

      if (detail.serviceCase) {
        throw new AppError("A service case already exists for this monitoring disturbance.", {
          status: 409,
          code: "MONITORING_SERVICE_CASE_ALREADY_EXISTS"
        });
      }

      const serviceCase = await input.store.createServiceCase(disturbanceId, {
        ...serviceCaseInput,
        actorUserId: session.user.id
      });

      await input.store.appendDisturbanceEvent({
        disturbanceId,
        eventKind: "service_case_created",
        actorUserId: session.user.id,
        message: "Monitoring disturbance handed over as service case.",
        note: serviceCase.comment,
        metadata: {
          serviceCaseId: serviceCase.id,
          serviceCaseStatus: serviceCase.status
        }
      });

      await input.audit.record(
        {
          category: "monitoring.service_case",
          action: "monitoring.service_case.created",
          outcome: "success",
          actorId: session.user.id,
          subjectId: disturbanceId,
          metadata: {
            serviceCaseId: serviceCase.id,
            serviceCaseStatus: serviceCase.status
          }
        },
        { requestId }
      );

      return { serviceCase };
    }
  };
}

async function requireMutationSession(identity: IdentityService, token: string) {
  const session = await identity.getSession(token);
  if (!session.user.roles.some((role) => mutationRoles.includes(role))) {
    throw new AppError("User is not allowed to modify monitoring disturbances.", {
      status: 403,
      code: "MONITORING_DISTURBANCE_MUTATION_FORBIDDEN"
    });
  }
  return session;
}

async function requireDisturbanceDetail(store: MonitoringStore, disturbanceId: string) {
  const detail = await store.getDisturbanceDetail(disturbanceId);
  if (!detail) {
    throw new AppError("Monitoring disturbance not found.", {
      status: 404,
      code: "MONITORING_DISTURBANCE_NOT_FOUND"
    });
  }
  return detail;
}
