/**
 * Simple MCP test fixture server for integration testing.
 * Implements a minimal MCP server with stdio transport.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Tool } from '../../src/backend/shared/protocol.js'

const server = new Server(
  {
    name: 'test-fixture-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: { listChanged: false },
    },
  }
)

// Simple in-memory storage
const storage = new Map<string, string>()

// Define available tools
const tools: Tool[] = [
  {
    name: 'echo',
    description: 'Echo back the input',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to echo' },
      },
      required: ['message'],
    },
  },
  {
    name: 'store',
    description: 'Store a key-value pair',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'retrieve',
    description: 'Retrieve a value by key',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
      },
      required: ['key'],
    },
  },
  {
    name: 'list_keys',
    description: 'List all stored keys',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
]

// Handle tools/list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools }
})

// Handle tools/call
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name
  const args = (request.params.arguments || {}) as Record<string, unknown>

  switch (name) {
    case 'echo': {
      const message = (args.message as string) || ''
      return {
        content: [{ type: 'text', text: `Echo: ${message}` }],
      }
    }

    case 'store': {
      const key = args.key as string
      const value = args.value as string
      if (!key || !value) {
        return {
          content: [{ type: 'text', text: 'Error: key and value required' }],
          isError: true,
        }
      }
      storage.set(key, value)
      return {
        content: [{ type: 'text', text: `Stored: ${key} = ${value}` }],
      }
    }

    case 'retrieve': {
      const key = args.key as string
      if (!key) {
        return {
          content: [{ type: 'text', text: 'Error: key required' }],
          isError: true,
        }
      }
      const value = storage.get(key)
      if (value === undefined) {
        return {
          content: [{ type: 'text', text: `Key not found: ${key}` }],
          isError: true,
        }
      }
      return {
        content: [{ type: 'text', text: value }],
      }
    }

    case 'list_keys': {
      const keys = Array.from(storage.keys())
      return {
        content: [{ type: 'text', text: keys.length > 0 ? keys.join(', ') : '(empty)' }],
      }
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      }
  }
})

// Start the server
async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Test MCP fixture server started')
}

main().catch((error) => {
  console.error('Fixture server failed to start:', error)
  process.exit(1)
})

// Handle shutdown
process.on('SIGTERM', async () => {
  await server.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await server.close()
  process.exit(0)
})