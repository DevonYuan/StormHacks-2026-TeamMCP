/**
 * MCP Client Manager - manages connections to local MCP servers.
 * Supports both stdio (spawned processes) and Streamable HTTP transports.
 */

import { EventEmitter } from 'node:events'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import {
  ToolListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  PromptListChangedNotificationSchema,
  LoggingMessageNotificationSchema,
  ProgressNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
  ServerConfig,
  TransportType,
  Tool,
  Resource,
  Prompt,
  ServerCapabilities,
  CallToolParams,
  CallToolResult,
  ReadResourceParams,
  ReadResourceResult,
  GetPromptParams,
  GetPromptResult,
} from '../../shared/protocol.js'
import { GatewayConfig } from '../../shared/config.js'
import pino from 'pino'

const logger = pino({ name: 'mcp-client-manager' })

type MCPTransport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport

export interface MCPClientConnection {
  serverId: string
  config: ServerConfig
  client: Client
  transport: MCPTransport | null
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  lastError?: string
  capabilities?: ServerCapabilities
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
  connectedAt?: number
  lastPing?: number
}

export class MCPClientManager extends EventEmitter {
  private connections = new Map<string, MCPClientConnection>()
  private config: GatewayConfig
  private reconnectTimers = new Map<string, NodeJS.Timeout>()
  private healthCheckInterval?: NodeJS.Timeout

  constructor(config: GatewayConfig) {
    super()
    this.config = config
  }

  /**
   * Connect to a server based on its configuration.
   */
  async connect(serverConfig: ServerConfig): Promise<MCPClientConnection> {
    // Disconnect existing if any
    await this.disconnect(serverConfig.id)

    const connection: MCPClientConnection = {
      serverId: serverConfig.id,
      config: serverConfig,
      client: null as unknown as Client,
      transport: null,
      status: 'connecting',
      tools: [],
      resources: [],
      prompts: [],
    }

    this.connections.set(serverConfig.id, connection)
    this.emit('statusChange', serverConfig.id, 'connecting')

    try {
      const transport = this.createTransport(serverConfig)
      connection.transport = transport

      const client = new Client(
        { name: `gateway-${serverConfig.id}`, version: '1.0.0' },
        { capabilities: {} }
      )

      this.setupNotificationHandlers(client, serverConfig.id)

      // connect() performs the MCP initialize handshake
      await client.connect(transport)

      connection.client = client
      connection.capabilities = client.getServerCapabilities() as ServerCapabilities | undefined
      connection.status = 'connected'
      connection.connectedAt = Date.now()

      await this.refreshCapabilities(serverConfig.id)

      this.emit('statusChange', serverConfig.id, 'connected')
      this.emit('connected', connection)

      logger.info({ serverId: serverConfig.id }, 'MCP client connected')
      return connection
    } catch (error) {
      connection.status = 'error'
      connection.lastError = error instanceof Error ? error.message : String(error)
      this.emit('statusChange', serverConfig.id, 'error', connection.lastError)
      logger.error({ serverId: serverConfig.id, error }, 'Failed to connect MCP client')
      throw error
    }
  }

  /**
   * Build the child env for spawned stdio servers. GUI-launched apps get a
   * minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that excludes Homebrew/nvm, so
   * commands like `npx` are not found ("spawn npx ENOENT"). Prepend the running
   * Node's own bin dir and the usual install locations so those commands resolve.
   */
  private spawnEnv(): Record<string, string> {
    const env = { ...(process.env as Record<string, string>) }
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
    const extra = [
      path.dirname(process.execPath),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      'C:\\Program Files\\nodejs',
    ]
    const parts = [...extra, ...(env[key] ? env[key].split(path.delimiter) : [])]
    const seen = new Set<string>()
    const merged: string[] = []
    for (const part of parts) {
      if (part && !seen.has(part)) {
        seen.add(part)
        merged.push(part)
      }
    }
    env[key] = merged.join(path.delimiter)
    return env
  }

  private createTransport(config: ServerConfig): MCPTransport {
    switch (config.transport) {
      case TransportType.Stdio: {
        if (!config.command) {
          throw new Error('stdio transport requires command')
        }
        return new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: { ...this.spawnEnv(), ...(config.env || {}) },
          cwd: config.cwd,
          stderr: 'inherit',
        })
      }

      case TransportType.StreamableHttp: {
        if (!config.url) {
          throw new Error('streamable-http transport requires url')
        }
        return new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers },
        })
      }

      case TransportType.Sse: {
        if (!config.url) {
          throw new Error('sse transport requires url')
        }
        return new SSEClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers },
        })
      }

      default:
        throw new Error(`Unknown transport type: ${config.transport}`)
    }
  }

  private setupNotificationHandlers(client: Client, serverId: string): void {
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      logger.debug({ serverId }, 'Received tools/list_changed notification')
      await this.refreshCapabilities(serverId)
      this.emit('toolsChanged', serverId)
    })

    client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
      logger.debug({ serverId }, 'Received resources/list_changed notification')
      await this.refreshCapabilities(serverId)
      this.emit('resourcesChanged', serverId)
    })

    client.setNotificationHandler(PromptListChangedNotificationSchema, async () => {
      logger.debug({ serverId }, 'Received prompts/list_changed notification')
      await this.refreshCapabilities(serverId)
      this.emit('promptsChanged', serverId)
    })

    client.setNotificationHandler(LoggingMessageNotificationSchema, (params) => {
      this.emit('logMessage', serverId, params)
    })

    client.setNotificationHandler(ProgressNotificationSchema, (params) => {
      this.emit('progress', serverId, params)
    })
  }

  async refreshCapabilities(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection || connection.status !== 'connected') return

    const { client } = connection
    const caps = connection.capabilities

    try {
      if (caps?.tools) {
        const result = await client.listTools()
        connection.tools = result.tools as unknown as Tool[]
      }
      if (caps?.resources) {
        const result = await client.listResources()
        connection.resources = result.resources as unknown as Resource[]
      }
      if (caps?.prompts) {
        const result = await client.listPrompts()
        connection.prompts = result.prompts as unknown as Prompt[]
      }
    } catch (error) {
      logger.error({ serverId, error }, 'Failed to refresh capabilities')
      connection.lastError = error instanceof Error ? error.message : String(error)
    }

    this.emit('capabilitiesUpdated', serverId, {
      tools: connection.tools,
      resources: connection.resources,
      prompts: connection.prompts,
    })
  }

  /**
   * Call a tool on a server.
   */
  async callTool(serverId: string, params: CallToolParams): Promise<CallToolResult> {
    const connection = this.connections.get(serverId)
    if (!connection || connection.status !== 'connected') {
      throw new Error(`Server ${serverId} not connected`)
    }

    const result = await connection.client.callTool({
      name: params.name,
      arguments: params.arguments,
    })
    return result as unknown as CallToolResult
  }

  /**
   * Read a resource from a server.
   */
  async readResource(serverId: string, params: ReadResourceParams): Promise<ReadResourceResult> {
    const connection = this.connections.get(serverId)
    if (!connection || connection.status !== 'connected') {
      throw new Error(`Server ${serverId} not connected`)
    }

    const result = await connection.client.readResource({ uri: params.uri })
    return result as unknown as ReadResourceResult
  }

  /**
   * Get a prompt from a server.
   */
  async getPrompt(serverId: string, params: GetPromptParams): Promise<GetPromptResult> {
    const connection = this.connections.get(serverId)
    if (!connection || connection.status !== 'connected') {
      throw new Error(`Server ${serverId} not connected`)
    }

    const result = await connection.client.getPrompt({
      name: params.name,
      arguments: params.arguments,
    })
    return result as unknown as GetPromptResult
  }

  /**
   * Subscribe to resource updates.
   */
  async subscribeResource(serverId: string, uri: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection || connection.status !== 'connected') {
      throw new Error(`Server ${serverId} not connected`)
    }

    await connection.client.subscribeResource({ uri })
  }

  /**
   * Unsubscribe from resource updates.
   */
  async unsubscribeResource(serverId: string, uri: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection || connection.status !== 'connected') {
      throw new Error(`Server ${serverId} not connected`)
    }

    await connection.client.unsubscribeResource({ uri })
  }

  /**
   * Disconnect from a server.
   */
  async disconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) return

    // Clear any reconnect timer
    const timer = this.reconnectTimers.get(serverId)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(serverId)
    }

    if (connection.client) {
      try {
        await connection.client.close()
      } catch (error) {
        logger.warn({ serverId, error }, 'Error closing MCP client')
      }
    }

    connection.status = 'disconnected'
    this.emit('statusChange', serverId, 'disconnected')
    this.emit('disconnected', serverId)

    this.connections.delete(serverId)
    logger.info({ serverId }, 'MCP client disconnected')
  }

  /**
   * Disconnect all servers.
   */
  async disconnectAll(): Promise<void> {
    const serverIds = Array.from(this.connections.keys())
    await Promise.all(serverIds.map(id => this.disconnect(id)))

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }
  }

  /**
   * Get connection status.
   */
  getConnection(serverId: string): MCPClientConnection | undefined {
    return this.connections.get(serverId)
  }

  getAllConnections(): MCPClientConnection[] {
    return Array.from(this.connections.values())
  }

  getConnectedServers(): MCPClientConnection[] {
    return Array.from(this.connections.values()).filter(c => c.status === 'connected')
  }

  /**
   * Start health checking for all connections.
   */
  startHealthChecks(intervalMs = 30000): void {
    if (this.healthCheckInterval) return

    this.healthCheckInterval = setInterval(async () => {
      for (const connection of this.connections.values()) {
        if (connection.status !== 'connected') continue
        try {
          const started = Date.now()
          await connection.client.listTools()
          connection.lastPing = Date.now()
          this.emit('healthCheck', connection.serverId, true, Date.now() - started)
        } catch (error) {
          logger.warn({ serverId: connection.serverId, error }, 'Health check failed')
          connection.status = 'error'
          connection.lastError = error instanceof Error ? error.message : String(error)
          this.emit('statusChange', connection.serverId, 'error', connection.lastError)
          this.emit('healthCheck', connection.serverId, false, 0)

          // Schedule reconnect
          this.scheduleReconnect(connection.config)
        }
      }
    }, intervalMs)
  }

  private scheduleReconnect(config: ServerConfig): void {
    if (this.reconnectTimers.has(config.id)) return

    const delay = Math.min(5000 * Math.pow(2, (this.reconnectTimers.size || 0)), 60000)
    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(config.id)
      if (this.connections.has(config.id)) {
        try {
          await this.connect(config)
        } catch (error) {
          logger.error({ serverId: config.id, error }, 'Reconnect failed')
          this.scheduleReconnect(config)
        }
      }
    }, delay)

    this.reconnectTimers.set(config.id, timer)
  }

  /**
   * Get aggregated tools from all connected servers with namespacing.
   */
  getAggregatedTools(): { serverId: string; toolName: string; tool: Tool }[] {
    const result: { serverId: string; toolName: string; tool: Tool }[] = []

    for (const connection of this.connections.values()) {
      if (connection.status !== 'connected') continue

      for (const tool of connection.tools) {
        result.push({
          serverId: connection.serverId,
          toolName: tool.name,
          tool: {
            ...tool,
            name: `${connection.serverId}__${tool.name}`, // Namespaced
          },
        })
      }
    }

    return result
  }
}