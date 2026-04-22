/**
 * Fachservice fuer Authentifizierung, Sessionzugriff und Benutzerstatus.
 *
 * Die Datei setzt die operativen Regeln des Identity-Moduls um: Login,
 * Rollenpruefung, Benutzerverwaltung, Statuswechsel und Logout-Guards.
 */
import { AppError, type AuditTrail, type Logger } from "@leitstelle/observability";
import type { AuditEvent, SessionInfo, UserRole, UserUpsertInput } from "@leitstelle/contracts";

import { verifyPassword } from "./passwords.js";
import type { LogoutGuard } from "./logout-guard.js";
import type {
  AuthenticatedSession,
  IdentityService,
  LoginInput,
  StatusChangeInput
} from "./types.js";
import type { IdentitySessionStore } from "./session-store.js";
import type { IdentityUserStore } from "./user-store.js";

type CreateIdentityServiceInput = {
  audit: AuditTrail;
  logger: Logger;
  sessions: IdentitySessionStore;
  users: IdentityUserStore;
  logoutGuard: LogoutGuard;
  forceReleaseAssignmentsForUser?: (userId: string, releasedAt: string, reason?: string) => Promise<number>;
};

export function createIdentityService(input: CreateIdentityServiceInput): IdentityService {
  const audit = async (event: AuditEvent, requestId: string): Promise<void> => {
    await input.audit.record(event, { requestId });
  };

  // Jede Session wird gegen die aktuelle Benutzerbasis aufgeloest; verwaiste
  // Sessions werden aktiv verworfen.
  const getAuthenticatedSession = async (token: string): Promise<AuthenticatedSession> => {
    const session = await input.sessions.getActive(token);
    const user = await input.users.getById(session.userId);

    if (!user) {
      await input.sessions.delete(token);
      throw new AppError("Session user is no longer available.", {
        status: 401,
        code: "AUTH_SESSION_ORPHANED"
      });
    }

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: input.users.toAuthenticatedUser(user)
    };
  };

  const buildSessionInfo = async (token: string): Promise<SessionInfo> => {
    const session = await getAuthenticatedSession(token);
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: session.user
    };
  };

  const getUserAdministrationOverview = async () => ({
    users: await input.users.listUsers()
  });

  const requireUserAdministrationReader = async (token: string) => {
    const session = await getAuthenticatedSession(token);
    if (!session.user.roles.some((role) => userAdministrationReadRoles.includes(role))) {
      throw new AppError("Insufficient role for user administration.", {
        status: 403,
        code: "IDENTITY_ADMIN_FORBIDDEN"
      });
    }
    return session;
  };

  const requireUserAdministrationWriter = async (token: string) => {
    const session = await requireUserAdministrationReader(token);
    if (!session.user.roles.some((role) => userAdministrationWriteRoles.includes(role))) {
      throw new AppError("Insufficient role for user administration changes.", {
        status: 403,
        code: "IDENTITY_ADMIN_WRITE_FORBIDDEN"
      });
    }
    return session;
  };

  const resolvePasswordLoginUser = async (identifier: string, password: string) => {
    if (identifier.length === 0 || password.length === 0) {
      throw new AppError("Identifier and password are required.", {
        status: 400,
        code: "AUTH_LOGIN_INVALID"
      });
    }

    const user = await input.users.findByIdentifier(identifier);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return undefined;
    }

    return user;
  };

  const resolveKioskLoginUser = async (kioskCode: string, kioskCodeLength: number) => {
    if (kioskCode.length === 0) {
      throw new AppError("Kiosk code is required.", {
        status: 400,
        code: "AUTH_KIOSK_CODE_REQUIRED"
      });
    }

    if (kioskCode.length !== kioskCodeLength) {
      throw new AppError("Kiosk code has an invalid length.", {
        status: 400,
        code: "AUTH_KIOSK_CODE_LENGTH_INVALID"
      });
    }

    return await input.users.findByKioskCode(kioskCode);
  };

  return {
    async login(credentials: LoginInput, requestId: string) {
      // Login bleibt zweigleisig: klassisches Passwort oder Kiosk-Code.
      const loginMode = credentials.mode;
      const identifier = credentials.identifier?.trim() ?? "";
      const password = credentials.password ?? "";
      const kioskCode = credentials.kioskCode?.trim() ?? "";
      const { kioskCodeLength } = await input.users.getCredentialPolicy();
      const user = loginMode === "kiosk_code"
        ? await resolveKioskLoginUser(kioskCode, kioskCodeLength)
        : await resolvePasswordLoginUser(identifier, password);

      if (!user) {
        await audit(
          {
            category: "identity.authentication",
            action: "auth.login.failed",
            outcome: "failure",
            subjectId: loginMode === "kiosk_code" ? "kiosk_code" : identifier,
            metadata: {
              ...(loginMode === "kiosk_code" ? { mode: "kiosk_code" } : { identifier, mode: "password" })
            }
          },
          requestId
        );

        input.logger.warn("auth.login.failed", loginMode === "kiosk_code" ? { mode: loginMode } : { identifier, mode: loginMode });

        throw new AppError("Invalid credentials.", {
          status: 401,
          code: "AUTH_LOGIN_FAILED"
        });
      }

      if (!user.isActive) {
        await audit(
          {
            category: "identity.authentication",
            action: "auth.login.inactive",
            outcome: "failure",
            subjectId: user.id
          },
          requestId
        );

        throw new AppError("User account is inactive.", {
          status: 403,
          code: "AUTH_USER_INACTIVE"
        });
      }

      await input.sessions.deleteByUserId(user.id);
      await input.users.updateStatus(user.id, "angemeldet");
      const session = await input.sessions.create(user.id);

      await audit(
        {
          category: "identity.authentication",
          action: "auth.login.succeeded",
          outcome: "success",
          actorId: user.id,
          subjectId: user.id,
          metadata: {
            loginMode,
            primaryRole: user.primaryRole,
            roles: user.roles
          }
        },
        requestId
      );

      return await buildSessionInfo(session.token);
    },
    async getSession(token) {
      return await getAuthenticatedSession(token);
    },
    async getUserAdministrationOverview(token, requestId) {
      const session = await requireUserAdministrationReader(token);
      await audit(
        {
          category: "identity.administration",
          action: "identity.user.overview.read",
          outcome: "success",
          actorId: session.user.id,
          subjectId: session.user.id
        },
        requestId
      );
      return await getUserAdministrationOverview();
    },
    async listActiveOperators(token) {
      await getAuthenticatedSession(token);
      const operators = await input.users.listActiveOperators();
      return operators.map((operator) => input.users.toAuthenticatedUser(operator));
    },
    async listAutoAssignableOperators() {
      const operators = await input.users.listActiveOperators();
      return operators
        .map((operator) => input.users.toAuthenticatedUser(operator))
        .filter((operator) => operator.status === "aktiv");
    },
    async upsertUser(token, userInput, requestId) {
      const session = await requireUserAdministrationWriter(token);
      const credentialPolicy = await input.users.getCredentialPolicy();
      assertAllowedUserMutation(session.user.id, session.user.roles, session.user.primaryRole, userInput);
      assertCredentialPolicy(userInput, credentialPolicy);
      const updated = await input.users.upsertUser({
        ...userInput,
        roles: normalizeRoles(userInput.roles)
      });
      await audit(
        {
          category: "identity.administration",
          action: "identity.user.upsert",
          outcome: "success",
          actorId: session.user.id,
          subjectId: updated.id,
          metadata: {
            primaryRole: updated.primaryRole,
            roles: updated.roles,
            isActive: updated.isActive,
            hasKioskCode: Boolean(updated.kioskCodeHash),
            hasAvatar: Boolean(updated.avatarDataUrl)
          }
        },
        requestId
      );
      return await getUserAdministrationOverview();
    },
    async setUserActivation(token, userId, activationInput, requestId) {
      const session = await requireUserAdministrationWriter(token);
      assertAllowedUserActivation(session.user.id, userId, activationInput.isActive);
      const updated = await input.users.setUserActive(userId, activationInput.isActive);
      await audit(
        {
          category: "identity.administration",
          action: activationInput.isActive ? "identity.user.reactivate" : "identity.user.deactivate",
          outcome: "success",
          actorId: session.user.id,
          subjectId: updated.id,
          metadata: {
            isActive: updated.isActive
          }
        },
        requestId
      );
      return await getUserAdministrationOverview();
    },
    async getUserById(userId) {
      const user = await input.users.getById(userId);

      if (!user) {
        throw new AppError("Unknown user.", {
          status: 404,
          code: "AUTH_USER_NOT_FOUND"
        });
      }

      return input.users.toAuthenticatedUser(user);
    },
    async setActive(token, requestId) {
      const session = await getAuthenticatedSession(token);
      const updated = await input.users.updateStatus(session.user.id, "aktiv");

      await audit(
        {
          category: "identity.status",
          action: "auth.status.active",
          outcome: "success",
          actorId: session.user.id,
          subjectId: session.user.id
        },
        requestId
      );

      return input.users.toAuthenticatedUser(updated);
    },
    async setPause(token, statusChange: StatusChangeInput, requestId) {
      const session = await getAuthenticatedSession(token);
      const reason = statusChange.reason?.trim();
      const updated = await input.users.updateStatus(session.user.id, "in_pause", reason);

      await audit(
        {
          category: "identity.status",
          action: "auth.pause.started",
          outcome: "success",
          actorId: session.user.id,
          subjectId: session.user.id,
          metadata: {
            reason
          }
        },
        requestId
      );

      return input.users.toAuthenticatedUser(updated);
    },
    async resumeFromPause(token, requestId) {
      const session = await getAuthenticatedSession(token);
      const updated = await input.users.updateStatus(session.user.id, "aktiv");

      await audit(
        {
          category: "identity.status",
          action: "auth.pause.ended",
          outcome: "success",
          actorId: session.user.id,
          subjectId: session.user.id
        },
        requestId
      );

      return input.users.toAuthenticatedUser(updated);
    },
    async logout(token, requestId, options) {
      const session = await getAuthenticatedSession(token);
      let logoutCheck = await input.logoutGuard.canLogout(session.user.id);

      if (!logoutCheck.allowed) {
        if (options?.forceReleaseAssignments === true && input.forceReleaseAssignmentsForUser) {
          const releasedAt = new Date().toISOString();
          const releasedCount = await input.forceReleaseAssignmentsForUser(session.user.id, releasedAt, "logout_force_release");
          logoutCheck = await input.logoutGuard.canLogout(session.user.id);
          await audit(
            {
              category: "identity.authentication",
              action: "auth.logout.force_release_assignments",
              outcome: logoutCheck.allowed ? "success" : "failure",
              actorId: session.user.id,
              subjectId: session.user.id,
              metadata: {
                releasedCount
              }
            },
            requestId
          );
        }
      }

      if (!logoutCheck.allowed) {
        await audit(
          {
            category: "identity.authentication",
            action: "auth.logout.blocked",
            outcome: "failure",
            actorId: session.user.id,
            subjectId: session.user.id,
            metadata: {
              reasons: logoutCheck.reasons
            }
          },
          requestId
        );

        throw new AppError("Logout is currently blocked.", {
          status: 409,
          code: "AUTH_LOGOUT_BLOCKED",
          detail: logoutCheck.reasons.map((reason) => reason.message).join(" ")
        });
      }

      await input.users.updateStatus(session.user.id, "offline");
      await input.sessions.delete(token);

      await audit(
        {
          category: "identity.authentication",
          action: "auth.logout.succeeded",
          outcome: "success",
          actorId: session.user.id,
          subjectId: session.user.id
        },
        requestId
      );
    },
    async markAssignedToAlarm(userId) {
      const updated = await input.users.updateStatus(userId, "assigned_to_alarm");
      return input.users.toAuthenticatedUser(updated);
    },
    async restoreFromAlarmAssignment(userId) {
      const updated = await input.users.updateStatus(userId, "aktiv");
      return input.users.toAuthenticatedUser(updated);
    }
  };
}

const userAdministrationReadRoles: UserRole[] = ["administrator", "leitstellenleiter"];
const userAdministrationWriteRoles: UserRole[] = ["administrator", "leitstellenleiter"];

function assertAllowedUserMutation(
  actorUserId: string,
  actorRoles: readonly UserRole[],
  actorPrimaryRole: UserRole,
  input: UserUpsertInput
): void {
  const normalizedRoles = normalizeRoles(input.roles);
  if (normalizedRoles.length === 0) {
    throw new AppError("At least one role is required.", {
      status: 400,
      code: "IDENTITY_ROLE_REQUIRED"
    });
  }

  if (!normalizedRoles.includes(input.primaryRole)) {
    throw new AppError("Primary role must be part of the assigned roles.", {
      status: 400,
      code: "IDENTITY_PRIMARY_ROLE_MISMATCH"
    });
  }

  if (!actorRoles.includes("administrator") && normalizedRoles.includes("administrator")) {
    throw new AppError("Only administrators may assign the administrator role.", {
      status: 403,
      code: "IDENTITY_ADMIN_ROLE_ASSIGNMENT_FORBIDDEN"
    });
  }

  if (input.id === actorUserId) {
    if (!input.isActive) {
      throw new AppError("You cannot deactivate your own account.", {
        status: 409,
        code: "IDENTITY_SELF_DEACTIVATION_FORBIDDEN"
      });
    }

    if (input.primaryRole !== actorPrimaryRole || !sameRoleSet(actorRoles, normalizedRoles)) {
      throw new AppError("You cannot change your own role assignment in user administration.", {
        status: 409,
        code: "IDENTITY_SELF_ROLE_CHANGE_FORBIDDEN"
      });
    }
  }
}

function assertAllowedUserActivation(actorUserId: string, targetUserId: string, isActive: boolean): void {
  if (!isActive && actorUserId === targetUserId) {
    throw new AppError("You cannot deactivate your own account.", {
      status: 409,
      code: "IDENTITY_SELF_DEACTIVATION_FORBIDDEN"
    });
  }
}

function normalizeRoles(roles: readonly UserRole[]): UserRole[] {
  return [...new Set(roles)].sort() as UserRole[];
}

function assertCredentialPolicy(
  input: UserUpsertInput,
  policy: { passwordMinLength: number; kioskCodeLength: number }
): void {
  if (input.password?.trim() && input.password.trim().length < policy.passwordMinLength) {
    throw new AppError(`Passwort muss mindestens ${policy.passwordMinLength} Zeichen lang sein.`, {
      status: 400,
      code: "IDENTITY_PASSWORD_TOO_SHORT"
    });
  }

  if (typeof input.kioskCode === "string" && input.kioskCode.trim().length !== policy.kioskCodeLength) {
    throw new AppError(`Kiosk-Code muss genau ${policy.kioskCodeLength} Zeichen lang sein.`, {
      status: 400,
      code: "IDENTITY_KIOSK_CODE_LENGTH_INVALID"
    });
  }

  if (typeof input.avatarDataUrl === "string") {
    const normalized = input.avatarDataUrl.trim();
    if (normalized.length > 0 && !normalized.startsWith("data:image/")) {
      throw new AppError("Benutzerbild muss als Bilddaten-URL uebergeben werden.", {
        status: 400,
        code: "IDENTITY_AVATAR_INVALID"
      });
    }
    if (normalized.length > 350000) {
      throw new AppError("Benutzerbild ist zu gross. Bitte ein kleineres Bild verwenden.", {
        status: 400,
        code: "IDENTITY_AVATAR_TOO_LARGE"
      });
    }
  }
}

function sameRoleSet(left: readonly UserRole[], right: readonly UserRole[]): boolean {
  const normalizedLeft = normalizeRoles(left);
  const normalizedRight = normalizeRoles(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((role, index) => role === normalizedRight[index]);
}
