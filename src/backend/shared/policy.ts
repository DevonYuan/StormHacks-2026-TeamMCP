/**
 * Authorization policy types - declarative RBAC for the gateway.
 * Defines who can access which servers and tools.
 */

import { z } from 'zod'

// Identity from Tailscale. Fields default to '' so that rule matchers may use
// partial identities (e.g. `{}`) as wildcards.
export const IdentitySchema = z.object({
  // Tailscale device/user identity
  user: z.string().default(''), // e.g., "alice@example.com"
  device: z.string().default(''), // e.g., "alice-laptop"
  deviceId: z.string().default(''), // Tailscale stable device ID
  tailnet: z.string().default(''), // e.g., "example.ts.net"
})

export type Identity = z.infer<typeof IdentitySchema>

// Policy rule: grant/deny access to specific tools on specific servers
export const PolicyRuleSchema = z.object({
  // Unique rule ID
  id: z.string(),
  // Human-readable name
  name: z.string(),
  // Identity matchers (all must match for rule to apply)
  identities: z.array(IdentitySchema).optional(), // Empty = match all authenticated
  // Server access
  servers: z.array(z.string()).optional(), // Server IDs, empty = all servers
  // Tool access (namespaced: serverId__toolName)
  tools: z.array(z.string()).optional(), // Empty = all tools on matched servers
  // Effect
  effect: z.enum(['allow', 'deny']),
  // Priority: higher wins (default 0)
  priority: z.number().int().default(0),
  // Optional description
  description: z.string().optional(),
})

export type PolicyRule = z.infer<typeof PolicyRuleSchema>

// Full policy document
export const PolicyDocumentSchema = z.object({
  version: z.number().int().default(1),
  // Default effect when no rule matches
  defaultEffect: z.enum(['allow', 'deny']).default('deny'),
  // Rules evaluated in priority order (highest first), then by order
  rules: z.array(PolicyRuleSchema),
  updatedAt: z.number(),
  updatedBy: z.string(), // Identity who last updated
})

export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>

// Session token claims
export const TokenClaimsSchema = z.object({
  sub: z.string(), // Identity (user@tailnet)
  deviceId: z.string(),
  iat: z.number(),
  exp: z.number(),
  // Scoped permissions for this session
  permissions: z.object({
    servers: z.array(z.string()),
    tools: z.array(z.string()),
  }),
})

export type TokenClaims = z.infer<typeof TokenClaimsSchema>

// Authentication result
export const AuthResultSchema = z.object({
  success: z.boolean(),
  identity: IdentitySchema.optional(),
  token: z.string().optional(),
  error: z.string().optional(),
})

export type AuthResult = z.infer<typeof AuthResultSchema>

// Policy evaluation result
export const PolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  matchedRule: PolicyRuleSchema.optional(),
  reason: z.string(),
})

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>

// Default policy (deny all, explicit allow)
export function createDefaultPolicy(updatedBy: string): PolicyDocument {
  return {
    version: 1,
    defaultEffect: 'deny',
    rules: [
      {
        id: 'admin-all',
        name: 'Admin full access',
        identities: [{ user: 'admin@example.com', device: '', deviceId: '', tailnet: '' }], // Placeholder
        effect: 'allow',
        priority: 100,
        description: 'Admin wildcard - replace with real admin identity',
      },
    ],
    updatedAt: Date.now(),
    updatedBy,
  }
}