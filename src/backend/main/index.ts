/**
 * Electron Main Process - Control Plane
 *
 * Responsibilities:
 * - Window management
 * - Gateway process supervision (start/stop/restart)
 * - OS keychain integration (safeStorage) for signing keys
 * - IPC bridge between renderer and gateway
 * - Auto-updater
 * - System tray (optional)
 */

import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { execFile, spawn, ChildProcess } from "node:child_process";
import { cpus, freemem, loadavg, totalmem } from "node:os";
import {
  GatewayConfig,
  GatewayConfigSchema,
  loadConfigFromEnv,
  mergeConfig,
  DEFAULT_GATEWAY_CONFIG,
  AppConfig,
  DEFAULT_APP_CONFIG,
} from "../shared/config.js";
import { ServerConfig } from "../shared/protocol.js";
import { PolicyDocument, PolicyRule } from "../shared/policy.js";
import {
  ActivityQuery,
  ActivityEntry,
  ActivityStats,
  ServerHealth,
  GatewayStatus,
} from "../shared/activity.js";
import type { AddPeerResult, HostStats, ShareInfo, TailnetDevicesResponse } from "../shared/types.js";
import pino from "pino";

const logger = pino({ name: "main" });

// Determine if we're in development
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// Gateway process reference
let gatewayProcess: ChildProcess | null = null;
let gatewayConfig: GatewayConfig;
let appConfig: AppConfig;
let mainWindow: BrowserWindow | null = null;
let isGatewayRunning = false;
// Shared handle for an in-flight start so concurrent callers can't race.
let gatewayStartPromise: Promise<void> | null = null;

// IPC channel names
const IPC_CHANNELS = {
  // Gateway control
  GATEWAY_START: "gateway:start",
  GATEWAY_STOP: "gateway:stop",
  GATEWAY_STATUS: "gateway:status",
  GATEWAY_LOG: "gateway:log",
  GATEWAY_EXPOSE: "gateway:expose",

  // Server management
  SERVERS_GET: "servers:get",
  SERVERS_CREATE: "servers:create",
  SERVERS_UPDATE: "servers:update",
  SERVERS_DELETE: "servers:delete",
  SERVERS_CONNECT: "servers:connect",
  SERVERS_DISCONNECT: "servers:disconnect",
  SERVERS_REFRESH: "servers:refresh",

  // Policy management
  POLICY_GET: "policy:get",
  POLICY_UPDATE: "policy:update",
  POLICY_ADD_RULE: "policy:addRule",
  POLICY_REMOVE_RULE: "policy:removeRule",

  // Activity log
  ACTIVITY_QUERY: "activity:query",
  ACTIVITY_STATS: "activity:stats",
  ACTIVITY_PRUNE: "activity:prune",

  // Health
  HEALTH_GET: "health:get",
  HOST_STATS: "host:stats",

  // Config
  CONFIG_GET: "config:get",
  CONFIG_UPDATE: "config:update",

  // Tailscale
  TAILSCALE_STATUS: "tailscale:status",
  TAILSCALE_WHOIS: "tailscale:whois",
  TAILSCALE_DEVICES: "tailscale:devices",

  // Share / peers
  SHARE_GET: "share:get",
  PEERS_ADD: "peers:add",
  PEERS_REMOVE: "peers:remove",

  // Real-time events (main -> renderer)
  EVENT_ACTIVITY: "event:activity",
  EVENT_SERVER_HEALTH: "event:serverHealth",
  EVENT_GATEWAY_STATUS: "event:gatewayStatus",
  EVENT_TOOLS_CHANGED: "event:toolsChanged",
} as const;

// Initialize configuration
// Settings the renderer may change. Never bindAddr: exposing goes through gateway:expose.
const USER_SETTINGS = ["port", "redactToolPayloads", "logLevel"] as const;

function pickUserSettings(source: Partial<GatewayConfig>): Partial<GatewayConfig> {
  return Object.fromEntries(
    USER_SETTINGS.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  ) as Partial<GatewayConfig>;
}

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function loadUserSettings(): Partial<GatewayConfig> {
  try {
    return pickUserSettings(JSON.parse(readFileSync(settingsPath(), "utf8")));
  } catch {
    return {};
  }
}

function initializeConfig(): void {
  const envConfig = loadConfigFromEnv();
  gatewayConfig = mergeConfig(DEFAULT_GATEWAY_CONFIG, loadUserSettings(), envConfig);
  appConfig = { ...DEFAULT_APP_CONFIG, gateway: gatewayConfig };
  logger.info({ gatewayConfig }, "Configuration loaded");
}

// Create main window
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, "../../frontend/preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load renderer. electron-vite sets ELECTRON_RENDERER_URL in dev;
  // otherwise load the built HTML from disk.
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../../frontend/renderer/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// Gateway process management

/**
 * Start the gateway process, sharing a single in-flight attempt between callers.
 *
 * Callers (e.g. peers:add) assume that once this resolves the HTTP API is
 * reachable. An earlier version resolved immediately whenever `gatewayProcess`
 * was set and left the child running after a timeout, so a single failed start
 * made every later call fetch a port nothing was listening on (ECONNREFUSED
 * 127.0.0.1:8788).
 */
function startGateway(): Promise<void> {
  if (isGatewayRunning && gatewayProcess) return Promise.resolve();
  if (gatewayStartPromise) return gatewayStartPromise;

  gatewayStartPromise = startGatewayProcess().finally(() => {
    gatewayStartPromise = null;
  });
  return gatewayStartPromise;
}

function startGatewayProcess(): Promise<void> {
  return new Promise((resolve, reject) => {
    // A handle left over from a previous failed attempt is dead to us.
    if (gatewayProcess) {
      try {
        gatewayProcess.kill("SIGKILL");
      } catch {
        // already gone
      }
      gatewayProcess = null;
      isGatewayRunning = false;
    }

    logger.info("Starting gateway process...");

    // Determine gateway entry point
    const gatewayEntry = isDev
      ? join(__dirname, "../../../src/backend/gateway/index.ts") // tsx will handle this
      : join(__dirname, "../gateway/index.js");

    const args = isDev
      ? ["--port", String(gatewayConfig.port), "--bind", gatewayConfig.bindAddr]
      : [];

    // Run the gateway with the system Node (it needs node:sqlite, ≥22.5). Spawning
    // `node --import tsx` directly — not `npx tsx` — keeps gatewayProcess as the real
    // process so SIGTERM kills it cleanly; an npx wrapper leaks the child (and the port).
    const child = spawn(
      "node",
      isDev ? ["--import", "tsx", gatewayEntry, ...args] : [gatewayEntry, ...args],
      {
        env: {
          ...process.env,
          GATEWAY_PORT: String(gatewayConfig.port),
          GATEWAY_BIND_ADDR: gatewayConfig.bindAddr,
          GATEWAY_DB_PATH: join(app.getPath("userData"), "gateway.db"),
          LOG_LEVEL: gatewayConfig.logLevel,
          REDACT_TOOL_PAYLOADS: String(gatewayConfig.redactToolPayloads),
          NODE_ENV: isDev ? "development" : "production",
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    gatewayProcess = child;

    child.stdout?.on("data", (data) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line) {
          try {
            const parsed = JSON.parse(line);
            if (typeof parsed.level === "number") {
              // Structured log from gateway
              const levelMap: Record<
                number,
                "trace" | "debug" | "info" | "warn" | "error" | "fatal"
              > = {
                10: "trace",
                20: "debug",
                30: "info",
                40: "warn",
                50: "error",
                60: "fatal",
              };
              const level = levelMap[parsed.level] ?? "info";
              logger[level]({ gateway: true, ...parsed }, parsed.msg);
            } else {
              logger.info({ gateway: true }, line);
            }
          } catch {
            logger.info({ gateway: true }, line);
          }
          // Forward to renderer
          mainWindow?.webContents.send(IPC_CHANNELS.GATEWAY_LOG, {
            timestamp: Date.now(),
            message: line,
          });
        }
      }
    });

    child.stderr?.on("data", (data) => {
      logger.error({ gateway: true }, data.toString());
      mainWindow?.webContents.send(IPC_CHANNELS.GATEWAY_LOG, {
        timestamp: Date.now(),
        message: data.toString(),
        level: "error",
      });
    });

    let settled = false;
    let ready = false;

    // Poll for readiness. The callbacks close over stopPolling/fail/timeout, which
    // are initialized synchronously before the first timer fires.
    const checkReady = setInterval(async () => {
      try {
        const response = await fetch(
          `http://127.0.0.1:${gatewayConfig.port}/health`,
        );
        if (response.ok && !settled) {
          settled = true;
          ready = true;
          stopPolling();
          isGatewayRunning = true;
          mainWindow?.webContents.send(
            IPC_CHANNELS.GATEWAY_STATUS,
            getGatewayStatus(),
          );
          resolve();
        }
      } catch {
        // Not ready yet
      }
    }, 500);

    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      if (!ready) {
        fail(
          new Error(
            "Gateway failed to start within 10 seconds. Check the gateway logs for the bind error.",
          ),
        );
      }
    }, 10000);

    const stopPolling = (): void => {
      clearInterval(checkReady);
      clearTimeout(timeout);
    };

    // Mark the attempt failed: stop polling, tear the child down, and reset state
    // so the next start is a clean one.
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      stopPolling();
      if (gatewayProcess === child) {
        gatewayProcess = null;
        isGatewayRunning = false;
        mainWindow?.webContents.send(
          IPC_CHANNELS.GATEWAY_STATUS,
          getGatewayStatus(),
        );
      }
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
      reject(error);
    };

    child.on("error", (error) => {
      logger.error({ error }, "Gateway process error");
      fail(error instanceof Error ? error : new Error(String(error)));
    });

    child.on("exit", (code, signal) => {
      logger.info({ code, signal }, "Gateway process exited");
      stopPolling();
      if (gatewayProcess === child) {
        gatewayProcess = null;
        isGatewayRunning = false;
        mainWindow?.webContents.send(
          IPC_CHANNELS.GATEWAY_STATUS,
          getGatewayStatus(),
        );
      }
      if (!ready) {
        fail(
          new Error(
            `Gateway exited before becoming ready (code ${code ?? "?"}${
              signal ? `, signal ${signal}` : ""
            }). Check the gateway logs for the bind error.`,
          ),
        );
      }
    });
  });
}

function stopGateway(): Promise<void> {
  return new Promise((resolve) => {
    const proc = gatewayProcess;
    if (!proc) {
      resolve();
      return;
    }

    logger.info("Stopping gateway process...");

    const finish = (): void => resolve();
    proc.once("exit", finish);
    proc.once("error", finish);
    proc.kill("SIGTERM");

    // Force kill after 5 seconds if it hasn't exited.
    setTimeout(() => {
      if (gatewayProcess === proc) proc.kill("SIGKILL");
    }, 5000);
  });
}

function getGatewayStatus(): GatewayStatus {
  return {
    running: isGatewayRunning,
    startedAt: gatewayProcess ? Date.now() : undefined,
    uptimeMs: gatewayProcess ? Date.now() : 0,
    boundAddress: gatewayConfig.bindAddr,
    port: gatewayConfig.port,
    connectedPeers: 0, // Would need to query gateway
    totalRequests: 0,
    activeSessions: 0,
  };
}

// HTTP helpers for talking to the gateway control API.
// The gateway always serves this on loopback too - even when the data plane is
// bound to the tailnet interface - so control fetches never depend on the bind.
function gatewayBaseUrl(): string {
  return `http://127.0.0.1:${gatewayConfig.port}`;
}

async function gatewayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${gatewayBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === "string") message = parsed.error;
    } catch {
      // keep the raw text
    }
    throw new Error(message || `Gateway request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const EMPTY_POLICY: PolicyDocument = {
  version: 1,
  defaultEffect: "deny",
  rules: [],
  updatedAt: 0,
  updatedBy: "system",
};

const EMPTY_ACTIVITY_STATS: ActivityStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  uniqueUsers: 0,
  uniqueServers: 0,
  avgDurationMs: 0,
  byMethod: {},
  byServer: {},
  byTool: {},
  byIdentity: {},
  errorsByCode: {},
};

/** Start the local gateway on demand (for flows that need a running proxy). */
async function ensureGatewayRunning(): Promise<void> {
  if (isGatewayRunning) return;
  await startGateway();
}

/** Like gatewayFetch, but returns a fallback when no gateway is running/reachable. */
async function gatewayFetchOr<T>(
  path: string,
  fallback: T,
  init?: RequestInit,
): Promise<T> {
  if (!isGatewayRunning) return fallback;
  try {
    return await gatewayFetch<T>(path, init);
  } catch {
    return fallback;
  }
}

// CPU % is the busy share of all core time since the previous call.
let prevCpus = cpus();
function hostStats(): HostStats {
  const now = cpus();
  let busy = 0;
  let total = 0;
  now.forEach((c, i) => {
    const sum = (t: typeof c.times): number => t.user + t.nice + t.sys + t.irq + t.idle;
    const dt = sum(c.times) - sum(prevCpus[i].times);
    total += dt;
    busy += dt - (c.times.idle - prevCpus[i].times.idle);
  });
  prevCpus = now;
  return {
    cpu: total ? (busy / total) * 100 : 0,
    cores: now.length,
    memUsed: totalmem() - freemem(),
    memTotal: totalmem(),
    load: loadavg()[0],
  };
}

interface LocalTailnetInfo {
  available: boolean;
  state: string | null;
  ip: string | null;
  hostname: string | null;
  dnsName: string | null;
}

// The Tailscale GUI apps don't put their CLI on PATH, so probe the usual spots.
const TAILSCALE_CLI_CANDIDATES = [
  "tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "C:\\Program Files\\Tailscale\\tailscale.exe",
  "C:\\Program Files (x86)\\Tailscale\\tailscale.exe",
];

/** Read this machine's tailnet identity directly (independent of the gateway process). */
function getLocalTailnet(): Promise<LocalTailnetInfo> {
  const down = (state: string | null): LocalTailnetInfo => ({
    available: false,
    state,
    ip: null,
    hostname: null,
    dnsName: null,
  });

  const attempt = (index: number): Promise<LocalTailnetInfo> =>
    new Promise((resolve) => {
      if (index >= TAILSCALE_CLI_CANDIDATES.length) {
        resolve(down(null));
        return;
      }
      execFile(
        TAILSCALE_CLI_CANDIDATES[index],
        ["status", "--json"],
        { timeout: 4000 },
        (error, stdout) => {
          if (error) {
            // Not usable (likely ENOENT) — try the next known location.
            resolve(attempt(index + 1));
            return;
          }
          try {
            const parsed = JSON.parse(stdout);
            const state: string = parsed?.BackendState ?? "Unknown";
            const ips: string[] = parsed?.Self?.TailscaleIPs ?? [];
            // The 100.x address is only bindable while the tunnel is actually up.
            const up = state === "Running" && ips.length > 0;
            resolve({
              available: up,
              state,
              ip: up ? ips[0] : null,
              hostname: parsed?.Self?.HostName ?? null,
              dnsName: parsed?.Self?.DNSName ?? null,
            });
          } catch {
            resolve(down(null));
          }
        },
      );
    });

  return attempt(0);
}

// IPC Handlers
function setupIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.HOST_STATS, hostStats);

  // Gateway control
  ipcMain.handle(IPC_CHANNELS.GATEWAY_START, async () => {
    await startGateway();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.GATEWAY_STOP, async () => {
    await stopGateway();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.GATEWAY_STATUS, async () => {
    if (!isGatewayRunning) return getGatewayStatus();
    try {
      const status = await gatewayFetch<GatewayStatus>("/api/status");
      return status;
    } catch {
      return getGatewayStatus();
    }
  });

  // Expose = bind the tailnet interface (when available) and (re)start the gateway.
  ipcMain.handle(IPC_CHANNELS.GATEWAY_EXPOSE, async () => {
    const tailnet = await getLocalTailnet();

    // Refuse before touching the running gateway so a misconfigured Tailscale
    // doesn't leave the user with no gateway at all.
    if (!tailnet.available || !tailnet.ip) {
      throw new Error(
        `Tailscale is not connected (state: ${tailnet.state ?? "unavailable"}). ` +
          `Connect Tailscale, then try again.`,
      );
    }

    // A running gateway keeps its old bind address, so restart to rebind.
    if (gatewayProcess) await stopGateway();

    gatewayConfig = GatewayConfigSchema.parse({ ...gatewayConfig, bindAddr: tailnet.ip });
    appConfig = { ...appConfig, gateway: gatewayConfig };

    await startGateway();
    return { success: true, bindAddr: gatewayConfig.bindAddr, tailnet };
  });

  // Server management (proxied to the gateway control API)
  ipcMain.handle(IPC_CHANNELS.SERVERS_GET, async () => {
    return gatewayFetchOr<ServerConfig[]>("/api/servers", []);
  });

  ipcMain.handle(
    IPC_CHANNELS.SERVERS_CREATE,
    async (
      _event,
      server: Omit<ServerConfig, "id" | "createdAt" | "updatedAt">,
    ) => {
      await ensureGatewayRunning();
      const created = await gatewayFetch<ServerConfig>("/api/servers", {
        method: "POST",
        body: JSON.stringify(server),
      });
      return { success: true, server: created };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SERVERS_UPDATE,
    async (_event, id: string, updates: Partial<ServerConfig>) => {
      const updated = await gatewayFetch<ServerConfig>(`/api/servers/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      return { success: true, server: updated };
    },
  );

  ipcMain.handle(IPC_CHANNELS.SERVERS_DELETE, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}`, {
      method: "DELETE",
    });
  });

  ipcMain.handle(IPC_CHANNELS.SERVERS_CONNECT, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}/connect`, {
      method: "POST",
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.SERVERS_DISCONNECT,
    async (_event, id: string) => {
      return gatewayFetch<{ success: boolean }>(
        `/api/servers/${id}/disconnect`,
        { method: "POST" },
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.SERVERS_REFRESH, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}/refresh`, {
      method: "POST",
    });
  });

  // Policy management
  ipcMain.handle(IPC_CHANNELS.POLICY_GET, async () => {
    return gatewayFetchOr<PolicyDocument>("/api/policy", EMPTY_POLICY);
  });

  ipcMain.handle(
    IPC_CHANNELS.POLICY_UPDATE,
    async (_event, policy: PolicyDocument) => {
      return gatewayFetch<{ success: boolean; policy: PolicyDocument }>(
        "/api/policy",
        {
          method: "PUT",
          body: JSON.stringify(policy),
        },
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.POLICY_ADD_RULE,
    async (_event, rule: PolicyRule) => {
      const policy = await gatewayFetch<PolicyDocument>("/api/policy");
      const updated: PolicyDocument = {
        ...policy,
        rules: [...policy.rules, rule],
        updatedAt: Date.now(),
        updatedBy: "ui",
      };
      await gatewayFetch("/api/policy", {
        method: "PUT",
        body: JSON.stringify(updated),
      });
      return { success: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.POLICY_REMOVE_RULE,
    async (_event, ruleId: string) => {
      const policy = await gatewayFetch<PolicyDocument>("/api/policy");
      const updated: PolicyDocument = {
        ...policy,
        rules: policy.rules.filter((r) => r.id !== ruleId),
        updatedAt: Date.now(),
        updatedBy: "ui",
      };
      await gatewayFetch("/api/policy", {
        method: "PUT",
        body: JSON.stringify(updated),
      });
      return { success: true };
    },
  );

  // Activity log
  ipcMain.handle(
    IPC_CHANNELS.ACTIVITY_QUERY,
    async (_event, query: ActivityQuery) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") {
          params.set(key, String(value));
        }
      }
      return gatewayFetchOr<ActivityEntry[]>(
        `/api/activity?${params.toString()}`,
        [],
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_STATS, async () => {
    return gatewayFetchOr<ActivityStats>(
      "/api/activity/stats",
      EMPTY_ACTIVITY_STATS,
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.ACTIVITY_PRUNE,
    async (_event, olderThanMs: number) => {
      return gatewayFetch<{ success: boolean; count: number }>(
        "/api/activity/prune",
        {
          method: "POST",
          body: JSON.stringify({ olderThanMs }),
        },
      );
    },
  );

  // Health
  ipcMain.handle(IPC_CHANNELS.HEALTH_GET, async () => {
    return gatewayFetchOr<ServerHealth[]>("/api/health", []);
  });

  // Config
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    return { gateway: gatewayConfig };
  });

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_UPDATE,
    async (_event, updates: Partial<GatewayConfig>) => {
      const allowed = pickUserSettings(updates);
      gatewayConfig = GatewayConfigSchema.parse({ ...gatewayConfig, ...allowed });
      appConfig = { ...appConfig, gateway: gatewayConfig };
      writeFileSync(
        settingsPath(),
        JSON.stringify({ ...loadUserSettings(), ...allowed }, null, 2),
      );
      // The gateway reads its config at spawn, so restart it to apply.
      if (gatewayProcess) {
        await stopGateway();
        await startGateway();
      }
      return { success: true, gateway: gatewayConfig };
    },
  );

  // Tailscale
  ipcMain.handle(IPC_CHANNELS.TAILSCALE_STATUS, async () => {
    if (!isGatewayRunning) {
      return { available: false, ip: null, hostname: null, dnsName: null };
    }
    return gatewayFetch<{
      available: boolean;
      ip: string | null;
      hostname: string | null;
      dnsName: string | null;
    }>("/api/tailscale");
  });

  ipcMain.handle(IPC_CHANNELS.TAILSCALE_WHOIS, async (_event, ip: string) => {
    return gatewayFetch(`/api/tailscale/whois?ip=${encodeURIComponent(ip)}`);
  });

  ipcMain.handle(IPC_CHANNELS.TAILSCALE_DEVICES, async () => {
    if (!isGatewayRunning) {
      return { available: false, self: null, devices: [] };
    }
    return gatewayFetch<TailnetDevicesResponse>("/api/tailscale/devices");
  });

  // Share + peers
  ipcMain.handle(IPC_CHANNELS.SHARE_GET, async () => {
    return gatewayFetch<ShareInfo>("/api/share");
  });

  ipcMain.handle(
    IPC_CHANNELS.PEERS_ADD,
    async (_event, address: string, probe?: boolean) => {
      // Registering a peer needs the local gateway (it proxies the peer's tools),
      // so start it on demand instead of relying on auto-start.
      await ensureGatewayRunning();
      return gatewayFetch<AddPeerResult>("/api/peers", {
        method: "POST",
        body: JSON.stringify({ address, probe: probe === true }),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.PEERS_REMOVE, async (_event, id: string) => {
    await ensureGatewayRunning();
    return gatewayFetch<{ success: boolean }>(`/api/peers/${id}`, {
      method: "DELETE",
    });
  });

  // External links
  ipcMain.on("shell:openExternal", (_event, url: string) => {
    void shell.openExternal(url);
  });
}

// App lifecycle
app.whenReady().then(async () => {
  initializeConfig();
  createWindow();
  setupIpcHandlers();

  // Auto-start gateway if configured
  if (appConfig.autoStartGateway) {
    try {
      await startGateway();
    } catch (error) {
      logger.error({ error }, "Failed to auto-start gateway");
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Don't quit on macOS - keep gateway running in background
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void stopGateway();
});

// Handle protocol links (for OAuth callbacks, etc.)
app.on("open-url", (event, url) => {
  event.preventDefault();
  mainWindow?.webContents.send("protocol:url", url);
});

// Export for testing
export {
  createWindow,
  startGateway,
  stopGateway,
  getGatewayStatus,
  IPC_CHANNELS,
};
