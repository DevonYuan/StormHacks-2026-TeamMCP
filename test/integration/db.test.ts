import { describe, it, expect, beforeEach } from 'vitest'
import { getTestDb, getTestRepos, cleanupTestDb } from './setup.js'
import { ServerConfig, TransportType } from '../../src/backend/shared/protocol.js'

describe('Database Repositories', () => {
  let repos: ReturnType<typeof getTestRepos>

  beforeEach(() => {
    repos = getTestRepos()
    // Clean up tables
    getTestDb().exec('DELETE FROM servers')
    getTestDb().exec('DELETE FROM server_capabilities')
    getTestDb().exec('DELETE FROM activity_log')
    getTestDb().exec('DELETE FROM server_health')
    getTestDb().exec('DELETE FROM revoked_tokens')
    getTestDb().exec('DELETE FROM policy')
  })

  afterAll(() => {
    cleanupTestDb()
  })

  describe('ServerRepository', () => {
    it('should create and retrieve a server', () => {
      const server: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Test Filesystem',
        transport: TransportType.Stdio,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        enabled: true,
        description: 'Test server',
      }

      const created = repos.servers.create(server)
      expect(created.id).toBeDefined()
      expect(created.name).toBe(server.name)
      expect(created.transport).toBe(server.transport)

      const retrieved = repos.servers.getById(created.id)
      expect(retrieved).toEqual(created)
    })

    it('should create HTTP server', () => {
      const server: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Test HTTP',
        transport: TransportType.StreamableHttp,
        url: 'http://localhost:3000/mcp',
        enabled: true,
      }

      const created = repos.servers.create(server)
      expect(created.transport).toBe(TransportType.StreamableHttp)
      expect(created.url).toBe(server.url)
    })

    it('should update server', () => {
      const created = repos.servers.create({
        name: 'Original',
        transport: TransportType.Stdio,
        command: 'npx',
        enabled: true,
      })

      const updated = repos.servers.update(created.id, { name: 'Updated', enabled: false })
      expect(updated?.name).toBe('Updated')
      expect(updated?.enabled).toBe(false)
    })

    it('should delete server', () => {
      const created = repos.servers.create({
        name: 'To Delete',
        transport: TransportType.Stdio,
        command: 'npx',
        enabled: true,
      })

      const deleted = repos.servers.delete(created.id)
      expect(deleted).toBe(true)

      const retrieved = repos.servers.getById(created.id)
      expect(retrieved).toBeUndefined()
    })

    it('should list all servers', () => {
      repos.servers.create({ name: 'Server 1', transport: TransportType.Stdio, command: 'npx', enabled: true })
      repos.servers.create({ name: 'Server 2', transport: TransportType.Stdio, command: 'npx', enabled: true })
      repos.servers.create({ name: 'Server 3', transport: TransportType.Stdio, command: 'npx', enabled: false })

      const all = repos.servers.getAll()
      expect(all.length).toBe(3)

      const enabled = repos.servers.getEnabled()
      expect(enabled.length).toBe(2)
    })
  })

  describe('PolicyRepository', () => {
    it('should return default policy when empty', () => {
      const policy = repos.policy.get()
      expect(policy.version).toBe(1)
      expect(policy.defaultEffect).toBe('deny')
    })

    it('should set and get policy', () => {
      const policy = {
        version: 2,
        defaultEffect: 'allow' as const,
        rules: [
          {
            id: 'rule-1',
            name: 'Test Rule',
            identities: [],
            effect: 'allow' as const,
            priority: 10,
          },
        ],
        updatedAt: Date.now(),
        updatedBy: 'test',
      }

      repos.policy.set(policy)
      const retrieved = repos.policy.get()
      expect(retrieved.version).toBe(2)
      expect(retrieved.defaultEffect).toBe('allow')
      expect(retrieved.rules.length).toBe(1)
    })

    it('should add and remove rules', () => {
      const rule = {
        id: 'new-rule',
        name: 'New Rule',
        identities: [],
        effect: 'allow' as const,
        priority: 5,
      }

      const withRule = repos.policy.addRule(rule, 'test-user')
      expect(withRule.rules.length).toBe(1)

      const withoutRule = repos.policy.removeRule('new-rule', 'test-user')
      expect(withoutRule.rules.length).toBe(0)
    })
  })

  describe('ActivityRepository', () => {
    it('should insert and query activity', () => {
      const entry = {
        timestamp: Date.now(),
        identity: {
          user: 'test@example.com',
          device: 'test-device',
          deviceId: 'device-123',
          tailnet: 'example.com',
        },
        method: 'tools/call',
        serverId: 'filesystem',
        toolName: 'read_file',
        requestSummary: 'read_file(path="/tmp/test.txt")',
        responseSummary: 'OK (100 bytes)',
        success: true,
        durationMs: 50,
      }

      const inserted = repos.activity.insert(entry)
      expect(inserted.id).toBeDefined()

      const results = repos.activity.query({ limit: 10 })
      expect(results.length).toBe(1)
      expect(results[0].method).toBe('tools/call')
    })

    it('should filter by identity', () => {
      repos.activity.insert({
        timestamp: Date.now(),
        identity: { user: 'alice@example.com', device: '', deviceId: '', tailnet: '' },
        method: 'tools/call',
        serverId: 'filesystem',
        requestSummary: 'test',
        responseSummary: 'OK',
        success: true,
        durationMs: 10,
      })

      repos.activity.insert({
        timestamp: Date.now(),
        identity: { user: 'bob@example.com', device: '', deviceId: '', tailnet: '' },
        method: 'tools/call',
        serverId: 'filesystem',
        requestSummary: 'test',
        responseSummary: 'OK',
        success: true,
        durationMs: 10,
      })

      const aliceResults = repos.activity.query({ identity: 'alice@example.com' })
      expect(aliceResults.length).toBe(1)
      expect(aliceResults[0].identity.user).toBe('alice@example.com')
    })

    it('should get stats', () => {
      repos.activity.insert({
        timestamp: Date.now(),
        identity: { user: 'alice@example.com', device: '', deviceId: '', tailnet: '' },
        method: 'tools/call',
        serverId: 'filesystem',
        requestSummary: 'test',
        responseSummary: 'OK',
        success: true,
        durationMs: 10,
      })

      repos.activity.insert({
        timestamp: Date.now(),
        identity: { user: 'alice@example.com', device: '', deviceId: '', tailnet: '' },
        method: 'tools/call',
        serverId: 'git',
        requestSummary: 'test',
        responseSummary: 'ERROR',
        success: false,
        errorCode: 500,
        errorMessage: 'Server error',
        durationMs: 100,
      })

      const stats = repos.activity.getStats()
      expect(stats.totalRequests).toBe(2)
      expect(stats.successfulRequests).toBe(1)
      expect(stats.failedRequests).toBe(1)
      expect(stats.uniqueUsers).toBe(1)
      expect(stats.uniqueServers).toBe(2)
    })
  })

  describe('ServerHealthRepository', () => {
    it('should record success and failure', () => {
      const server = repos.servers.create({
        name: 'Filesystem',
        transport: TransportType.Stdio,
        command: 'npx',
        enabled: true,
      })

      repos.health.recordSuccess(server.id, 50)
      let health = repos.health.get(server.id)
      expect(health?.status).toBe('healthy')
      expect(health?.latencyMs).toBe(50)
      expect(health?.consecutiveFailures).toBe(0)

      repos.health.recordFailure(server.id, 'Connection refused')
      health = repos.health.get(server.id)
      expect(health?.status).toBe('degraded')
      expect(health?.consecutiveFailures).toBe(1)
      expect(health?.error).toBe('Connection refused')

      // After 3 failures, should be unhealthy
      repos.health.recordFailure(server.id, 'Timeout')
      repos.health.recordFailure(server.id, 'Timeout')
      health = repos.health.get(server.id)
      expect(health?.status).toBe('unhealthy')
      expect(health?.consecutiveFailures).toBe(3)
    })
  })

  describe('RevokedTokenRepository', () => {
    it('should track revoked tokens', () => {
      const tokenHash = 'abc123'
      expect(repos.revokedTokens.isRevoked(tokenHash)).toBe(false)

      repos.revokedTokens.revoke(tokenHash, 'User logout')
      expect(repos.revokedTokens.isRevoked(tokenHash)).toBe(true)
    })
  })
})