/**
 * Database repositories for gateway entities.
 * Provides type-safe access to SQLite data.
 */

import { v4 as uuidv4 } from "uuid";
import type { SqliteDatabase } from "./sqlite.js";
import type {
  ServerConfig,
  TransportType,
  PolicyDocument,
  PolicyRule,
  ActivityEntry,
  ActivityQuery,
  ActivityStats,
  ServerHealth,
} from "../../shared/index.js";

// Row types from database
interface ServerRow {
  id: string;
  name: string;
  transport: TransportType;
  command: string | null;
  args: string | null;
  env: string | null;
  cwd: string | null;
  url: string | null;
  headers: string | null;
  enabled: number;
  description: string | null;
  created_at: number;
  updated_at: number;
}

interface ServerCapabilitiesRow {
  server_id: string;
  tools: string;
  resources: string;
  prompts: string;
  capabilities: string;
  last_fetched: number;
  fetch_error: string | null;
}

interface PolicyRow {
  id: number;
  version: number;
  default_effect: "allow" | "deny";
  rules: string;
  updated_at: number;
  updated_by: string;
}

interface ActivityRow {
  id: string;
  timestamp: number;
  identity_user: string;
  identity_device: string;
  identity_device_id: string;
  identity_tailnet: string;
  method: string;
  server_id: string;
  tool_name: string | null;
  request_summary: string;
  response_summary: string;
  success: number;
  error_code: number | null;
  error_message: string | null;
  duration_ms: number;
  request_payload: string | null;
  response_payload: string | null;
  created_at: number;
}

interface ServerHealthRow {
  server_id: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  last_check: number | null;
  latency_ms: number | null;
  error: string | null;
  consecutive_failures: number;
}

export class ServerRepository {
  constructor(private db: SqliteDatabase) {}

  private rowToConfig(row: ServerRow): ServerConfig {
    return {
      id: row.id,
      name: row.name,
      transport: row.transport,
      command: row.command ?? undefined,
      args: row.args ? JSON.parse(row.args) : undefined,
      env: row.env ? JSON.parse(row.env) : undefined,
      cwd: row.cwd ?? undefined,
      url: row.url ?? undefined,
      headers: row.headers ? JSON.parse(row.headers) : undefined,
      enabled: Boolean(row.enabled),
      description: row.description ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private configToRow(config: ServerConfig): ServerRow {
    const now = Date.now();
    return {
      id: config.id,
      name: config.name,
      transport: config.transport,
      command: config.command ?? null,
      args: config.args ? JSON.stringify(config.args) : null,
      env: config.env ? JSON.stringify(config.env) : null,
      cwd: config.cwd ?? null,
      url: config.url ?? null,
      headers: config.headers ? JSON.stringify(config.headers) : null,
      enabled: config.enabled ? 1 : 0,
      description: config.description ?? null,
      created_at: config.createdAt,
      updated_at: now,
    };
  }

  getAll(): ServerConfig[] {
    const stmt = this.db.prepare(
      "SELECT * FROM servers ORDER BY created_at ASC",
    );
    return stmt.all().map((row) => this.rowToConfig(row as ServerRow));
  }

  getEnabled(): ServerConfig[] {
    const stmt = this.db.prepare(
      "SELECT * FROM servers WHERE enabled = 1 ORDER BY created_at ASC",
    );
    return stmt.all().map((row) => this.rowToConfig(row as ServerRow));
  }

  getById(id: string): ServerConfig | undefined {
    const stmt = this.db.prepare("SELECT * FROM servers WHERE id = ?");
    const row = stmt.get(id) as ServerRow | undefined;
    return row ? this.rowToConfig(row) : undefined;
  }

  create(
    config: Omit<ServerConfig, "id" | "createdAt" | "updatedAt">,
  ): ServerConfig {
    const id = uuidv4();
    const now = Date.now();
    const fullConfig: ServerConfig = {
      ...config,
      id,
      createdAt: now,
      updatedAt: now,
    };
    const row = this.configToRow(fullConfig);
    const stmt = this.db.prepare(`
      INSERT INTO servers (id, name, transport, command, args, env, cwd, url, headers, enabled, description, created_at, updated_at)
      VALUES (@id, @name, @transport, @command, @args, @env, @cwd, @url, @headers, @enabled, @description, @created_at, @updated_at)
    `);
    stmt.run(row);
    return fullConfig;
  }

  /** Insert a config that already has an id. Used after a peer handshake succeeds. */
  save(config: ServerConfig): ServerConfig {
    const row = this.configToRow(config);
    const stmt = this.db.prepare(`
      INSERT INTO servers (id, name, transport, command, args, env, cwd, url, headers, enabled, description, created_at, updated_at)
      VALUES (@id, @name, @transport, @command, @args, @env, @cwd, @url, @headers, @enabled, @description, @created_at, @updated_at)
    `);
    stmt.run(row);
    return this.getById(config.id) ?? config;
  }

  update(
    id: string,
    updates: Partial<Omit<ServerConfig, "id" | "createdAt">>,
  ): ServerConfig | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const merged = { ...existing, ...updates, updatedAt: Date.now() };
    const row = this.configToRow(merged);
    const stmt = this.db.prepare(`
      UPDATE servers SET
        name = @name, transport = @transport, command = @command, args = @args, env = @env,
        cwd = @cwd, url = @url, headers = @headers, enabled = @enabled, description = @description,
        created_at = @created_at, updated_at = @updated_at
      WHERE id = @id
    `);
    stmt.run(row);
    return this.getById(id);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM servers WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Capabilities
  getCapabilities(serverId: string): ServerCapabilitiesRow | undefined {
    const stmt = this.db.prepare(
      "SELECT * FROM server_capabilities WHERE server_id = ?",
    );
    return stmt.get(serverId) as ServerCapabilitiesRow | undefined;
  }

  setCapabilities(
    serverId: string,
    caps: {
      tools: unknown[];
      resources: unknown[];
      prompts: unknown[];
      capabilities: unknown;
      error?: string;
    },
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO server_capabilities (server_id, tools, resources, prompts, capabilities, last_fetched, fetch_error)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_id) DO UPDATE SET
        tools = excluded.tools,
        resources = excluded.resources,
        prompts = excluded.prompts,
        capabilities = excluded.capabilities,
        last_fetched = excluded.last_fetched,
        fetch_error = excluded.fetch_error
    `);
    stmt.run(
      serverId,
      JSON.stringify(caps.tools),
      JSON.stringify(caps.resources),
      JSON.stringify(caps.prompts),
      JSON.stringify(caps.capabilities),
      Date.now(),
      caps.error ?? null,
    );
  }
}

export class PolicyRepository {
  constructor(private db: SqliteDatabase) {}

  private rowToPolicy(row: PolicyRow): PolicyDocument {
    return {
      version: row.version,
      defaultEffect: row.default_effect,
      rules: JSON.parse(row.rules),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  get(): PolicyDocument {
    const stmt = this.db.prepare("SELECT * FROM policy WHERE id = 1");
    const row = stmt.get() as PolicyRow | undefined;
    if (row) return this.rowToPolicy(row);

    // Return default policy if none exists
    return {
      version: 1,
      defaultEffect: "deny",
      rules: [],
      updatedAt: Date.now(),
      updatedBy: "system",
    };
  }

  set(policy: PolicyDocument): void {
    const stmt = this.db.prepare(`
      INSERT INTO policy (id, version, default_effect, rules, updated_at, updated_by)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        version = excluded.version,
        default_effect = excluded.default_effect,
        rules = excluded.rules,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `);
    stmt.run(
      policy.version,
      policy.defaultEffect,
      JSON.stringify(policy.rules),
      policy.updatedAt,
      policy.updatedBy,
    );
  }

  addRule(rule: PolicyRule, updatedBy: string): PolicyDocument {
    const policy = this.get();
    policy.rules.push(rule);
    policy.rules.sort(
      (a, b) =>
        b.priority - a.priority ||
        policy.rules.indexOf(a) - policy.rules.indexOf(b),
    );
    policy.updatedAt = Date.now();
    policy.updatedBy = updatedBy;
    this.set(policy);
    return policy;
  }

  removeRule(ruleId: string, updatedBy: string): PolicyDocument {
    const policy = this.get();
    policy.rules = policy.rules.filter((r) => r.id !== ruleId);
    policy.updatedAt = Date.now();
    policy.updatedBy = updatedBy;
    this.set(policy);
    return policy;
  }
}

export class ActivityRepository {
  constructor(private db: SqliteDatabase) {}

  private rowToEntry(row: ActivityRow): ActivityEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      identity: {
        user: row.identity_user,
        device: row.identity_device,
        deviceId: row.identity_device_id,
        tailnet: row.identity_tailnet,
      },
      method: row.method,
      serverId: row.server_id,
      toolName: row.tool_name ?? undefined,
      requestSummary: row.request_summary,
      responseSummary: row.response_summary,
      success: Boolean(row.success),
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
      durationMs: row.duration_ms,
      requestPayload: row.request_payload
        ? JSON.parse(row.request_payload)
        : undefined,
      responsePayload: row.response_payload
        ? JSON.parse(row.response_payload)
        : undefined,
    };
  }

  insert(entry: Omit<ActivityEntry, "id">): ActivityEntry {
    const id = uuidv4();
    const fullEntry: ActivityEntry = { ...entry, id };
    const stmt = this.db.prepare(`
      INSERT INTO activity_log (
        id, timestamp, identity_user, identity_device, identity_device_id, identity_tailnet,
        method, server_id, tool_name, request_summary, response_summary,
        success, error_code, error_message, duration_ms, request_payload, response_payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      fullEntry.id,
      fullEntry.timestamp,
      fullEntry.identity.user,
      fullEntry.identity.device,
      fullEntry.identity.deviceId,
      fullEntry.identity.tailnet,
      fullEntry.method,
      fullEntry.serverId,
      fullEntry.toolName ?? null,
      fullEntry.requestSummary,
      fullEntry.responseSummary,
      fullEntry.success ? 1 : 0,
      fullEntry.errorCode ?? null,
      fullEntry.errorMessage ?? null,
      fullEntry.durationMs,
      fullEntry.requestPayload
        ? JSON.stringify(fullEntry.requestPayload)
        : null,
      fullEntry.responsePayload
        ? JSON.stringify(fullEntry.responsePayload)
        : null,
      Date.now(),
    );
    return fullEntry;
  }

  query(query: ActivityQuery): ActivityEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.since) {
      conditions.push("timestamp >= ?");
      params.push(query.since);
    }
    if (query.until) {
      conditions.push("timestamp <= ?");
      params.push(query.until);
    }
    if (query.identity) {
      conditions.push("identity_user = ?");
      params.push(query.identity);
    }
    if (query.deviceId) {
      conditions.push("identity_device_id = ?");
      params.push(query.deviceId);
    }
    if (query.serverId) {
      conditions.push("server_id = ?");
      params.push(query.serverId);
    }
    if (query.toolName) {
      conditions.push("tool_name = ?");
      params.push(query.toolName);
    }
    if (query.method) {
      conditions.push("method = ?");
      params.push(query.method);
    }
    if (query.success !== undefined) {
      conditions.push("success = ?");
      params.push(query.success ? 1 : 0);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sortBy = query.sortBy === "duration_ms" ? "duration_ms" : "timestamp";
    const sortOrder = query.sortOrder === "asc" ? "ASC" : "DESC";
    const limit = Math.max(1, Math.min(query.limit ?? 100, 1000));
    const offset = Math.max(0, query.offset ?? 0);
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}`;
    const limitClause = `LIMIT ${limit} OFFSET ${offset}`;

    const sql = `SELECT * FROM activity_log ${where} ${orderBy} ${limitClause}`;
    const stmt = this.db.prepare(sql);
    return stmt
      .all(...params)
      .map((row) => this.rowToEntry(row as ActivityRow));
  }

  getStats(since?: number): ActivityStats {
    const base = since ? "WHERE" : "WHERE 1=1";
    const sinceClause = since ? " AND timestamp >= ?" : "";
    const sinceParams = since ? [since] : [];

    const total = this.db
      .prepare(`SELECT COUNT(*) as c FROM activity_log ${base}${sinceClause}`)
      .get(...sinceParams) as { c: number };
    const successful = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM activity_log ${base}${sinceClause} AND success = 1`,
      )
      .get(...sinceParams) as { c: number };
    const failed = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM activity_log ${base}${sinceClause} AND success = 0`,
      )
      .get(...sinceParams) as { c: number };
    const uniqueUsers = this.db
      .prepare(
        `SELECT COUNT(DISTINCT identity_user) as c FROM activity_log ${base}${sinceClause}`,
      )
      .get(...sinceParams) as { c: number };
    const uniqueServers = this.db
      .prepare(
        `SELECT COUNT(DISTINCT server_id) as c FROM activity_log ${base}${sinceClause}`,
      )
      .get(...sinceParams) as { c: number };
    const avgDuration = this.db
      .prepare(
        `SELECT AVG(duration_ms) as c FROM activity_log ${base}${sinceClause}`,
      )
      .get(...sinceParams) as { c: number | null };

    const byMethod = this.db
      .prepare(
        `SELECT method, COUNT(*) as c FROM activity_log ${base}${sinceClause} GROUP BY method`,
      )
      .all(...sinceParams) as { method: string; c: number }[];
    const byServer = this.db
      .prepare(
        `SELECT server_id, COUNT(*) as c FROM activity_log ${base}${sinceClause} GROUP BY server_id`,
      )
      .all(...sinceParams) as { server_id: string; c: number }[];
    const byTool = this.db
      .prepare(
        `SELECT tool_name, COUNT(*) as c FROM activity_log ${base}${sinceClause} AND tool_name IS NOT NULL GROUP BY tool_name`,
      )
      .all(...sinceParams) as { tool_name: string; c: number }[];
    const byIdentity = this.db
      .prepare(
        `SELECT identity_user, COUNT(*) as c FROM activity_log ${base}${sinceClause} GROUP BY identity_user`,
      )
      .all(...sinceParams) as { identity_user: string; c: number }[];
    const errorsByCode = this.db
      .prepare(
        `SELECT error_code, COUNT(*) as c FROM activity_log ${base}${sinceClause} AND error_code IS NOT NULL GROUP BY error_code`,
      )
      .all(...sinceParams) as { error_code: number; c: number }[];

    return {
      totalRequests: total.c,
      successfulRequests: successful.c,
      failedRequests: failed.c,
      uniqueUsers: uniqueUsers.c,
      uniqueServers: uniqueServers.c,
      avgDurationMs: avgDuration.c ?? 0,
      byMethod: Object.fromEntries(byMethod.map((m) => [m.method, m.c])),
      byServer: Object.fromEntries(byServer.map((s) => [s.server_id, s.c])),
      byTool: Object.fromEntries(byTool.map((t) => [t.tool_name, t.c])),
      byIdentity: Object.fromEntries(
        byIdentity.map((i) => [i.identity_user, i.c]),
      ),
      errorsByCode: Object.fromEntries(
        errorsByCode.map((e) => [String(e.error_code), e.c]),
      ),
    };
  }

  // Cleanup old entries (e.g., older than 30 days)
  prune(olderThanMs: number): number {
    const stmt = this.db.prepare(
      "DELETE FROM activity_log WHERE timestamp < ?",
    );
    const result = stmt.run(olderThanMs);
    return result.changes;
  }
}

export class ServerHealthRepository {
  constructor(private db: SqliteDatabase) {}

  private rowToHealth(row: ServerHealthRow): ServerHealth {
    return {
      serverId: row.server_id,
      status: row.status,
      lastCheck: row.last_check ?? undefined,
      latencyMs: row.latency_ms ?? undefined,
      error: row.error ?? undefined,
      consecutiveFailures: row.consecutive_failures,
    };
  }

  getAll(): ServerHealth[] {
    const stmt = this.db.prepare("SELECT * FROM server_health");
    return stmt.all().map((row) => this.rowToHealth(row as ServerHealthRow));
  }

  get(serverId: string): ServerHealth | undefined {
    const stmt = this.db.prepare(
      "SELECT * FROM server_health WHERE server_id = ?",
    );
    const row = stmt.get(serverId) as ServerHealthRow | undefined;
    return row ? this.rowToHealth(row) : undefined;
  }

  upsert(health: ServerHealth): void {
    const stmt = this.db.prepare(`
      INSERT INTO server_health (server_id, status, last_check, latency_ms, error, consecutive_failures)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_id) DO UPDATE SET
        status = excluded.status,
        last_check = excluded.last_check,
        latency_ms = excluded.latency_ms,
        error = excluded.error,
        consecutive_failures = excluded.consecutive_failures
    `);
    stmt.run(
      health.serverId,
      health.status,
      health.lastCheck ?? null,
      health.latencyMs ?? null,
      health.error ?? null,
      health.consecutiveFailures,
    );
  }

  recordSuccess(serverId: string, latencyMs: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO server_health (server_id, status, last_check, latency_ms, error, consecutive_failures)
      VALUES (?, 'healthy', ?, ?, NULL, 0)
      ON CONFLICT(server_id) DO UPDATE SET
        status = 'healthy',
        last_check = excluded.last_check,
        latency_ms = excluded.latency_ms,
        error = NULL,
        consecutive_failures = 0
    `);
    stmt.run(serverId, Date.now(), latencyMs);
  }

  recordFailure(serverId: string, error: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO server_health (server_id, status, last_check, latency_ms, error, consecutive_failures)
      VALUES (?, 'unhealthy', ?, NULL, ?, 1)
      ON CONFLICT(server_id) DO UPDATE SET
        status = CASE
          WHEN consecutive_failures + 1 >= 3 THEN 'unhealthy'
          ELSE 'degraded'
        END,
        last_check = excluded.last_check,
        error = excluded.error,
        consecutive_failures = consecutive_failures + 1
    `);
    stmt.run(serverId, Date.now(), error);
  }
}

export class RevokedTokenRepository {
  constructor(private db: SqliteDatabase) {}

  revoke(tokenHash: string, reason?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO revoked_tokens (token_hash, revoked_at, reason)
      VALUES (?, ?, ?)
    `);
    stmt.run(tokenHash, Date.now(), reason ?? null);
  }

  isRevoked(tokenHash: string): boolean {
    const stmt = this.db.prepare(
      "SELECT 1 FROM revoked_tokens WHERE token_hash = ?",
    );
    return !!stmt.get(tokenHash);
  }

  // Cleanup old revoked tokens (older than max session TTL)
  prune(olderThanMs: number): number {
    const stmt = this.db.prepare(
      "DELETE FROM revoked_tokens WHERE revoked_at < ?",
    );
    const result = stmt.run(olderThanMs);
    return result.changes;
  }
}

export function createRepositories(db: SqliteDatabase) {
  return {
    servers: new ServerRepository(db),
    policy: new PolicyRepository(db),
    activity: new ActivityRepository(db),
    health: new ServerHealthRepository(db),
    revokedTokens: new RevokedTokenRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
