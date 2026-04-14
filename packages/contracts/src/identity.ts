export const userRoles = ["administrator", "leitstellenleiter", "operator", "service"] as const;

export type UserRole = (typeof userRoles)[number];

export const userStatuses = ["offline", "angemeldet", "aktiv", "in_pause", "assigned_to_alarm"] as const;

export type UserStatus = (typeof userStatuses)[number];

export const loginModes = ["password", "kiosk_code"] as const;

export type LoginMode = (typeof loginModes)[number];

export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  primaryRole: UserRole;
  roles: UserRole[];
  isActive: boolean;
  status: UserStatus;
  pauseReason?: string;
  lastStatusChangeAt: string;
  avatarDataUrl?: string;
};

export type UserAdminRecord = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  primaryRole: UserRole;
  roles: UserRole[];
  isActive: boolean;
  status: UserStatus;
  pauseReason?: string;
  lastStatusChangeAt: string;
  createdAt: string;
  updatedAt: string;
  avatarDataUrl?: string;
  hasKioskCode: boolean;
};

export type UserAdministrationOverview = {
  users: UserAdminRecord[];
};

export type UserUpsertInput = {
  id?: string;
  username: string;
  email: string;
  displayName: string;
  primaryRole: UserRole;
  roles: UserRole[];
  isActive: boolean;
  password?: string;
  kioskCode?: string | null;
  avatarDataUrl?: string | null;
};

export type UserActivationInput = {
  isActive: boolean;
};

export type SessionInfo = {
  token: string;
  expiresAt: string;
  user: AuthenticatedUser;
};

export type LoginRequest = {
  mode: LoginMode;
  identifier?: string;
  password?: string;
  kioskCode?: string;
};

export type LoginResponse = {
  session: SessionInfo;
};

export type StatusChangeRequest = {
  reason?: string;
};

export type LogoutResponse = {
  loggedOut: true;
  blockedBy?: LogoutBlockReason[];
};

export type LogoutBlockReason = {
  code: string;
  message: string;
};
