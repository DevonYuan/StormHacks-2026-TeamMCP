/**
 * Configuration types for the gateway and application.
 */

import { z } from 'zod'
import { ServerConfigSchema } from './protocol.js'
import { PolicyDocumentSchema } from './policy.js'

// Gateway configuration
export const GatewayConfigSchema = z.object({
  // Network
  port: z.number().int().min(1).max(65535).default(8788),
  bindAddr: z.string().default('127.0.0.1'),
  // Tailscale
  tailscaleCli: z.string().optional(),
  // Security
  redactToolPayloads: z.boolean().default(true),
  // Session
  sessionTtlMs: z.number().int().positive().default(24 * 60 * 60 * 1000), // 24 hours
  // Database
  dbPath: z.string().default('gateway.db'),
  // Logging
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
})

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>

// Application configuration (Electron main process)
export const AppConfigSchema = z.object({
  gateway: GatewayConfigSchema.default(() => GatewayConfigSchema.parse({})),
  // UI
  window: z
    .object({
      width: z.number().int().positive().default(1200),
      height: z.number().int().positive().default(800),
      minWidth: z.number().int().positive().default(800),
      minHeight: z.number().int().positive().default(600),
    })
    .default({}),
  // Auto-start gateway on app launch
  autoStartGateway: z.boolean().default(false),
  // Check for updates
  checkUpdates: z.boolean().default(true),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

// Complete persisted state
export const PersistedStateSchema = z.object({
  version: z.number().int().default(1),
  servers: z.array(ServerConfigSchema),
  policy: PolicyDocumentSchema,
  config: GatewayConfigSchema,
})

export type PersistedState = z.infer<typeof PersistedStateSchema>

// Environment variable parsing
export function loadConfigFromEnv(): Partial<GatewayConfig> {
  const config: Partial<GatewayConfig> = {}

  if (process.env.GATEWAY_PORT) {
    config.port = parseInt(process.env.GATEWAY_PORT, 10)
  }
  if (process.env.GATEWAY_BIND_ADDR) {
    config.bindAddr = process.env.GATEWAY_BIND_ADDR
  }
  if (process.env.GATEWAY_DB_PATH) {
    config.dbPath = process.env.GATEWAY_DB_PATH
  }
  if (process.env.TAILSCALE_CLI) {
    config.tailscaleCli = process.env.TAILSCALE_CLI
  }
  if (process.env.REDACT_TOOL_PAYLOADS) {
    config.redactToolPayloads = process.env.REDACT_TOOL_PAYLOADS === 'true'
  }
  if (process.env.LOG_LEVEL) {
    config.logLevel = process.env.LOG_LEVEL as GatewayConfig['logLevel']
  }

  return config
}

// Merge configs with priority: env > file > defaults
export function mergeConfig(
  defaults: GatewayConfig,
  fileConfig: Partial<GatewayConfig>,
  envConfig: Partial<GatewayConfig>
): GatewayConfig {
  return GatewayConfigSchema.parse({
    ...defaults,
    ...fileConfig,
    ...envConfig,
  })
}

// Default configuration
export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = GatewayConfigSchema.parse({})

export const DEFAULT_APP_CONFIG: AppConfig = AppConfigSchema.parse({})