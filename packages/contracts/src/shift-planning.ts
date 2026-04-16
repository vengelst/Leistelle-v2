/**
 * Gemeinsame Vertraege fuer das Schichtplanungsmodul.
 *
 * Die Datei beschreibt Planungszeiträume, Schichtzustaende und die Strukturen,
 * mit denen geplante Dienste und operative Besetzung im Frontend und Backend
 * dargestellt und bearbeitet werden.
 */
import type { UserRole, UserStatus } from "./identity.js";

export const shiftPlanningPeriods = ["day", "week", "month", "year", "custom"] as const;
export const shiftPlanningStates = ["planned", "running", "completed"] as const;

export type ShiftPlanningPeriod = (typeof shiftPlanningPeriods)[number];
export type ShiftPlanningState = (typeof shiftPlanningStates)[number];

export type ShiftPlanningFilter = {
  period: ShiftPlanningPeriod;
  dateFrom?: string;
  dateTo?: string;
  planningState?: ShiftPlanningState;
  userId?: string;
};

export type ShiftPlanningRange = {
  period: ShiftPlanningPeriod;
  from: string;
  to: string;
  label: string;
};

export type ShiftPresenceInfo = {
  currentStatus: UserStatus;
  hasActiveSession: boolean;
  lastStatusChangeAt: string;
  pauseReason?: string;
};

export type ShiftAssignableUser = {
  id: string;
  displayName: string;
  primaryRole: UserRole;
  roles: UserRole[];
  presence: ShiftPresenceInfo;
};

export type ShiftAssignment = {
  userId: string;
  displayName: string;
  primaryRole: UserRole;
  roles: UserRole[];
  presence: ShiftPresenceInfo;
};

export type ShiftRecord = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  planningState: ShiftPlanningState;
  assignments: ShiftAssignment[];
  handoverNote?: string;
  handoverNotedAt?: string;
  handoverNotedByUserId?: string;
  handoverNotedByDisplayName?: string;
  createdAt: string;
  updatedAt: string;
};

export type ShiftPlanningOverview = {
  filter: ShiftPlanningFilter;
  range: ShiftPlanningRange;
  summary: {
    plannedShifts: number;
    runningShifts: number;
    completedShifts: number;
    staffedAssignments: number;
    unstaffedShifts: number;
  };
  assignableUsers: ShiftAssignableUser[];
  shifts: ShiftRecord[];
};

export type ShiftUpsertInput = {
  id?: string;
  title: string;
  startsAt: string;
  endsAt: string;
  assignmentUserIds?: string[];
  handoverNote?: string;
};
