// Unit test setup
import { vi } from 'vitest'

// Mock electron modules
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(),
    whenReady: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: {},
  shell: {},
  safeStorage: {
    encryptString: vi.fn(),
    decryptString: vi.fn(),
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
  nativeTheme: {},
}))

// Mock @modelcontextprotocol/sdk submodules (the package has no bare root export)
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () =>({
  SSEClientTransport: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: vi.fn(),
}))