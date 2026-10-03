/**
 * Shared MCP protocol types used across gateway, main, and renderer processes.
 * Mirrors @modelcontextprotocol/sdk types for type-safe IPC and serialization.
 */

import { z } from 'zod'

// Base JSON-RPC types
export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
})

export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
})

export const JsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
})

export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>
export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>

// MCP Protocol Types
export const InitializeParamsSchema = z.object({
  protocolVersion: z.string(),
  capabilities: z.record(z.unknown()).optional(),
  clientInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
})

export const InitializeResultSchema = z.object({
  protocolVersion: z.string(),
  capabilities: z.record(z.unknown()),
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
})

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.unknown()),
    required: z.array(z.string()).optional(),
  }),
})

export const ListToolsResultSchema = z.object({
  tools: z.array(ToolSchema),
})

export const CallToolParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).optional(),
})

export const CallToolResultSchema = z.object({
  content: z.array(
    z.object({
      type: z.enum(['text', 'image', 'resource']),
      text: z.string().optional(),
      data: z.string().optional(),
      mimeType: z.string().optional(),
      resource: z
        .object({
          uri: z.string(),
          mimeType: z.string().optional(),
          text: z.string().optional(),
        })
        .optional(),
    })
  ),
  isError: z.boolean().optional(),
})

export const ResourceSchema = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
})

export const ListResourcesResultSchema = z.object({
  resources: z.array(ResourceSchema),
})

export const ReadResourceParamsSchema = z.object({
  uri: z.string(),
})

export const ReadResourceResultSchema = z.object({
  contents: z.array(
    z.object({
      uri: z.string(),
      mimeType: z.string().optional(),
      text: z.string().optional(),
      blob: z.string().optional(),
    })
  ),
})

export const PromptSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  arguments: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional(),
      })
    )
    .optional(),
})

export const ListPromptsResultSchema = z.object({
  prompts: z.array(PromptSchema),
})

export const GetPromptParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string()).optional(),
})

export const GetPromptResultSchema = z.object({
  description: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.union([
        z.object({ type: z.literal('text'), text: z.string() }),
        z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
        z.object({ type: z.literal('resource'), resource: z.object({ uri: z.string(), mimeType: z.string().optional(), text: z.string().optional() }) }),
      ]),
    })
  ),
})

// Server Capabilities
export const ServerCapabilitiesSchema = z.object({
  tools: z.object({ listChanged: z.boolean().optional() }).optional(),
  resources: z.object({ subscribe: z.boolean().optional(), listChanged: z.boolean().optional() }).optional(),
  prompts: z.object({ listChanged: z.boolean().optional() }).optional(),
  logging: z.object({}).optional(),
  completions: z.object({}).optional(),
})

export type InitializeParams = z.infer<typeof InitializeParamsSchema>
export type InitializeResult = z.infer<typeof InitializeResultSchema>
export type Tool = z.infer<typeof ToolSchema>
export type ListToolsResult = z.infer<typeof ListToolsResultSchema>
export type CallToolParams = z.infer<typeof CallToolParamsSchema>
export type CallToolResult = z.infer<typeof CallToolResultSchema>
export type Resource = z.infer<typeof ResourceSchema>
export type ListResourcesResult = z.infer<typeof ListResourcesResultSchema>
export type ReadResourceParams = z.infer<typeof ReadResourceParamsSchema>
export type ReadResourceResult = z.infer<typeof ReadResourceResultSchema>
export type Prompt = z.infer<typeof PromptSchema>
export type ListPromptsResult = z.infer<typeof ListPromptsResultSchema>
export type GetPromptParams = z.infer<typeof GetPromptParamsSchema>
export type GetPromptResult = z.infer<typeof GetPromptResultSchema>
export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>

// Transport types
export enum TransportType {
  Stdio = 'stdio',
  StreamableHttp = 'streamable-http',
  Sse = 'sse',
}

export const ServerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: z.nativeEnum(TransportType),
  // For stdio
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  // For HTTP
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),
  // Metadata
  enabled: z.boolean().default(true),
  description: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type ServerConfig = z.infer<typeof ServerConfigSchema>

// Gateway-specific: namespaced tool name
export function namespaceTool(serverId: string, toolName: string): string {
  return `${serverId}__${toolName}`
}

export function parseNamespacedTool(namespaced: string): { serverId: string; toolName: string } | null {
  const idx = namespaced.indexOf('__')
  if (idx === -1) return null
  return { serverId: namespaced.slice(0, idx), toolName: namespaced.slice(idx + 2) }
}