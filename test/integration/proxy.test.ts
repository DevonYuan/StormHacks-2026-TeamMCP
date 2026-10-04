/**
 * Integration tests for the MCP proxy server.
 *
 * These tests wire up the real MCPProxyServer over an HTTP server, backed by the
 * stdio fixture MCP server (test/fixtures/mcp-server.ts), and drive it with an
 * actual MCP SDK client over Streamable HTTP — exercising the full
 * client -> gateway proxy -> upstream MCP server path.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { getTestDb, getTestRepos } from './setup.js'
import { MCPClientManager } from '../../src/backend/gateway/mcp/client.js'
import { MCPProxyServer } from '../../src/backend/gateway/mcp/server.js'
import { createAuthManager } from '../../src/backend/gateway/auth/auth.js'
import { GatewayAccountService } from '../../src/backend/gateway/auth/accounts.js'
import { PolicyEngine } from '../../src/backend/gateway/authz/policy.js'
import { TransportType } from '../../src/backend/shared/protocol.js'
import type { ServerConfig } from '../../src/backend/shared/protocol.js'
import type { PolicyDocument } from '../../src/backend/shared/policy.js'
import type { GatewayConfig } from '../../src/backend/shared/config.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_SERVER = path.join(HERE, '..', 'fixtures', 'mcp-server.ts')

const TEST_CONFIG: GatewayConfig = {
  port: 8789,
  bindAddr: '127.0.0.1',
  redactToolPayloads: false,
  sessionTtlMs: 60 * 60 * 1000,
  dbPath: ':memory:',
  logLevel: 'error',
}

/** A policy that allows the loopback (`local@dev`) identity used in tests. */
function allowLocalPolicy(): PolicyDocument {
  return {
    version: 1,
    defaultEffect: 'deny',
    rules: [
      {
        id: 'test-allow-local',
        name: 'Allow local dev',
        identities: [{ user: 'local@dev', device: '', deviceId: '', tailnet: '' }],
        effect: 'allow',
        priority: 100,
      },
    ],
    updatedAt: Date.now(),
    updatedBy: 'test',
  }
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content ?? []
  return content.find((c) => c.type === 'text')?.text ?? ''
}

describe('MCP proxy (integration)', () => {
  let repos: ReturnType<typeof getTestRepos>
  let clientManager: MCPClientManager
  let proxyServer: MCPProxyServer
  let policyEngine: PolicyEngine
  let httpServer: HttpServer
  let baseUrl: string
  let fixtureServerId: string

  let client: Client

  const ns = (name: string): string => `${fixtureServerId}__${name}`

  const latestActivity = (toolName: string) =>
    repos.activity.query({ toolName, limit: 1, sortBy: 'timestamp', sortOrder: 'desc' })[0]

  beforeAll(async () => {
    repos = getTestRepos()

    const authManager = createAuthManager(TEST_CONFIG, repos.revokedTokens)
    await authManager.initialize()

    policyEngine = new PolicyEngine(allowLocalPolicy())
    clientManager = new MCPClientManager(TEST_CONFIG)

    const fixture: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'test-fixture',
      transport: TransportType.Stdio,
      command: process.execPath,
      args: ['--import', 'tsx', FIXTURE_SERVER],
      enabled: true,
    }
    const created = repos.servers.create(fixture)
    fixtureServerId = created.id
    await clientManager.connect(created)

    proxyServer = new MCPProxyServer({
      config: TEST_CONFIG,
      clientManager,
      policyEngine,
      authManager,
      accountService: new GatewayAccountService(repos.accounts),
      activityRepo: repos.activity,
      healthRepo: repos.health,
    })
    await proxyServer.start()

    httpServer = createServer((req, res) => {
      void proxyServer.handleRequest(req, res)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const { port } = httpServer.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
  }, 30000)

  afterAll(async () => {
    await proxyServer.shutdown()
    await clientManager.disconnectAll()
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve())
      httpServer.closeAllConnections()
    })
  })

  beforeEach(async () => {
    getTestDb().exec('DELETE FROM activity_log')
    policyEngine.updatePolicy(allowLocalPolicy())
    client = new Client({ name: 'proxy-it', version: '1.0.0' }, { capabilities: {} })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)))
  })

  afterEach(async () => {
    await client.close()
  })

  it('aggregates and namespaces upstream tools', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)

    expect(names).toContain(ns('echo'))
    expect(names).toContain(ns('store'))
    expect(names).toContain(ns('retrieve'))
    expect(names.every((n) => n.startsWith(`${fixtureServerId}__`))).toBe(true)
  })

  it('forwards a tools/call and records a successful activity entry', async () => {
    const result = await client.callTool({ name: ns('echo'), arguments: { message: 'hello' } })

    expect(result.isError).toBeFalsy()
    expect(textOf(result)).toBe('Echo: hello')

    const entry = latestActivity('echo')
    expect(entry).toBeDefined()
    expect(entry.success).toBe(true)
    expect(entry.method).toBe('tools/call')
    expect(entry.serverId).toBe(fixtureServerId)
    expect(entry.identity.user).toBe('local@dev')
  })

  it('round-trips state through the upstream server', async () => {
    await client.callTool({ name: ns('store'), arguments: { key: 'k1', value: 'v1' } })
    const result = await client.callTool({ name: ns('retrieve'), arguments: { key: 'k1' } })

    expect(textOf(result)).toBe('v1')
  })

  it('records tool-level errors (isError) as failures in the activity log', async () => {
    const result = await client.callTool({ name: ns('does_not_exist'), arguments: {} })

    expect(result.isError).toBe(true)

    const entry = latestActivity('does_not_exist')
    expect(entry).toBeDefined()
    expect(entry.success).toBe(false)
    expect(entry.responseSummary).toContain('ERROR')
    expect(entry.errorMessage).toBeTruthy()
  })

  it('denies tool calls when no policy rule allows the identity', async () => {
    policyEngine.updatePolicy({
      version: 1,
      defaultEffect: 'deny',
      rules: [],
      updatedAt: Date.now(),
      updatedBy: 'test',
    })

    await expect(
      client.callTool({ name: ns('echo'), arguments: { message: 'nope' } })
    ).rejects.toThrow(/Access denied/)

    const entry = latestActivity('echo')
    expect(entry).toBeDefined()
    expect(entry.success).toBe(false)
    expect(entry.errorCode).toBe(403)
  })

  it('returns empty resource and prompt lists for a tools-only server', async () => {
    const resources = await client.listResources()
    expect(resources.resources).toEqual([])

    const prompts = await client.listPrompts()
    expect(prompts.prompts).toEqual([])
  })
})
