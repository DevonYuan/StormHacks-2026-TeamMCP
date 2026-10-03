/**
 * Thin SQLite adapter backed by Node's built-in `node:sqlite`.
 *
 * This mirrors the small subset of the better-sqlite3 API that the
 * repositories rely on, so the persistence layer has no native build step.
 * `node:sqlite` is available in Node.js 22.5+ and is the documented escape
 * hatch for the native `better-sqlite3` addon.
 *
 * The module is looked up through `process.getBuiltinModule` rather than a
 * static `import` so bundlers (Vite/Rollup, which predate `node:sqlite`) do not
 * try to resolve it.
 */

type SqliteModule = typeof import('node:sqlite')

export interface SqliteRunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export interface SqliteStatement {
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  run(...params: unknown[]): SqliteRunResult
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement
  exec(sql: string): void
  pragma(source: string): void
  close(): void
}

function loadSqlite(): SqliteModule {
  const mod = process.getBuiltinModule('node:sqlite') as SqliteModule | undefined
  if (!mod) {
    throw new Error('node:sqlite is unavailable. Node.js 22.5 or newer is required.')
  }
  return mod
}

export function openDatabase(path: string): SqliteDatabase {
  const { DatabaseSync } = loadSqlite()
  const db = new DatabaseSync(path)
  return {
    prepare: (sql: string) => db.prepare(sql) as unknown as SqliteStatement,
    exec: (sql: string) => db.exec(sql),
    pragma: (source: string) => db.exec(`PRAGMA ${source}`),
    close: () => db.close(),
  }
}
