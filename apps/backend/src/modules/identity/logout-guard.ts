/**
 * Beschreibt die Schnittstelle fuer Logout-Pruefungen im Identity-Modul.
 */
import type { LogoutCheckResult } from "./types.js";

export type LogoutGuard = {
  canLogout: (userId: string) => Promise<LogoutCheckResult>;
};

type CreateLogoutGuardInput = {
  hasBlockingAssignments?: (userId: string) => Promise<boolean>;
};

export function createLogoutGuard(input: CreateLogoutGuardInput = {}): LogoutGuard {
  return {
    async canLogout(userId) {
      if (input.hasBlockingAssignments && (await input.hasBlockingAssignments(userId))) {
        return {
          allowed: false,
          reasons: [
            {
              code: "ACTIVE_ALARM_ASSIGNMENT",
              message: "User has an active alarm assignment."
            }
          ]
        };
      }

      return {
        allowed: true,
        reasons: []
      };
    }
  };
}