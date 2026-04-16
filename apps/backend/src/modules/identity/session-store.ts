/**
 * Persistiert und verwaltet Identity-Sessions in der Datenbank.
 */
import { randomBytes } from "node:crypto";

import { AppError } from "@leitstelle/observability";

import type { DatabaseClient } from "../../db/client.js";
import type { IdentitySessionRecord } from "./types.js";

export type IdentitySessionStore = {
  create: (userId: string) => Promise<IdentitySessionRecord>;
  getActive: (token: string) => Promise<IdentitySessionRecord>;
  delete: (token: string) => Promise<void>;
  deleteByUserId: (userId: string) => Promise<void>;
};

type SessionRow = {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
};

export function createIdentitySessionStore(database: DatabaseClient, sessionTtlHours: number): IdentitySessionStore {
  return {
    async create(userId) {
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + sessionTtlHours * 60 * 60 * 1000);
      const session: IdentitySessionRecord = {
        token: randomBytes(32).toString("hex"),
        userId,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString()
      };

      await database.query(
        `
          insert into user_sessions(token, user_id, created_at, expires_at)
          values ($1, $2, $3, $4)
        `,
        [session.token, session.userId, session.createdAt, session.expiresAt]
      );

      return session;
    },
    async getActive(token) {
      const result = await database.query<SessionRow>(
        `
          select token, user_id, created_at, expires_at
          from user_sessions
          where token = $1
        `,
        [token]
      );

      const row = result.rows[0];

      if (!row) {
        throw new AppError("Authentication required.", {
          status: 401,
          code: "AUTH_SESSION_MISSING"
        });
      }

      if (Date.parse(row.expires_at) <= Date.now()) {
        await database.query("delete from user_sessions where token = $1", [token]);
        throw new AppError("Session expired.", {
          status: 401,
          code: "AUTH_SESSION_EXPIRED"
        });
      }

      return {
        token: row.token,
        userId: row.user_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at
      };
    },
    async delete(token) {
      await database.query("delete from user_sessions where token = $1", [token]);
    },
    async deleteByUserId(userId) {
      await database.query("delete from user_sessions where user_id = $1", [userId]);
    }
  };
}