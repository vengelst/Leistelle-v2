/**
 * Definiert die internen Typen und Storevertraege des Schichtplanungsmoduls.
 */
import type { ShiftPlanningFilter, UserRole, UserStatus } from "@leitstelle/contracts";

export type ShiftPlanEntity = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  assignmentUserIds: string[];
  handoverNote?: string;
  handoverNotedAt?: string;
  handoverNotedByUserId?: string;
  handoverNotedByDisplayName?: string;
  createdAt: string;
  updatedAt: string;
};

export type ShiftPlanningUserEntity = {
  id: string;
  displayName: string;
  primaryRole: UserRole;
  roles: UserRole[];
  currentStatus: UserStatus;
  pauseReason?: string;
  lastStatusChangeAt: string;
};

export type ShiftPlanningStoreOverview = {
  shifts: ShiftPlanEntity[];
  assignableUsers: ShiftPlanningUserEntity[];
};

export type ShiftStoreUpsertInput = {
  id?: string;
  title: string;
  startsAt: string;
  endsAt: string;
  assignmentUserIds: string[];
  handoverNote?: string;
  actorUserId: string;
};

export type ShiftPlanningStore = {
  getOverviewData: (range: { from: string; to: string }, filter: ShiftPlanningFilter) => Promise<ShiftPlanningStoreOverview>;
  upsertShift: (input: ShiftStoreUpsertInput) => Promise<void>;
};