// Integration test setup
import { vi } from 'vitest'
import { createDatabase, runMigrations, createRepositories } from '../../src/gateway/db/index.js'
import type { SqliteDatabase } from '../../src/gateway/db/sqlite.js'
import { GatewayConfig } from '../../src/shared/config.js'

// Use in-memory database for tests
let testDb: SqliteDatabase

export function getTestDb(): Database.Database {
  if (!testDb) {
    const config: GatewayConfig = {
      port: 8788,
      bindAddr: '127.0.0.1',
      redactToolPayloads: true,
      sessionTtlMs: 24 * 60 * 60 * 1000,
      dbPath: ':memory:',
      logLevel: 'error',
    }
    testDb = createDatabase(config)
    runMigrations(testDb)
  }
  return testDb
}

export function getTestRepos() {
  return createRepositories(getTestDb())
}

export function cleanupTestDb() {
  if (testDb) {
    testDb.close()
    testDb = null as any
  }
}

// Mock external dependencies
vi.mock('electron', () => ({
  safeStorage: {
    encryptString: vi.fn((s: string) => Buffer.from(s).toString('base64')),
    decryptString: vi.fn((s: string) => Buffer.from(s, 'base64').toString()),
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}))

vi.mock('../../src/gateway/auth/tailscale.js', () => ({
  getTailscaleStatus: vi.fn().mockResolvedValue({
    Self: { TailscaleIPs: ['100.1.2.3'], HostName: 'test-host', DNSName: 'test-host.tailnet.ts.net' },
  }),
  getTailscaleWhois: vi.fn().mockResolvedValue({
    Node: {
      ID: 'test-device-id',
      Name: 'test-device',
      User: 'testuser',
      UserProfile: { LoginName: 'testuser@example.com', DisplayName: 'Test User', ProfilePicURL: '', ID: 'profile-1' },
    },
  }),
  resolveIdentityFromIp: vi.fn().mockResolvedValue({
    user: 'testuser@example.com',
    device: 'test-device',
    deviceId: 'test-device-id',
    tailnet: 'example.com',
  }),
  isTailscaleAvailable: vi.fn().mockResolvedValue(true),
}))

afterAll(() => {
  cleanupTestDb()
})