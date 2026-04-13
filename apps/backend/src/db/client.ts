import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import type { BackendRuntimeConfig } from "../config/runtime.js";

export type DatabaseClient = {
  query: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: readonly unknown[]
  ) => Promise<QueryResult<TRow>>;
  withTransaction: <TResult>(run: (client: PoolClient) => Promise<TResult>) => Promise<TResult>;
  close: () => Promise<void>;
};

export function createDatabaseClient(config: BackendRuntimeConfig): DatabaseClient {
  const pool = new Pool({
    connectionString: config.database.url
  });

  return {
    query(sql, values = []) {
      const parameters = [...values];
      return pool.query(sql, parameters);
    },
    async withTransaction(run) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const result = await run(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    }
  };
}

export async function verifyDatabaseConnection(database: DatabaseClient): Promise<void> {
  await database.query("select 1 as ok");
}
