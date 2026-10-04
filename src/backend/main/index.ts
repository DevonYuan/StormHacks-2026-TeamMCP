/**
 * Electron Main Process - Control Plane
 *
 * Responsibilities:
 * - Window management
 * - Gateway process supervision (start/stop/restart)
 * - Account IPC between the renderer and the gateway
 * - IPC bridge between renderer and gateway
 * - Auto-updater
 * - System tray (optional)
 */

import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFile, spawn, ChildProcess } from "node:child_process";
import { cpus, freemem, homedir, loadavg, totalmem } from "node:os";
import {
  GatewayConfig,
  GatewayConfigSchema,
  loadConfigFromEnv,
  mergeConfig,
  DEFAULT_GATEWAY_CONFIG,
  AppConfig,
  DEFAULT_APP_CONFIG,
} from "../shared/config.js";
import { GatewayStatus } from "../shared/activity.js";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { registerServerIpcHandlers } from "./ipc/servers.js";
import { registerPolicyActivityIpcHandlers } from "./ipc/policy-activity.js";
import { registerGatewayLifecycleIpcHandlers } from "./ipc/gateway-lifecycle.js";
import { registerSystemIpcHandlers } from "./ipc/system.js";
import { registerNetworkIpcHandlers } from "./ipc/network.js";
import { registerApprovalIpcHandlers } from "./ipc/approvals.js";
import type { HostStats } from "../shared/types.js";
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
// Guards the async quit sequence so `before-quit` runs its shutdown only once.
let quitting = false;

// Initialize configuration
// Settings the renderer may change. Never bindAddr: exposing goes through gateway:expose.
const USER_SETTINGS = ["port", "redactToolPayloads", "logLevel"] as const;

/** Keep only settings that the renderer is allowed to modify. */
function pickUserSettings(source: Partial<GatewayConfig>): Partial<GatewayConfig> {
  return Object.fromEntries(
    USER_SETTINGS.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  ) as Partial<GatewayConfig>;
}

/** Resolve the persisted settings file under Electron's user-data directory. */
function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

/** Load supported persisted settings, falling back to defaults when unavailable. */
function loadUserSettings(): Partial<GatewayConfig> {
  try {
    return pickUserSettings(JSON.parse(readFileSync(settingsPath(), "utf8")));
  } catch {
    return {};
  }
}

/** Merge defaults, persisted preferences, and environment configuration. */
function initializeConfig(): void {
  const envConfig = loadConfigFromEnv();
  gatewayConfig = mergeConfig(DEFAULT_GATEWAY_CONFIG, loadUserSettings(), envConfig);
  appConfig = { ...DEFAULT_APP_CONFIG, gateway: gatewayConfig };
  logger.info({ gatewayConfig }, "Configuration loaded");
}

/** Create the isolated Electron window and load the renderer application. */
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

// Packaged GUI apps get a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that
// excludes Homebrew, nvm and other user-managed locations, so a bare
// `spawn("node", …)` fails with ENOENT and the gateway never starts. Probe the
// usual install spots (mirroring TAILSCALE_CLI_CANDIDATES) and fall back to a
// PATH lookup for terminal launches on Linux.
const NODE_BINARY_CANDIDATES = [
  process.env["TEAM_MCP_NODE"],
  "/opt/homebrew/bin/node", // Homebrew (Apple Silicon)
  "/usr/local/bin/node", // Homebrew (Intel) / manual install
  "/usr/bin/node", // distro package (Linux)
  "C:\\Program Files\\nodejs\\node.exe",
  "C:\\Program Files (x86)\\nodejs\\node.exe",
].filter((candidate): candidate is string => Boolean(candidate));

/** Highest Node version installed under nvm, if any (nvm keeps them off PATH for GUI apps). */
function findNvmNode(): string | null {
  try {
    const root = join(homedir(), ".nvm", "versions", "node");
    const compare = (a: string, b: string): number => {
      const [aMajor = 0, aMinor = 0, aPatch = 0] = a.slice(1).split(".").map(Number);
      const [bMajor = 0, bMinor = 0, bPatch = 0] = b.slice(1).split(".").map(Number);
      return bMajor - aMajor || bMinor - aMinor || bPatch - aPatch;
    };
    const versions = readdirSync(root)
      .filter((name) => name.startsWith("v"))
      .sort(compare);
    for (const version of versions) {
      const binary = join(root, version, "bin", "node");
      if (existsSync(binary)) return binary;
    }
  } catch {
    // No nvm install — fall through.
  }
  return null;
}

/** Absolute path to a usable Node (≥22.5 for node:sqlite), or "node" from PATH. */
function resolveNodeBinary(): string {
  for (const candidate of NODE_BINARY_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return findNvmNode() ?? "node";
}

/** Spawn the standalone gateway and resolve after its HTTP API is ready. */
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

    // Determine gateway entry point. The gateway runs under the SYSTEM node (it
    // needs node:sqlite ≥22.5), and non-Electron Node cannot read files inside
    // app.asar — so electron-builder unpacks dist/backend/gateway/** (see
    // build.asarUnpack) and we rewrite the asar path to its unpacked location.
    // The replace is a no-op when asar is disabled.
    const gatewayEntry = isDev
      ? join(__dirname, "../../../src/backend/gateway/index.ts") // tsx will handle this
      : join(__dirname, "../gateway/index.js").replace("app.asar", "app.asar.unpacked");

    const args = isDev
      ? ["--port", String(gatewayConfig.port), "--bind", gatewayConfig.bindAddr]
      : [];

    // Run the gateway with the system Node (it needs node:sqlite, ≥22.5). Spawning
    // `node --import tsx` directly — not `npx tsx` — keeps gatewayProcess as the real
    // process so SIGTERM kills it cleanly; an npx wrapper leaks the child (and the port).
    const child = spawn(
      resolveNodeBinary(),
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

    // Keep the tail of the child's stderr so a bind failure (e.g. EADDRINUSE)
    // surfaces in the start error instead of just a generic timeout.
    let stderrTail = "";

    child.stderr?.on("data", (data) => {
      stderrTail = (stderrTail + data.toString()).slice(-600);
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
            `Gateway failed to start within 10 seconds.${stderrTail ? `\n${stderrTail.trim()}` : ""}`,
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
            }).${stderrTail ? `\n${stderrTail.trim()}` : ""}`,
          ),
        );
      }
    });
  });
}

/** Gracefully stop the child gateway process, forcing termination after a timeout. */
function stopGateway(): Promise<void> {
  return new Promise((resolve) => {
    const proc = gatewayProcess;
    if (!proc) {
      gatewayProcess = null;
      isGatewayRunning = false;
      resolve();
      return;
    }

    logger.info("Stopping gateway process...");

    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      // Reset state here too: the child's own exit handler normally does this,
      // but expose/restart paths must never see a stale "running" flag.
      if (gatewayProcess === proc) {
        gatewayProcess = null;
        isGatewayRunning = false;
        mainWindow?.webContents.send(
          IPC_CHANNELS.GATEWAY_STATUS,
          getGatewayStatus(),
        );
      }
      resolve();
    };
    proc.once("exit", finish);
    proc.once("error", finish);
    proc.kill("SIGTERM");

    // Force kill after 3 seconds if it hasn't exited.
    setTimeout(() => {
      if (!done) proc.kill("SIGKILL");
    }, 3000);
  });
}

/** Return the main process's local view of gateway status. */
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

/** Build the loopback URL used for main-process control requests. */
function gatewayBaseUrl(): string {
  return `http://127.0.0.1:${gatewayConfig.port}`;
}

/** Fetch a typed response from the gateway's local control API. */
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
/** Read CPU and memory statistics, computing CPU usage since the previous call. */
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
            // Prefer the IPv4 tailnet address: it is what peers dial, and binding
            // only to the IPv6 ULA would break their host:port URL.
            const ipv4 = ips.find((addr) => /^\d{1,3}(\.\d{1,3}){3}$/.test(addr));
            resolve({
              available: up,
              state,
              ip: up ? (ipv4 ?? ips[0]) : null,
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

/** Persist allowed gateway settings and restart the running child to apply them. */
async function updateGatewaySettings(
  updates: Partial<GatewayConfig>,
): Promise<GatewayConfig> {
  const allowed = pickUserSettings(updates);
  gatewayConfig = GatewayConfigSchema.parse({ ...gatewayConfig, ...allowed });
  appConfig = { ...appConfig, gateway: gatewayConfig };
  writeFileSync(
    settingsPath(),
    JSON.stringify({ ...loadUserSettings(), ...allowed }, null, 2),
  );
  if (gatewayProcess) {
    await stopGateway();
    await startGateway();
  }
  return gatewayConfig;
}

// IPC Handlers
/** Wire the IPC domain modules and the remaining main-process handlers. */
function setupIpcHandlers(): void {
  registerGatewayLifecycleIpcHandlers({
    startGateway,
    stopGateway,
    getGatewayStatus,
    gatewayFetch,
    isGatewayRunning: () => isGatewayRunning,
    getGatewayProcess: () => gatewayProcess,
    getGatewayConfig: () => gatewayConfig,
    setGatewayConfig: (config) => {
      gatewayConfig = config;
      appConfig = { ...appConfig, gateway: config };
    },
    getLocalTailnet,
  });

  registerServerIpcHandlers({
    gatewayFetch,
    gatewayFetchOr,
    ensureGatewayRunning,
  });

  registerPolicyActivityIpcHandlers({ gatewayFetch, gatewayFetchOr, ensureGatewayRunning });

  registerSystemIpcHandlers({
    hostStats,
    gatewayFetchOr,
    getGatewayConfig: () => gatewayConfig,
    updateGatewaySettings,
  });

  registerNetworkIpcHandlers({
    gatewayFetch,
    ensureGatewayRunning,
    isGatewayRunning: () => isGatewayRunning,
  });

  registerApprovalIpcHandlers({ gatewayFetch, ensureGatewayRunning });

  ipcMain.on(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, (_event, url: string) => {
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

app.on("before-quit", (event) => {
  // Wait for the gateway child to exit so it can't be orphaned holding its port.
  if (quitting || !gatewayProcess) return;
  event.preventDefault();
  quitting = true;
  void stopGateway().finally(() => app.quit());
});

// Handle protocol links (for OAuth callbacks, etc.)
app.on("open-url", (event, url) => {
  event.preventDefault();
  mainWindow?.webContents.send(IPC_CHANNELS.PROTOCOL_URL, url);
});

// Export for testing
export {
  createWindow,
  startGateway,
  stopGateway,
  getGatewayStatus,
  IPC_CHANNELS,
};
