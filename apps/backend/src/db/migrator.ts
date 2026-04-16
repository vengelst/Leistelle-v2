/**
 * Laufzeit-Migrator fuer SQL-Migrationsdateien.
 *
 * Die Datei fuehrt versionierte SQL-Dateien in definierter Reihenfolge aus und
 * merkt sich den Stand in `schema_migrations`, damit Deploys reproduzierbar
 * bleiben.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DatabaseClient } from "./client.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(currentDir, "../../migrations");

export async function runMigrations(database: DatabaseClient): Promise<string[]> {
  await database.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  const applied = await database.query<{ version: string }>("select version from schema_migrations");
  const appliedSet = new Set(applied.rows.map((row) => row.version));
  const executed: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), "utf8");
    await database.withTransaction(async (client) => {
      await client.query(sql);
      await client.query("insert into schema_migrations(version) values ($1)", [file]);
    });
    executed.push(file);
  }

  return executed;
}
