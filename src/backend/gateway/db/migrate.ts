/**
 * Database migration runner for the gateway.
 * Applies schema and tracks version.
 */

import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase, type SqliteDatabase } from './sqlite.js'
import { GatewayConfig } from '../../shared/config.js'

/**
 * Resolve the schema file across the different layouts the gateway can run in:
 * - dev / tsx: `src/gateway/db/schema.sql` (next to this file)
 * - bundled:   `dist/gateway/db/schema.sql`
 * - packaged:  `resources/gateway/db/schema.sql`
 */
function resolveSchemaPath(): string {
  const candidates = [
    join(__dirname, 'schema.sql'),
    join(__dirname, 'db', 'schema.sql'),
    join(__dirname, '..', 'gateway', 'db', 'schema.sql'),
    join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || '', 'gateway', 'db', 'schema.sql'),
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  throw new Error(`Unable to locate schema.sql. Looked in:\n${candidates.join('\n')}`)
}

export interface Migration {
  version: number
  name: string
  up: string
  down?: string
}

function loadMigrations(): Migration[] {
  return [
    {
      version: 1,
      name: 'initial_schema',
      up: readFileSync(resolveSchemaPath(), 'utf-8'),
    },
  ]
}

export function createDatabase(config: GatewayConfig): SqliteDatabase {
  const db = openDatabase(config.dbPath)

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')

  return db
}

export function runMigrations(db: SqliteDatabase): void {
  // Ensure schema_version table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
  `)

  const getVersion = db.prepare('SELECT MAX(version) as version FROM schema_version')
  const currentVersion = (getVersion.get() as { version: number } | undefined)?.version ?? 0

  for (const migration of loadMigrations()) {
    if (migration.version > currentVersion) {
      console.log(`Applying migration ${migration.version}: ${migration.name}`)
      db.exec(migration.up)
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
        .run(migration.version, Date.now())
      console.log(`Migration ${migration.version} applied successfully`)
    }
  }

  const finalVersion = (getVersion.get() as { version: number } | undefined)?.version ?? 0
  console.log(`Database at version ${finalVersion}`)
}

export function resetDatabase(config: GatewayConfig): SqliteDatabase {
  // Delete the database file and recreate
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${config.dbPath}${suffix}`
    try {
      if (existsSync(file)) unlinkSync(file)
    } catch {
      // ignore
    }
  }
  const db = createDatabase(config)
  runMigrations(db)
  return db
}

// CLI entry point - CommonJS way. The argv check prevents this block from
// firing when the module is inlined into the bundled gateway bundle (where
// `require.main === module` is true for the whole bundle).
const isDirectMigrationRun =
  require.main === module && /migrate\.(ts|js)$/.test(process.argv[1] || '')

if (isDirectMigrationRun) {
  const config: GatewayConfig = {
    port: 8788,
    bindAddr: '127.0.0.1',
    redactToolPayloads: true,
    sessionTtlMs: 24 * 60 * 60 * 1000,
    dbPath: process.env.GATEWAY_DB_PATH || 'gateway.db',
    logLevel: 'info',
  }

  const db = createDatabase(config)
  runMigrations(db)
  console.log('Migrations complete')
  process.exit(0)
}