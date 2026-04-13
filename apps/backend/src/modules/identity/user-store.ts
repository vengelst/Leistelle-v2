import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import type { AuthenticatedUser, UserAdminRecord, UserRole, UserStatus, UserUpsertInput } from "@leitstelle/contracts";
import { AppError } from "@leitstelle/observability";

import type { DatabaseClient } from "../../db/client.js";
import { hashPassword } from "./passwords.js";
import type { IdentityUserRecord } from "./types.js";

export type IdentityUserStore = {
  findByIdentifier: (identifier: string) => Promise<IdentityUserRecord | undefined>;
  getById: (userId: string) => Promise<IdentityUserRecord | undefined>;
  listUsers: () => Promise<UserAdminRecord[]>;
  listActiveOperators: () => Promise<IdentityUserRecord[]>;
  upsertUser: (input: UserUpsertInput) => Promise<IdentityUserRecord>;
  setUserActive: (userId: string, isActive: boolean) => Promise<IdentityUserRecord>;
  updateStatus: (userId: string, status: UserStatus, pauseReason?: string) => Promise<IdentityUserRecord>;
  toAuthenticatedUser: (record: IdentityUserRecord) => AuthenticatedUser;
  toUserAdminRecord: (record: IdentityUserRecord) => UserAdminRecord;
};

type UserRow = {
  id: string;
  username: string;
  email: string;
  display_name: string;
  password_hash: string;
  primary_role: string;
  roles: string[];
  is_active: boolean;
  current_status: string;
  current_pause_reason: string | null;
  last_status_change_at: string;
  created_at: string;
  updated_at: string;
};

export function createIdentityUserStore(database: DatabaseClient): IdentityUserStore {
  return {
    async findByIdentifier(identifier) {
      const normalized = identifier.trim().toLowerCase();
      const result = await database.query<UserRow>(
        `
          select
            u.id,
            u.username,
            u.email,
            u.display_name,
            u.password_hash,
            u.primary_role,
            u.is_active,
            array_remove(array_agg(ur.role_key), null) as roles,
            u.current_status,
            u.current_pause_reason,
            u.last_status_change_at,
            u.created_at,
            u.updated_at
          from users u
          left join user_roles ur on ur.user_id = u.id
          where lower(u.username) = $1 or lower(u.email) = $1
          group by u.id
        `,
        [normalized]
      );

      return result.rows[0] ? toUserRecord(result.rows[0]) : undefined;
    },
    async getById(userId) {
      const result = await database.query<UserRow>(
        `
          select
            u.id,
            u.username,
            u.email,
            u.display_name,
            u.password_hash,
            u.primary_role,
            u.is_active,
            array_remove(array_agg(ur.role_key), null) as roles,
            u.current_status,
            u.current_pause_reason,
            u.last_status_change_at,
            u.created_at,
            u.updated_at
          from users u
          left join user_roles ur on ur.user_id = u.id
          where u.id = $1
          group by u.id
        `,
        [userId]
      );

      return result.rows[0] ? toUserRecord(result.rows[0]) : undefined;
    },
    async listActiveOperators() {
      const result = await database.query<UserRow>(
        `
          select
            u.id,
            u.username,
            u.email,
            u.display_name,
            u.password_hash,
            u.primary_role,
            u.is_active,
            array_remove(array_agg(ur.role_key), null) as roles,
            u.current_status,
            u.current_pause_reason,
            u.last_status_change_at,
            u.created_at,
            u.updated_at
          from users u
          join user_roles role_filter on role_filter.user_id = u.id and role_filter.role_key = 'operator'
          left join user_roles ur on ur.user_id = u.id
          join user_sessions s on s.user_id = u.id and s.expires_at > now()
          where u.current_status <> 'offline'
            and u.is_active = true
          group by u.id
          order by u.display_name asc
        `
      );

      return result.rows.map(toUserRecord);
    },
    async listUsers() {
      const result = await database.query<UserRow>(
        `
          select
            u.id,
            u.username,
            u.email,
            u.display_name,
            u.password_hash,
            u.primary_role,
            u.is_active,
            array_remove(array_agg(ur.role_key), null) as roles,
            u.current_status,
            u.current_pause_reason,
            u.last_status_change_at,
            u.created_at,
            u.updated_at
          from users u
          left join user_roles ur on ur.user_id = u.id
          group by u.id
          order by u.display_name asc, u.username asc
        `
      );

      return result.rows.map((row) => toUserAdminRecord(toUserRecord(row)));
    },
    async upsertUser(input) {
      return database.withTransaction(async (client) => {
        await ensureRolesExist(client, input.roles);

        const existingUser = input.id ? await loadUserForUpdate(client, input.id) : undefined;
        if (input.id && !existingUser) {
          throw new AppError("Unknown user.", {
            status: 404,
            code: "AUTH_USER_NOT_FOUND"
          });
        }
        const normalizedUsername = input.username.trim();
        const normalizedEmail = input.email.trim().toLowerCase();
        const passwordHash = input.password?.trim()
          ? hashPassword(input.password.trim())
          : existingUser?.passwordHash;

        if (!passwordHash) {
          throw new AppError("Initial password is required for new users.", {
            status: 400,
            code: "IDENTITY_USER_PASSWORD_REQUIRED"
          });
        }

        let row: UserRow | undefined;
        try {
          const result = existingUser
            ? await client.query<UserRow>(
                `
                  update users
                  set
                    username = $2,
                    email = $3,
                    display_name = $4,
                    password_hash = $5,
                    primary_role = $6,
                    is_active = $7,
                    current_status = case when $7 then current_status else 'offline' end,
                    current_pause_reason = case when $7 then current_pause_reason else null end,
                    updated_at = now()
                  where id = $1
                  returning
                    id,
                    username,
                    email,
                    display_name,
                    password_hash,
                    primary_role,
                    is_active,
                    current_status,
                    current_pause_reason,
                    last_status_change_at,
                    created_at,
                    updated_at
                `,
                [
                  existingUser.id,
                  normalizedUsername,
                  normalizedEmail,
                  input.displayName.trim(),
                  passwordHash,
                  input.primaryRole,
                  input.isActive
                ]
              )
            : await client.query<UserRow>(
                `
                  insert into users(
                    id,
                    username,
                    email,
                    display_name,
                    password_hash,
                    primary_role,
                    is_active,
                    current_status,
                    current_pause_reason,
                    last_status_change_at,
                    created_at,
                    updated_at
                  )
                  values ($1, $2, $3, $4, $5, $6, $7, 'offline', null, now(), now(), now())
                  returning
                    id,
                    username,
                    email,
                    display_name,
                    password_hash,
                    primary_role,
                    is_active,
                    current_status,
                    current_pause_reason,
                    last_status_change_at,
                    created_at,
                    updated_at
                `,
                [
                  input.id ?? randomUUID(),
                  normalizedUsername,
                  normalizedEmail,
                  input.displayName.trim(),
                  passwordHash,
                  input.primaryRole,
                  input.isActive
                ]
              );
          row = result.rows[0];
        } catch (error) {
          throw mapIdentityWriteError(error);
        }

        if (!row) {
          throw new AppError("User could not be stored.", {
            status: 500,
            code: "IDENTITY_USER_UPSERT_FAILED"
          });
        }

        await client.query("delete from user_roles where user_id = $1", [row.id]);
        for (const role of sortRoles(input.roles)) {
          await client.query(
            `
              insert into user_roles(user_id, role_key)
              values ($1, $2)
              on conflict (user_id, role_key) do nothing
            `,
            [row.id, role]
          );
        }

        if (!input.isActive) {
          await client.query("delete from user_sessions where user_id = $1", [row.id]);
          if ((existingUser?.status ?? row.current_status) !== "offline") {
            await client.query(
              `
                insert into user_status_history(id, user_id, status, pause_reason, changed_at, changed_by_user_id)
                values ($1, $2, 'offline', null, now(), $2)
              `,
              [randomUUID(), row.id]
            );
          }
        }

        return toUserRecord({
          ...row,
          current_status: input.isActive ? row.current_status : "offline",
          current_pause_reason: input.isActive ? row.current_pause_reason : null,
          roles: sortRoles(input.roles)
        });
      });
    },
    async setUserActive(userId, isActive) {
      return database.withTransaction(async (client) => {
        const update = await client.query<UserRow>(
          `
            update users
            set
              is_active = $2,
              current_status = case when $2 then current_status else 'offline' end,
              current_pause_reason = case when $2 then current_pause_reason else null end,
              updated_at = now()
            where id = $1
            returning
              id,
              username,
              email,
              display_name,
              password_hash,
              primary_role,
              is_active,
              current_status,
              current_pause_reason,
              last_status_change_at,
              created_at,
              updated_at
          `,
          [userId, isActive]
        );

        const row = update.rows[0];
        if (!row) {
          throw new AppError("Unknown user.", {
            status: 404,
            code: "AUTH_USER_NOT_FOUND"
          });
        }

        if (!isActive) {
          await client.query("delete from user_sessions where user_id = $1", [userId]);
          await client.query(
            `
              insert into user_status_history(id, user_id, status, pause_reason, changed_at, changed_by_user_id)
              values ($1, $2, 'offline', null, now(), $2)
            `,
            [randomUUID(), userId]
          );
        }

        const roles = await loadRoles(client, userId);
        return toUserRecord({
          ...row,
          roles
        });
      });
    },
    async updateStatus(userId, status, pauseReason) {
      return database.withTransaction(async (client) => {
        const update = await client.query<UserRow>(
          `
            update users
            set
              current_status = $2,
              current_pause_reason = $3,
              last_status_change_at = now()
            where id = $1
            returning
              id,
              username,
              email,
              display_name,
              password_hash,
              primary_role,
              is_active,
              current_status,
              current_pause_reason,
              last_status_change_at,
              created_at,
              updated_at
          `,
          [userId, status, pauseReason ?? null]
        );

        const row = update.rows[0];

        if (!row) {
          throw new AppError("Unknown user.", {
            status: 404,
            code: "AUTH_USER_NOT_FOUND"
          });
        }

        const roles = await loadRoles(client, userId);
        await client.query(
          `
            insert into user_status_history(id, user_id, status, pause_reason, changed_at, changed_by_user_id)
            values ($1, $2, $3, $4, now(), $2)
          `,
          [randomUUID(), userId, status, pauseReason ?? null]
        );

        return toUserRecord({
          ...row,
          roles
        });
      });
    },
    toAuthenticatedUser(record) {
      const user: AuthenticatedUser = {
        id: record.id,
        username: record.username,
        email: record.email,
        displayName: record.displayName,
        primaryRole: record.primaryRole,
        roles: [...record.roles],
        isActive: record.isActive,
        status: record.status,
        lastStatusChangeAt: record.lastStatusChangeAt
      };

      if (record.pauseReason) {
        user.pauseReason = record.pauseReason;
      }

      return user;
    },
    toUserAdminRecord(record) {
      return toUserAdminRecord(record);
    }
  };
}

function toUserRecord(row: UserRow): IdentityUserRecord {
  const result: IdentityUserRecord = {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    primaryRole: row.primary_role as IdentityUserRecord["primaryRole"],
    roles: row.roles as IdentityUserRecord["roles"],
    isActive: row.is_active,
    status: row.current_status as IdentityUserRecord["status"],
    lastStatusChangeAt: row.last_status_change_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (row.current_pause_reason) {
    result.pauseReason = row.current_pause_reason;
  }

  return result;
}

function toUserAdminRecord(record: IdentityUserRecord): UserAdminRecord {
  const user: UserAdminRecord = {
    id: record.id,
    username: record.username,
    email: record.email,
    displayName: record.displayName,
    primaryRole: record.primaryRole,
    roles: [...record.roles],
    isActive: record.isActive,
    status: record.status,
    lastStatusChangeAt: record.lastStatusChangeAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (record.pauseReason) {
    user.pauseReason = record.pauseReason;
  }

  return user;
}

async function loadRoles(client: PoolClient, userId: string): Promise<string[]> {
  const result = await client.query<{ role_key: string }>(
    "select role_key from user_roles where user_id = $1 order by role_key asc",
    [userId]
  );

  return result.rows.map((row) => row.role_key);
}

async function ensureRolesExist(client: PoolClient, roles: UserRole[]): Promise<void> {
  for (const role of roles) {
    await client.query(
      `
        insert into roles(role_key)
        values ($1)
        on conflict (role_key) do nothing
      `,
      [role]
    );
  }
}

async function loadUserForUpdate(client: PoolClient, userId: string): Promise<IdentityUserRecord | undefined> {
  const result = await client.query<UserRow>(
    `
      select
        u.id,
        u.username,
        u.email,
        u.display_name,
        u.password_hash,
        u.primary_role,
        u.is_active,
        array_remove(array_agg(ur.role_key), null) as roles,
        u.current_status,
        u.current_pause_reason,
        u.last_status_change_at,
        u.created_at,
        u.updated_at
      from users u
      left join user_roles ur on ur.user_id = u.id
      where u.id = $1
      group by u.id
    `,
    [userId]
  );

  return result.rows[0] ? toUserRecord(result.rows[0]) : undefined;
}

function sortRoles(roles: readonly UserRole[]): UserRole[] {
  return [...new Set(roles)].sort() as UserRole[];
}

function mapIdentityWriteError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new AppError("Benutzername oder E-Mail ist bereits vergeben.", {
      status: 409,
      code: "IDENTITY_USER_CONFLICT"
    });
  }

  throw error;
}
