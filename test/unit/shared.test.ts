import { describe, it, expect } from 'vitest'
import {
  namespaceTool,
  parseNamespacedTool,
  ServerConfigSchema,
  TransportType,
} from '../../src/backend/shared/protocol.js'
import { GatewayConfigSchema, loadConfigFromEnv, mergeConfig, DEFAULT_GATEWAY_CONFIG } from '../../src/backend/shared/config.js'
import { PolicyDocumentSchema, PolicyRuleSchema, IdentitySchema } from '../../src/backend/shared/policy.js'

describe('Protocol utilities', () => {
  describe('namespaceTool', () => {
    it('should create namespaced tool name', () => {
      expect(namespaceTool('filesystem', 'read_file')).toBe('filesystem__read_file')
      expect(namespaceTool('git', 'search_repository')).toBe('git__search_repository')
    })
  })

  describe('parseNamespacedTool', () => {
    it('should parse namespaced tool name', () => {
      expect(parseNamespacedTool('filesystem__read_file')).toEqual({
        serverId: 'filesystem',
        toolName: 'read_file',
      })
      expect(parseNamespacedTool('git__search_repository')).toEqual({
        serverId: 'git',
        toolName: 'search_repository',
      })
    })

    it('should return null for non-namespaced names', () => {
      expect(parseNamespacedTool('read_file')).toBeNull()
      expect(parseNamespacedTool('')).toBeNull()
    })
  })

  describe('ServerConfigSchema', () => {
    it('should validate stdio server config', () => {
      const config = {
        id: 'test-1',
        name: 'Test Server',
        transport: TransportType.Stdio,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const result = ServerConfigSchema.safeParse(config)
      expect(result.success).toBe(true)
    })

    it('should validate HTTP server config', () => {
      const config = {
        id: 'test-2',
        name: 'HTTP Server',
        transport: TransportType.StreamableHttp,
        url: 'http://localhost:3000/mcp',
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const result = ServerConfigSchema.safeParse(config)
      expect(result.success).toBe(true)
    })

    it('should reject invalid transport', () => {
      const config = {
        id: 'test-3',
        name: 'Invalid',
        transport: 'invalid',
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const result = ServerConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })
  })
})

describe('Config', () => {
  describe('GatewayConfigSchema', () => {
    it('should use defaults', () => {
      const result = GatewayConfigSchema.safeParse({})
      expect(result.success).toBe(true)
      expect(result.data.port).toBe(8788)
      expect(result.data.bindAddr).toBe('127.0.0.1')
      expect(result.data.redactToolPayloads).toBe(true)
    })

    it('should validate port range', () => {
      expect(GatewayConfigSchema.safeParse({ port: 0 }).success).toBe(false)
      expect(GatewayConfigSchema.safeParse({ port: 65536 }).success).toBe(false)
      expect(GatewayConfigSchema.safeParse({ port: 8080 }).success).toBe(true)
    })

    it('should validate log level', () => {
      expect(GatewayConfigSchema.safeParse({ logLevel: 'debug' }).success).toBe(true)
      expect(GatewayConfigSchema.safeParse({ logLevel: 'invalid' }).success).toBe(false)
    })
  })

  describe('loadConfigFromEnv', () => {
    it('should parse env vars', () => {
      process.env.GATEWAY_PORT = '9000'
      process.env.GATEWAY_BIND_ADDR = '100.1.2.3'
      process.env.REDACT_TOOL_PAYLOADS = 'false'
      process.env.LOG_LEVEL = 'debug'

      const config = loadConfigFromEnv()
      expect(config.port).toBe(9000)
      expect(config.bindAddr).toBe('100.1.2.3')
      expect(config.redactToolPayloads).toBe(false)
      expect(config.logLevel).toBe('debug')

      delete process.env.GATEWAY_PORT
      delete process.env.GATEWAY_BIND_ADDR
      delete process.env.REDACT_TOOL_PAYLOADS
      delete process.env.LOG_LEVEL
    })
  })

  describe('mergeConfig', () => {
    it('should merge with priority: env > file > defaults', () => {
      const defaults = DEFAULT_GATEWAY_CONFIG
      const fileConfig = { port: 9000 }
      const envConfig = { port: 9001, bindAddr: '100.1.2.3' }

      const merged = mergeConfig(defaults, fileConfig, envConfig)
      expect(merged.port).toBe(9001)
      expect(merged.bindAddr).toBe('100.1.2.3')
    })
  })
})

describe('Policy schemas', () => {
  describe('IdentitySchema', () => {
    it('should validate identity', () => {
      const identity = {
        user: 'alice@example.com',
        device: 'alice-laptop',
        deviceId: 'device-123',
        tailnet: 'example.com',
      }
      const result = IdentitySchema.safeParse(identity)
      expect(result.success).toBe(true)
    })
  })

  describe('PolicyRuleSchema', () => {
    it('should validate allow rule', () => {
      const rule = {
        id: 'rule-1',
        name: 'Test Rule',
        identities: [{ user: 'alice@example.com', device: '', deviceId: '', tailnet: '' }],
        servers: ['filesystem'],
        tools: ['filesystem__read_file'],
        effect: 'allow',
        priority: 10,
      }
      const result = PolicyRuleSchema.safeParse(rule)
      expect(result.success).toBe(true)
    })

    it('should validate deny rule', () => {
      const rule = {
        id: 'rule-2',
        name: 'Deny Rule',
        effect: 'deny',
        priority: 5,
      }
      const result = PolicyRuleSchema.safeParse(rule)
      expect(result.success).toBe(true)
    })

    it('should reject invalid effect', () => {
      const rule = {
        id: 'rule-3',
        name: 'Invalid',
        effect: 'invalid',
        priority: 10,
      }
      const result = PolicyRuleSchema.safeParse(rule)
      expect(result.success).toBe(false)
    })
  })

  describe('PolicyDocumentSchema', () => {
    it('should validate complete policy', () => {
      const policy = {
        version: 1,
        defaultEffect: 'deny',
        rules: [
          {
            id: 'rule-1',
            name: 'Allow all',
            identities: [{}],
            effect: 'allow',
            priority: 100,
          },
        ],
        updatedAt: Date.now(),
        updatedBy: 'test',
      }
      const result = PolicyDocumentSchema.safeParse(policy)
      expect(result.success).toBe(true)
    })
  })
})