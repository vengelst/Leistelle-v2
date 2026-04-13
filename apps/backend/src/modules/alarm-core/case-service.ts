import type {
  AlarmAcknowledgeActionResult,
  AlarmAcknowledgeInput,
  AlarmActionDocumentResult,
  AlarmActionInput,
  AlarmArchiveActionResult,
  AlarmArchiveInput,
  AlarmAssessmentActionResult,
  AlarmAssessmentUpdateInput,
  AlarmCaseDetail,
  AlarmCatalogs,
  AlarmCloseActionResult,
  AlarmCloseInput,
  AlarmCommentActionResult,
  AlarmCommentInput,
  AlarmCommentKind,
  AlarmFollowUpActionResult,
  AlarmFollowUpInput,
  AlarmMediaInboxFilter,
  AlarmMediaInboxResult,
  AlarmMediaAccessDocument,
  AlarmMediaAccessMode,
  AlarmInstructionTimeContext,
  AlarmWorkflowProfile,
  AlarmWorkflowProfileFilter,
  AlarmWorkflowProfileUpsertInput,
  UserRole
} from "@leitstelle/contracts";
import { AppError, type AuditTrail } from "@leitstelle/observability";

import type { IdentityService } from "../identity/types.js";
import type { AlarmCoreStore } from "./types.js";
import { createMediaAccessDocument, type MediaAccessOptions } from "./media-access.js";

export type AlarmCaseService = {
  getCatalogs: (token: string, requestId: string) => Promise<AlarmCatalogs>;
  getDetail: (
    token: string,
    alarmCaseId: string,
    requestId: string,
    filter?: { timeContext?: AlarmInstructionTimeContext; specialContextLabel?: string }
  ) => Promise<AlarmCaseDetail>;
  listWorkflowProfiles: (token: string, filter: AlarmWorkflowProfileFilter, requestId: string) => Promise<AlarmWorkflowProfile[]>;
  getActiveMediaAccess: (token: string, alarmCaseId: string, mediaId: string, mode: AlarmMediaAccessMode, requestId: string) => Promise<AlarmMediaAccessDocument>;
  listMediaInbox: (token: string, filter: AlarmMediaInboxFilter, requestId: string) => Promise<AlarmMediaInboxResult>;
  upsertWorkflowProfile: (token: string, input: AlarmWorkflowProfileUpsertInput, requestId: string) => Promise<AlarmWorkflowProfile>;
  documentAction: (token: string, alarmCaseId: string, input: AlarmActionInput, requestId: string) => Promise<AlarmActionDocumentResult>;
  acknowledgeCase: (token: string, alarmCaseId: string, input: AlarmAcknowledgeInput, requestId: string) => Promise<AlarmAcknowledgeActionResult>;
  setAssessment: (token: string, alarmCaseId: string, input: AlarmAssessmentUpdateInput, requestId: string) => Promise<AlarmAssessmentActionResult>;
  updateFollowUp: (token: string, alarmCaseId: string, input: AlarmFollowUpInput, requestId: string) => Promise<AlarmFollowUpActionResult>;
  addComment: (token: string, alarmCaseId: string, input: AlarmCommentInput, requestId: string) => Promise<AlarmCommentActionResult>;
  closeCase: (token: string, alarmCaseId: string, input: AlarmCloseInput, requestId: string) => Promise<AlarmCloseActionResult>;
  archiveCase: (token: string, alarmCaseId: string, input: AlarmArchiveInput, requestId: string) => Promise<AlarmArchiveActionResult>;
};

type CreateAlarmCaseServiceInput = {
  identity: IdentityService;
  store: AlarmCoreStore;
  audit: AuditTrail;
  mediaAccess?: MediaAccessOptions;
};

const mutationRoles: UserRole[] = ["administrator", "leitstellenleiter", "operator"];
const overrideRoles: UserRole[] = ["administrator", "leitstellenleiter"];
const mediaReadRoles: UserRole[] = ["administrator", "leitstellenleiter", "operator"];
const archiveReadRoles: UserRole[] = ["administrator", "leitstellenleiter", "operator"];
const mediaInboxReadRoles: UserRole[] = ["administrator", "leitstellenleiter", "service"];

export function createAlarmCaseService(input: CreateAlarmCaseServiceInput): AlarmCaseService {
  return {
    async getCatalogs(token, requestId) {
      await input.identity.getSession(token);
      const [falsePositiveReasons, closureReasons, actionTypes, actionStatuses, workflowProfiles] = await Promise.all([
        input.store.listFalsePositiveReasons(),
        input.store.listClosureReasons(),
        input.store.listActionTypes(),
        input.store.listActionStatuses(),
        input.store.listWorkflowProfiles()
      ]);

      await input.audit.record(
        {
          category: "alarm.case",
          action: "alarm.case.catalogs.read",
          outcome: "success",
          metadata: {
            falsePositiveReasonCount: falsePositiveReasons.length,
            closureReasonCount: closureReasons.length,
            actionTypeCount: actionTypes.length,
            actionStatusCount: actionStatuses.length,
            workflowProfileCount: workflowProfiles.length
          }
        },
        { requestId }
      );

      return { falsePositiveReasons, closureReasons, actionTypes, actionStatuses, workflowProfiles };
    },
    async getDetail(token, alarmCaseId, requestId, filter = {}) {
      const session = await input.identity.getSession(token);
      const detail = await input.store.getCaseDetail(alarmCaseId);
      if (!detail) {
        throw new AppError("Alarm case not found.", {
          status: 404,
          code: "ALARM_CASE_NOT_FOUND"
        });
      }

      if (detail.isArchived && !session.user.roles.some((role) => archiveReadRoles.includes(role))) {
        throw new AppError("User is not allowed to read archived alarm cases.", {
          status: 403,
          code: "ALARM_ARCHIVE_FORBIDDEN"
        });
      }

      await input.audit.record(
        {
          category: "alarm.case",
          action: "alarm.case.detail.read",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId
        },
        { requestId }
      );

      const instructionContext = await input.store.resolveInstructionContextForCase(alarmCaseId, filter);
      return {
        ...detail,
        instructionContext: instructionContext ?? detail.instructionContext
      };
    },
    async listWorkflowProfiles(token, filter, requestId) {
      await input.identity.getSession(token);
      const profiles = await input.store.listWorkflowProfiles(filter);

      await input.audit.record(
        {
          category: "alarm.instruction",
          action: "alarm.instruction.profile.list",
          outcome: "success",
          metadata: {
            filter,
            resultCount: profiles.length
          }
        },
        { requestId }
      );

      return profiles;
    },
    async getActiveMediaAccess(token, alarmCaseId, mediaId, mode, requestId) {
      const session = await requireMediaReadSession(input.identity, token);
      const context = await input.store.getMediaAccessContext(mediaId);
      if (!context || context.alarmCase.id !== alarmCaseId) {
        throw new AppError("Alarm media not found.", {
          status: 404,
          code: "ALARM_MEDIA_NOT_FOUND"
        });
      }

      if (context.alarmCase.lifecycleStatus === "archived") {
        throw new AppError("Archived alarm media must be accessed via the archive media path.", {
          status: 409,
          code: "ALARM_MEDIA_ARCHIVE_PATH_REQUIRED"
        });
      }

      const document = createMediaAccessDocument(context, mode, "active", input.mediaAccess);
      await input.audit.record(
        {
          category: "alarm.media",
          action: "alarm.media.active_access.read",
          outcome: "success",
          actorId: session.user.id,
          subjectId: mediaId,
          metadata: {
            alarmCaseId,
            mode,
            sourceKind: document.sourceKind
          }
        },
        { requestId }
      );

      return document;
    },
    async listMediaInbox(token, filter, requestId) {
      const session = await input.identity.getSession(token);
      if (!session.user.roles.some((role) => mediaInboxReadRoles.includes(role))) {
        throw new AppError("User is not allowed to read media inbox monitoring.", {
          status: 403,
          code: "ALARM_MEDIA_INBOX_FORBIDDEN"
        });
      }

      const entries = await input.store.listVendorMediaInbox(filter);
      await input.audit.record(
        {
          category: "alarm.media",
          action: "alarm.media.inbox.read",
          outcome: "success",
          actorId: session.user.id,
          metadata: {
            filter,
            resultCount: entries.length
          }
        },
        { requestId }
      );

      return {
        items: entries.map((entry) => ({
          id: entry.id,
          status: entry.status,
          vendor: entry.vendor,
          sourceType: entry.sourceType,
          ...(entry.originalFilename ? { filename: entry.originalFilename } : {}),
          storageKey: entry.storageKey,
          ...(entry.correlationKey ? { correlationKey: entry.correlationKey } : {}),
          ...(entry.eventTs ? { parsedTimestamp: entry.eventTs } : {}),
          ...(entry.alarmCaseId ? { matchedAlarmCaseId: entry.alarmCaseId } : {}),
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          ...(entry.parseError ? { errorReason: entry.parseError } : {})
        })),
        filter
      };
    },
    async upsertWorkflowProfile(token, workflowInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      const profile = await input.store.upsertWorkflowProfile(workflowInput);

      await input.audit.record(
        {
          category: "alarm.instruction",
          action: "alarm.instruction.profile.upsert",
          outcome: "success",
          actorId: session.user.id,
          subjectId: profile.id,
          metadata: {
            siteId: profile.siteId,
            timeContext: profile.timeContext,
            stepCount: profile.steps.length
          }
        },
        { requestId }
      );

      return profile;
    },
    async documentAction(token, alarmCaseId, actionInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      await requireWritableCase(input.store, alarmCaseId);

      const [actionType, actionStatus] = await Promise.all([
        input.store.getActionTypeById(actionInput.actionTypeId),
        input.store.getActionStatusById(actionInput.statusId)
      ]);

      if (!actionType) {
        throw new AppError("Action type not found.", {
          status: 404,
          code: "ALARM_ACTION_TYPE_NOT_FOUND"
        });
      }

      if (!actionStatus) {
        throw new AppError("Action status not found.", {
          status: 404,
          code: "ALARM_ACTION_STATUS_NOT_FOUND"
        });
      }

      const action = await input.store.createAction({
        alarmCaseId,
        actionTypeId: actionType.id,
        statusId: actionStatus.id,
        userId: session.user.id,
        comment: actionInput.comment,
        ...(actionInput.occurredAt ? { occurredAt: actionInput.occurredAt } : {})
      });

      await input.store.appendEvent({
        alarmCaseId,
        eventKind: "action_documented",
        actorUserId: session.user.id,
        message: "Alarm action documented.",
        payload: {
          actionId: action.id,
          actionTypeId: action.actionTypeId,
          actionTypeCode: action.actionTypeCode,
          statusId: action.statusId,
          statusCode: action.statusCode
        }
      });

      await input.audit.record(
        {
          category: "alarm.action",
          action: "alarm.action.documented",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId,
          metadata: {
            actionId: action.id,
            actionTypeId: action.actionTypeId,
            actionTypeCode: action.actionTypeCode,
            statusId: action.statusId,
            statusCode: action.statusCode
          }
        },
        { requestId }
      );

      return { action };
    },
    async acknowledgeCase(token, alarmCaseId, acknowledgeInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      const alarmCase = await requireWritableCase(input.store, alarmCaseId);

      if (alarmCase.lifecycleStatus === "resolved") {
        throw new AppError("Resolved alarm cases can no longer be acknowledged.", {
          status: 409,
          code: "ALARM_CASE_ALREADY_CLOSED"
        });
      }

      const activeAssignment = await input.store.getActiveOwnerAssignment(alarmCaseId);
      if (!activeAssignment) {
        throw new AppError("Alarm case must be reserved before it can be acknowledged.", {
          status: 409,
          code: "ALARM_ACKNOWLEDGE_REQUIRES_RESERVATION"
        });
      }

      const canOverride = hasAnyRole(session.user.roles, overrideRoles);
      if (activeAssignment.userId !== session.user.id && !canOverride) {
        throw new AppError("Only the reserving operator or override roles can acknowledge this alarm.", {
          status: 403,
          code: "ALARM_ACKNOWLEDGE_FORBIDDEN"
        });
      }

      if (alarmCase.lifecycleStatus === "in_progress") {
        return { alarmCase };
      }

      const updatedCase = await input.store.updateLifecycleStatus(alarmCaseId, "in_progress");
      await input.store.appendEvent({
        alarmCaseId,
        eventKind: "status_changed",
        actorUserId: session.user.id,
        message: "Alarm case acknowledged and moved into active processing.",
        payload: {
          previousLifecycleStatus: alarmCase.lifecycleStatus,
          lifecycleStatus: updatedCase.lifecycleStatus
        }
      });

      if (acknowledgeInput.comment?.trim()) {
        const comment = await input.store.createComment({
          alarmCaseId,
          userId: session.user.id,
          commentKind: "operator_note",
          body: acknowledgeInput.comment.trim(),
          context: "acknowledge"
        });
        await input.store.appendEvent({
          alarmCaseId,
          eventKind: "comment_added",
          actorUserId: session.user.id,
          message: "Acknowledge note added to alarm case.",
          payload: {
            commentId: comment.id,
            commentKind: comment.commentKind
          }
        });
      }

      await input.audit.record(
        {
          category: "alarm.case",
          action: "alarm.case.acknowledged",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId,
          metadata: {
            previousLifecycleStatus: alarmCase.lifecycleStatus,
            lifecycleStatus: updatedCase.lifecycleStatus
          }
        },
        { requestId }
      );

      return { alarmCase: updatedCase };
    },
    async setAssessment(token, alarmCaseId, assessmentInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      const alarmCase = await requireWritableCase(input.store, alarmCaseId);
      const falsePositiveReasonIds = uniqueIds(assessmentInput.falsePositiveReasonIds ?? []);

      if (assessmentInput.assessmentStatus === "false_positive" && falsePositiveReasonIds.length === 0) {
        throw new AppError("False positive assessment requires at least one reason.", {
          status: 400,
          code: "ALARM_FALSE_POSITIVE_REASON_REQUIRED"
        });
      }

      const availableReasons = await input.store.listFalsePositiveReasons();
      const availableReasonIds = new Set(availableReasons.map((reason) => reason.id));
      for (const reasonId of falsePositiveReasonIds) {
        if (!availableReasonIds.has(reasonId)) {
          throw new AppError("False positive reason not found.", {
            status: 404,
            code: "ALARM_FALSE_POSITIVE_REASON_NOT_FOUND"
          });
        }
      }

      const updatedCase = await input.store.updateAssessment(alarmCaseId, assessmentInput.assessmentStatus);
      await input.store.replaceFalsePositiveReasons(
        alarmCaseId,
        assessmentInput.assessmentStatus === "false_positive" ? falsePositiveReasonIds : []
      );
      const appliedReasons = assessmentInput.assessmentStatus === "false_positive"
        ? availableReasons.filter((reason) => falsePositiveReasonIds.includes(reason.id))
        : [];

      await input.store.appendEvent({
        alarmCaseId,
        eventKind: "assessment_changed",
        actorUserId: session.user.id,
        message: "Alarm assessment updated.",
        payload: {
          previousAssessmentStatus: alarmCase.assessmentStatus,
          assessmentStatus: updatedCase.assessmentStatus,
          falsePositiveReasonIds
        }
      });

      await input.audit.record(
        {
          category: "alarm.case",
          action: "alarm.case.assessment.updated",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId,
          metadata: {
            assessmentStatus: updatedCase.assessmentStatus,
            falsePositiveReasonIds
          }
        },
        { requestId }
      );

      return {
        alarmCase: updatedCase,
        falsePositiveReasons: appliedReasons
      };
    },
    async updateFollowUp(token, alarmCaseId, followUpInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      const alarmCase = await requireWritableOpenCase(input.store, alarmCaseId);
      const previousFollowUpAt = alarmCase.followUpAt;
      const previousFollowUpNote = alarmCase.followUpNote;

      if (followUpInput.clear) {
        if (!alarmCase.followUpAt && !alarmCase.followUpNote) {
          return { alarmCase };
        }

        const updatedCase = await input.store.updateFollowUp(alarmCaseId, {});
        await input.store.appendEvent({
          alarmCaseId,
          eventKind: "follow_up_cleared",
          actorUserId: session.user.id,
          message: "Wiedervorlage entfernt.",
          payload: {
            previousFollowUpAt,
            ...(previousFollowUpNote ? { previousFollowUpNote } : {})
          }
        });
        await input.audit.record(
          {
            category: "alarm.case",
            action: "alarm.case.follow_up.cleared",
            outcome: "success",
            actorId: session.user.id,
            subjectId: alarmCaseId
          },
          { requestId }
        );
        return { alarmCase: updatedCase };
      }

      if (!followUpInput.followUpAt) {
        throw new AppError("Follow-up timestamp is required.", {
          status: 400,
          code: "ALARM_FOLLOW_UP_AT_REQUIRED"
        });
      }

      const followUpAtDate = new Date(followUpInput.followUpAt);
      if (Number.isNaN(followUpAtDate.getTime())) {
        throw new AppError("Follow-up timestamp is invalid.", {
          status: 400,
          code: "ALARM_FOLLOW_UP_AT_INVALID"
        });
      }

      if (followUpAtDate.getTime() <= Date.now()) {
        throw new AppError("Follow-up timestamp must be in the future.", {
          status: 400,
          code: "ALARM_FOLLOW_UP_IN_PAST"
        });
      }

      const nextFollowUpNote = followUpInput.note?.trim() || undefined;
      if (previousFollowUpAt === followUpInput.followUpAt && previousFollowUpNote === nextFollowUpNote) {
        return { alarmCase };
      }

      const updatedCase = await input.store.updateFollowUp(alarmCaseId, {
        followUpAt: followUpInput.followUpAt,
        ...(nextFollowUpNote ? { followUpNote: nextFollowUpNote } : {})
      });
      await input.store.appendEvent({
        alarmCaseId,
        eventKind: "follow_up_updated",
        actorUserId: session.user.id,
        message: previousFollowUpAt ? "Wiedervorlage aktualisiert." : "Wiedervorlage gesetzt.",
        payload: {
          followUpAt: updatedCase.followUpAt,
          ...(updatedCase.followUpNote ? { followUpNote: updatedCase.followUpNote } : {}),
          ...(previousFollowUpAt ? { previousFollowUpAt } : {}),
          ...(previousFollowUpNote ? { previousFollowUpNote } : {})
        }
      });
      await input.audit.record(
        {
          category: "alarm.case",
          action: previousFollowUpAt ? "alarm.case.follow_up.updated" : "alarm.case.follow_up.set",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId,
          metadata: {
            followUpAt: updatedCase.followUpAt
          }
        },
        { requestId }
      );
      return { alarmCase: updatedCase };
    },
    async addComment(token, alarmCaseId, commentInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      await requireWritableCase(input.store, alarmCaseId);

      const comment = await input.store.createComment({
        alarmCaseId,
        userId: session.user.id,
        commentKind: commentInput.commentKind ?? "operator_note",
        body: commentInput.body,
        ...(commentInput.context ? { context: commentInput.context } : {})
      });

      await input.store.appendEvent({
        alarmCaseId,
        eventKind: "comment_added",
        actorUserId: session.user.id,
        message: "Comment added to alarm case.",
        payload: {
          commentId: comment.id,
          commentKind: comment.commentKind
        }
      });

      await input.audit.record(
        {
          category: "alarm.case",
          action: "alarm.case.comment.added",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId,
          metadata: {
            commentKind: comment.commentKind
          }
        },
        { requestId }
      );

      return { comment };
    },
    async closeCase(token, alarmCaseId, closeInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      const alarmCase = await requireWritableCase(input.store, alarmCaseId);

      if (alarmCase.lifecycleStatus === "resolved") {
        throw new AppError("Alarm case is already closed.", {
          status: 409,
          code: "ALARM_CASE_ALREADY_CLOSED"
        });
      }

      if (alarmCase.assessmentStatus === "pending") {
        throw new AppError("Alarm case requires an assessment before it can be closed.", {
          status: 409,
          code: "ALARM_CASE_ASSESSMENT_REQUIRED"
        });
      }

      const closureReason = await input.store.getClosureReasonById(closeInput.closureReasonId);
      if (!closureReason) {
        throw new AppError("Closure reason not found.", {
          status: 404,
          code: "ALARM_CLOSURE_REASON_NOT_FOUND"
        });
      }

      const activeAssignment = await input.store.getActiveOwnerAssignment(alarmCaseId);
      if (activeAssignment) {
        const canOverride = hasAnyRole(session.user.roles, overrideRoles);
        if (activeAssignment.userId !== session.user.id && !canOverride) {
          throw new AppError("Only the reserving operator or override roles can close this alarm.", {
            status: 403,
            code: "ALARM_CLOSE_FORBIDDEN"
          });
        }

        const released = await input.store.releaseAssignment(alarmCaseId, new Date().toISOString(), "case_closed");
        if (released && (await input.store.countActiveAssignmentsForUser(released.userId)) === 0) {
          await input.identity.restoreFromAlarmAssignment(released.userId);
        }
        if (released) {
          await input.store.appendEvent({
            alarmCaseId,
            eventKind: "assignment_changed",
            actorUserId: session.user.id,
            message: "Alarm reservation released during case closure.",
            payload: {
              action: "release",
              releasedUserId: released.userId,
              reason: "case_closed"
            }
          });
        }
      }

      if (alarmCase.assessmentStatus === "false_positive") {
        const falsePositiveReasons = await input.store.listFalsePositiveReasonsForCase(alarmCaseId);
        if (falsePositiveReasons.length === 0) {
          throw new AppError("False positive cases require at least one false positive reason before closing.", {
            status: 409,
            code: "ALARM_FALSE_POSITIVE_REASON_REQUIRED"
          });
        }
      }

      let closureCommentText: string | undefined;
      if (closeInput.comment?.trim()) {
        closureCommentText = closeInput.comment.trim();
        const comment = await input.store.createComment({
          alarmCaseId,
          userId: session.user.id,
          commentKind: "closure_note",
          body: closureCommentText
        });
        await input.store.appendEvent({
          alarmCaseId,
          eventKind: "comment_added",
          actorUserId: session.user.id,
          message: "Closure comment added to alarm case.",
          payload: {
            commentId: comment.id,
            commentKind: comment.commentKind
          }
        });
      }

      const resolvedAt = new Date().toISOString();
      const updatedCase = await input.store.closeCase(alarmCaseId, {
        resolvedAt,
        closureReasonId: closureReason.id,
        closedByUserId: session.user.id,
        ...(closureCommentText ? { closureComment: closureCommentText } : {})
      });

      if (alarmCase.followUpAt || alarmCase.followUpNote) {
        await input.store.appendEvent({
          alarmCaseId,
          eventKind: "follow_up_cleared",
          actorUserId: session.user.id,
          message: "Wiedervorlage beim Fallabschluss entfernt.",
          payload: {
            ...(alarmCase.followUpAt ? { previousFollowUpAt: alarmCase.followUpAt } : {}),
            ...(alarmCase.followUpNote ? { previousFollowUpNote: alarmCase.followUpNote } : {})
          }
        });
      }

      await input.store.appendEvent({
        alarmCaseId,
        eventKind: "status_changed",
        actorUserId: session.user.id,
        message: "Alarm case closed.",
        payload: {
          previousLifecycleStatus: alarmCase.lifecycleStatus,
          lifecycleStatus: updatedCase.lifecycleStatus,
          closureReasonId: closureReason.id
        }
      });

      await input.audit.record(
        {
          category: "alarm.case",
          action: "alarm.case.closed",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId,
          metadata: {
            closureReasonId: closureReason.id,
            assessmentStatus: updatedCase.assessmentStatus
          }
        },
        { requestId }
      );

      return {
        alarmCase: updatedCase,
        closureReason
      };
    },
    async archiveCase(token, alarmCaseId, archiveInput, requestId) {
      const session = await requireMutationSession(input.identity, token);
      const alarmCase = await requireCase(input.store, alarmCaseId);

      if (alarmCase.lifecycleStatus === "archived") {
        throw new AppError("Alarm case is already archived.", {
          status: 409,
          code: "ALARM_CASE_ALREADY_ARCHIVED"
        });
      }

      if (alarmCase.lifecycleStatus !== "resolved") {
        throw new AppError("Only resolved alarm cases can be archived.", {
          status: 409,
          code: "ALARM_CASE_ARCHIVE_REQUIRES_RESOLVED"
        });
      }

      const activeAssignment = await input.store.getActiveOwnerAssignment(alarmCaseId);
      if (activeAssignment) {
        throw new AppError("Alarm case cannot be archived while it is still reserved.", {
          status: 409,
          code: "ALARM_CASE_ARCHIVE_REQUIRES_RELEASED_ASSIGNMENT"
        });
      }

      if (archiveInput.comment?.trim()) {
        const comment = await input.store.createComment({
          alarmCaseId,
          userId: session.user.id,
          commentKind: "closure_note",
          body: archiveInput.comment.trim(),
          context: "archive"
        });
        await input.store.appendEvent({
          alarmCaseId,
          eventKind: "comment_added",
          actorUserId: session.user.id,
          message: "Archive comment added to alarm case.",
          payload: {
            commentId: comment.id,
            commentKind: comment.commentKind
          }
        });
      }

      const updatedCase = await input.store.archiveCase(alarmCaseId, {
        archivedAt: new Date().toISOString(),
        archivedByUserId: session.user.id
      });

      await input.store.appendEvent({
        alarmCaseId,
        eventKind: "status_changed",
        actorUserId: session.user.id,
        message: "Alarm case archived.",
        payload: {
          previousLifecycleStatus: alarmCase.lifecycleStatus,
          lifecycleStatus: updatedCase.lifecycleStatus
        }
      });

      await input.audit.record(
        {
          category: "alarm.case",
          action: "alarm.case.archived",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId
        },
        { requestId }
      );

      return { alarmCase: updatedCase };
    }
  };
}

async function requireMutationSession(identity: IdentityService, token: string) {
  const session = await identity.getSession(token);
  if (!hasAnyRole(session.user.roles, mutationRoles)) {
    throw new AppError("User is not allowed to modify alarm cases.", {
      status: 403,
      code: "ALARM_CASE_MUTATION_FORBIDDEN"
    });
  }
  return session;
}

async function requireMediaReadSession(identity: IdentityService, token: string) {
  const session = await identity.getSession(token);
  if (!hasAnyRole(session.user.roles, mediaReadRoles)) {
    throw new AppError("User is not allowed to read alarm media previews.", {
      status: 403,
      code: "ALARM_MEDIA_ACCESS_FORBIDDEN"
    });
  }
  return session;
}

async function requireCase(store: AlarmCoreStore, alarmCaseId: string) {
  const alarmCase = await store.getCaseById(alarmCaseId);
  if (!alarmCase) {
    throw new AppError("Alarm case not found.", {
      status: 404,
      code: "ALARM_CASE_NOT_FOUND"
    });
  }
  return alarmCase;
}

async function requireWritableCase(store: AlarmCoreStore, alarmCaseId: string) {
  const alarmCase = await requireCase(store, alarmCaseId);
  if (alarmCase.lifecycleStatus === "archived") {
    throw new AppError("Archived alarm cases are read-only.", {
      status: 409,
      code: "ALARM_CASE_ARCHIVED"
    });
  }
  return alarmCase;
}

async function requireWritableOpenCase(store: AlarmCoreStore, alarmCaseId: string) {
  const alarmCase = await requireWritableCase(store, alarmCaseId);
  if (alarmCase.lifecycleStatus === "resolved") {
    throw new AppError("Resolved alarm cases do not support active follow-ups.", {
      status: 409,
      code: "ALARM_FOLLOW_UP_REQUIRES_OPEN_CASE"
    });
  }
  return alarmCase;
}

function hasAnyRole(userRoles: UserRole[], allowedRoles: readonly UserRole[]): boolean {
  return userRoles.some((role) => allowedRoles.includes(role));
}

function uniqueIds(values: string[]): string[] {
  return [...new Set(values)];
}
