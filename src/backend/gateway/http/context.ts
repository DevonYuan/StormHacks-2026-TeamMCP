import type { GatewayConfig } from '../../shared/config.js'
import type { AuthManager } from '../auth/auth.js'
import type { PolicyEngine } from '../authz/policy.js'
import type { Repositories } from '../db/repository.js'
import type { MCPClientManager } from '../mcp/client.js'
import type { MCPProxyServer } from '../mcp/server.js'

export interface HttpContext {
  proxyServer: MCPProxyServer
  authManager: AuthManager
  policyEngine: PolicyEngine
  repos: Repositories
  clientManager: MCPClientManager
  config: GatewayConfig
}
