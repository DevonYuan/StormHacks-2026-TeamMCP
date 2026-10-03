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

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import {
  GatewayConfig,
  GatewayConfigSchema,
  loadConfigFromEnv,
  mergeConfig,
  DEFAULT_GATEWAY_CONFIG,
  AppConfig,
  DEFAULT_APP_CONFIG,
} from '../shared/config.js'
import { ServerConfig } from '../shared/protocol.js'
import { PolicyDocument, PolicyRule } from '../shared/policy.js'
import {
  ActivityQuery,
  ActivityEntry,
  ActivityStats,
  ServerHealth,
  GatewayStatus,
} from '../shared/activity.js'
import pino from 'pino'

const logger = pino({ name: 'main' })

// Determine if we're in development
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Gateway process reference
let gatewayProcess: ChildProcess | null = null
let gatewayConfig: GatewayConfig
let appConfig: AppConfig
let mainWindow: BrowserWindow | null = null
let isGatewayRunning = false

// IPC channel names
const IPC_CHANNELS = {
  // Gateway control
  GATEWAY_START: 'gateway:start',
  GATEWAY_STOP: 'gateway:stop',
  GATEWAY_STATUS: 'gateway:status',
  GATEWAY_LOG: 'gateway:log',

  // Server management
  SERVERS_GET: 'servers:get',
  SERVERS_CREATE: 'servers:create',
  SERVERS_UPDATE: 'servers:update',
  SERVERS_DELETE: 'servers:delete',
  SERVERS_CONNECT: 'servers:connect',
  SERVERS_DISCONNECT: 'servers:disconnect',
  SERVERS_REFRESH: 'servers:refresh',

  // Policy management
  POLICY_GET: 'policy:get',
  POLICY_UPDATE: 'policy:update',
  POLICY_ADD_RULE: 'policy:addRule',
  POLICY_REMOVE_RULE: 'policy:removeRule',

  // Activity log
  ACTIVITY_QUERY: 'activity:query',
  ACTIVITY_STATS: 'activity:stats',
  ACTIVITY_PRUNE: 'activity:prune',

  // Health
  HEALTH_GET: 'health:get',

  // Config
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',

  // Tailscale
  TAILSCALE_STATUS: 'tailscale:status',
  TAILSCALE_WHOIS: 'tailscale:whois',

  // Real-time events (main -> renderer)
  EVENT_ACTIVITY: 'event:activity',
  EVENT_SERVER_HEALTH: 'event:serverHealth',
  EVENT_GATEWAY_STATUS: 'event:gatewayStatus',
  EVENT_TOOLS_CHANGED: 'event:toolsChanged',
} as const

// Initialize configuration
function initializeConfig(): void {
  const envConfig = loadConfigFromEnv()
  gatewayConfig = mergeConfig(DEFAULT_GATEWAY_CONFIG, {}, envConfig)
  appConfig = { ...DEFAULT_APP_CONFIG, gateway: gatewayConfig }
  logger.info({ gatewayConfig }, 'Configuration loaded')
}

// Create main window
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Load renderer. electron-vite sets ELECTRON_RENDERER_URL in dev;
  // otherwise load the built HTML from disk.
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// Gateway process management
function startGateway(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (gatewayProcess) {
      logger.warn('Gateway already running')
      resolve()
      return
    }

    logger.info('Starting gateway process...')

    // Determine gateway entry point
    const gatewayEntry = isDev
      ? join(__dirname, '../../src/gateway/index.ts') // tsx will handle this
      : join(__dirname, '../gateway/index.js')

    const args = isDev ? ['--port', String(gatewayConfig.port), '--bind', gatewayConfig.bindAddr] : []

    gatewayProcess = spawn(
      isDev ? 'npx' : 'node',
      isDev ? ['tsx', gatewayEntry, ...args] : [gatewayEntry, ...args],
      {
        env: {
          ...process.env,
          GATEWAY_PORT: String(gatewayConfig.port),
          GATEWAY_BIND_ADDR: gatewayConfig.bindAddr,
          GATEWAY_DB_PATH: join(app.getPath('userData'), 'gateway.db'),
          LOG_LEVEL: gatewayConfig.logLevel,
          REDACT_TOOL_PAYLOADS: String(gatewayConfig.redactToolPayloads),
          NODE_ENV: isDev ? 'development' : 'production',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      }
    )

    gatewayProcess.stdout?.on('data', (data) => {
      const lines = data.toString().trim().split('\n')
      for (const line of lines) {
        if (line) {
          try {
            const parsed = JSON.parse(line)
            if (typeof parsed.level === 'number') {
              // Structured log from gateway
              const levelMap: Record<number, 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'> = {
                10: 'trace',
                20: 'debug',
                30: 'info',
                40: 'warn',
                50: 'error',
                60: 'fatal',
              }
              const level = levelMap[parsed.level] ?? 'info'
              logger[level]({ gateway: true, ...parsed }, parsed.msg)
            } else {
              logger.info({ gateway: true }, line)
            }
          } catch {
            logger.info({ gateway: true }, line)
          }
          // Forward to renderer
          mainWindow?.webContents.send(IPC_CHANNELS.GATEWAY_LOG, {
            timestamp: Date.now(),
            message: line,
          })
        }
      }
    })

    gatewayProcess.stderr?.on('data', (data) => {
      logger.error({ gateway: true }, data.toString())
      mainWindow?.webContents.send(IPC_CHANNELS.GATEWAY_LOG, {
        timestamp: Date.now(),
        message: data.toString(),
        level: 'error',
      })
    })

    gatewayProcess.on('error', (error) => {
      logger.error({ error }, 'Gateway process error')
      gatewayProcess = null
      isGatewayRunning = false
      mainWindow?.webContents.send(IPC_CHANNELS.GATEWAY_STATUS, getGatewayStatus())
      reject(error)
    })

    gatewayProcess.on('exit', (code, signal) => {
      logger.info({ code, signal }, 'Gateway process exited')
      gatewayProcess = null
      isGatewayRunning = false
      mainWindow?.webContents.send(IPC_CHANNELS.GATEWAY_STATUS, getGatewayStatus())
    })

    // Wait for gateway to be ready (health check)
    const checkReady = setInterval(async () => {
      try {
        const response = await fetch(`http://${gatewayConfig.bindAddr}:${gatewayConfig.port}/health`)
        if (response.ok) {
          clearInterval(checkReady)
          isGatewayRunning = true
          mainWindow?.webContents.send(IPC_CHANNELS.GATEWAY_STATUS, getGatewayStatus())
          resolve()
        }
      } catch {
        // Not ready yet
      }
    }, 500)

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkReady)
      if (!isGatewayRunning) {
        reject(new Error('Gateway failed to start within 10 seconds'))
      }
    }, 10000)
  })
}

function stopGateway(): void {
  if (!gatewayProcess) return

  logger.info('Stopping gateway process...')
  gatewayProcess.kill('SIGTERM')

  // Force kill after 5 seconds
  setTimeout(() => {
    if (gatewayProcess) {
      gatewayProcess.kill('SIGKILL')
      gatewayProcess = null
      isGatewayRunning = false
    }
  }, 5000)
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
  }
}

// HTTP helpers for talking to the gateway control API
function gatewayBaseUrl(): string {
  return `http://${gatewayConfig.bindAddr}:${gatewayConfig.port}`
}

async function gatewayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${gatewayBaseUrl()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Gateway request failed (${response.status}): ${text}`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Gateway control
  ipcMain.handle(IPC_CHANNELS.GATEWAY_START, async () => {
    await startGateway()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.GATEWAY_STOP, async () => {
    stopGateway()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.GATEWAY_STATUS, async () => {
    if (!isGatewayRunning) return getGatewayStatus()
    try {
      const status = await gatewayFetch<GatewayStatus>('/api/status')
      return status
    } catch {
      return getGatewayStatus()
    }
  })

  // Server management (proxied to the gateway control API)
  ipcMain.handle(IPC_CHANNELS.SERVERS_GET, async () => {
    return gatewayFetch<ServerConfig[]>('/api/servers')
  })

  ipcMain.handle(
    IPC_CHANNELS.SERVERS_CREATE,
    async (_event, server: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
      const created = await gatewayFetch<ServerConfig>('/api/servers', {
        method: 'POST',
        body: JSON.stringify(server),
      })
      return { success: true, server: created }
    }
  )

  ipcMain.handle(IPC_CHANNELS.SERVERS_UPDATE, async (_event, id: string, updates: Partial<ServerConfig>) => {
    const updated = await gatewayFetch<ServerConfig>(`/api/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
    return { success: true, server: updated }
  })

  ipcMain.handle(IPC_CHANNELS.SERVERS_DELETE, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}`, { method: 'DELETE' })
  })

  ipcMain.handle(IPC_CHANNELS.SERVERS_CONNECT, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}/connect`, { method: 'POST' })
  })

  ipcMain.handle(IPC_CHANNELS.SERVERS_DISCONNECT, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}/disconnect`, { method: 'POST' })
  })

  ipcMain.handle(IPC_CHANNELS.SERVERS_REFRESH, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}/refresh`, { method: 'POST' })
  })

  // Policy management
  ipcMain.handle(IPC_CHANNELS.POLICY_GET, async () => {
    return gatewayFetch<PolicyDocument>('/api/policy')
  })

  ipcMain.handle(IPC_CHANNELS.POLICY_UPDATE, async (_event, policy: PolicyDocument) => {
    return gatewayFetch<{ success: boolean; policy: PolicyDocument }>('/api/policy', {
      method: 'PUT',
      body: JSON.stringify(policy),
    })
  })

  ipcMain.handle(IPC_CHANNELS.POLICY_ADD_RULE, async (_event, rule: PolicyRule) => {
    const policy = await gatewayFetch<PolicyDocument>('/api/policy')
    const updated: PolicyDocument = {
      ...policy,
      rules: [...policy.rules, rule],
      updatedAt: Date.now(),
      updatedBy: 'ui',
    }
    await gatewayFetch('/api/policy', { method: 'PUT', body: JSON.stringify(updated) })
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.POLICY_REMOVE_RULE, async (_event, ruleId: string) => {
    const policy = await gatewayFetch<PolicyDocument>('/api/policy')
    const updated: PolicyDocument = {
      ...policy,
      rules: policy.rules.filter((r) => r.id !== ruleId),
      updatedAt: Date.now(),
      updatedBy: 'ui',
    }
    await gatewayFetch('/api/policy', { method: 'PUT', body: JSON.stringify(updated) })
    return { success: true }
  })

  // Activity log
  ipcMain.handle(IPC_CHANNELS.ACTIVITY_QUERY, async (_event, query: ActivityQuery) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value))
      }
    }
    return gatewayFetch<ActivityEntry[]>(`/api/activity?${params.toString()}`)
  })

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_STATS, async () => {
    return gatewayFetch<ActivityStats>('/api/activity/stats')
  })

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_PRUNE, async (_event, olderThanMs: number) => {
    return gatewayFetch<{ success: boolean; count: number }>('/api/activity/prune', {
      method: 'POST',
      body: JSON.stringify({ olderThanMs }),
    })
  })

  // Health
  ipcMain.handle(IPC_CHANNELS.HEALTH_GET, async () => {
    return gatewayFetch<ServerHealth[]>('/api/health')
  })

  // Config
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    return { gateway: gatewayConfig }
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_UPDATE, async (_event, updates: Partial<GatewayConfig>) => {
    gatewayConfig = GatewayConfigSchema.parse({ ...gatewayConfig, ...updates })
    appConfig = { ...appConfig, gateway: gatewayConfig }
    return { success: true, gateway: gatewayConfig }
  })

  // Tailscale
  ipcMain.handle(IPC_CHANNELS.TAILSCALE_STATUS, async () => {
    if (!isGatewayRunning) {
      return { available: false, ip: null, hostname: null, dnsName: null }
    }
    return gatewayFetch<{ available: boolean; ip: string | null; hostname: string | null; dnsName: string | null }>(
      '/api/tailscale'
    )
  })

  ipcMain.handle(IPC_CHANNELS.TAILSCALE_WHOIS, async (_event, ip: string) => {
    return gatewayFetch(`/api/tailscale/whois?ip=${encodeURIComponent(ip)}`)
  })

  // External links
  ipcMain.on('shell:openExternal', (_event, url: string) => {
    void shell.openExternal(url)
  })
}

// App lifecycle
app.whenReady().then(async () => {
  initializeConfig()
  createWindow()
  setupIpcHandlers()

  // Auto-start gateway if configured
  if (appConfig.autoStartGateway) {
    try {
      await startGateway()
    } catch (error) {
      logger.error({ error }, 'Failed to auto-start gateway')
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Don't quit on macOS - keep gateway running in background
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopGateway()
})

// Handle protocol links (for OAuth callbacks, etc.)
app.on('open-url', (event, url) => {
  event.preventDefault()
  mainWindow?.webContents.send('protocol:url', url)
})

// Export for testing
export { createWindow, startGateway, stopGateway, getGatewayStatus, IPC_CHANNELS }