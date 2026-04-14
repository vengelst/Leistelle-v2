import type {
  AuthenticatedUser,
  LoginRequest,
  LogoutBlockReason,
  SessionInfo,
  StatusChangeRequest,
  UserActivationInput,
  UserAdministrationOverview,
  UserAdminRecord,
  UserRole,
  UserStatus,
  UserUpsertInput
} from "@leitstelle/contracts";

export type IdentityUserRecord = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  passwordHash: string;
  kioskCodeHash?: string;
  primaryRole: UserRole;
  roles: UserRole[];
  isActive: boolean;
  status: UserStatus;
  pauseReason?: string;
  lastStatusChangeAt: string;
  createdAt: string;
  updatedAt: string;
  avatarDataUrl?: string;
};

export type IdentitySessionRecord = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

export type LogoutCheckResult = {
  allowed: boolean;
  reasons: LogoutBlockReason[];
};

export type LoginInput = LoginRequest;

export type StatusChangeInput = StatusChangeRequest;

export type IdentityService = {
  login: (input: LoginInput, requestId: string) => Promise<SessionInfo>;
  getSession: (token: string) => Promise<AuthenticatedSession>;
  getUserAdministrationOverview: (token: string, requestId: string) => Promise<UserAdministrationOverview>;
  listActiveOperators: (token: string) => Promise<AuthenticatedUser[]>;
  listAutoAssignableOperators: () => Promise<AuthenticatedUser[]>;
  upsertUser: (token: string, input: UserUpsertInput, requestId: string) => Promise<UserAdministrationOverview>;
  setUserActivation: (token: string, userId: string, input: UserActivationInput, requestId: string) => Promise<UserAdministrationOverview>;
  setActive: (token: string, requestId: string) => Promise<AuthenticatedUser>;
  setPause: (token: string, input: StatusChangeInput, requestId: string) => Promise<AuthenticatedUser>;
  resumeFromPause: (token: string, requestId: string) => Promise<AuthenticatedUser>;
  logout: (token: string, requestId: string) => Promise<void>;
  getUserById: (userId: string) => Promise<AuthenticatedUser>;
  markAssignedToAlarm: (userId: string) => Promise<AuthenticatedUser>;
  restoreFromAlarmAssignment: (userId: string) => Promise<AuthenticatedUser>;
};

export type AuthenticatedSession = {
  token: string;
  expiresAt: string;
  user: AuthenticatedUser;
};

export type IdentityAdminSession = AuthenticatedSession & {
  user: AuthenticatedUser;
};

export type IdentityAdminMutationSession = IdentityAdminSession;

export type IdentityUserAdminRecord = UserAdminRecord;
