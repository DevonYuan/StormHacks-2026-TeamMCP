/**
 * Policy evaluation engine for RBAC authorization.
 * Evaluates declarative policy rules against identity and requested resources.
 */

import { PolicyDocument, PolicyRule, Identity, PolicyDecision } from '../../shared/policy.js'

export class PolicyEngine {
  private policy: PolicyDocument

  constructor(policy: PolicyDocument) {
    this.policy = this.normalize(policy)
  }

  updatePolicy(policy: PolicyDocument): void {
    this.policy = this.normalize(policy)
  }

  private normalize(policy: PolicyDocument): PolicyDocument {
    // Rules are evaluated highest-priority first
    return {
      ...policy,
      rules: [...policy.rules].sort((a, b) => b.priority - a.priority),
    }
  }

  getPolicy(): PolicyDocument {
    return this.policy
  }

  /**
   * Evaluate if an identity is allowed to perform an action on a server/tool.
   * Rules are evaluated in priority order (highest first).
   * First matching rule determines the decision.
   * If no rule matches, defaultEffect is used.
   */
  evaluate(
    identity: Identity,
    serverId: string,
    toolName?: string,
    _method?: string
  ): PolicyDecision {
    const matchedRules: PolicyRule[] = []

    // Check each rule in priority order
    for (const rule of this.policy.rules) {
      if (this.ruleMatches(rule, identity, serverId, toolName)) {
        matchedRules.push(rule)
        // First match wins (rules already sorted by priority)
        return {
          allowed: rule.effect === 'allow',
          matchedRule: rule,
          reason: `Matched rule "${rule.name}" (${rule.effect})`,
        }
      }
    }

    // No rule matched - use default effect
    return {
      allowed: this.policy.defaultEffect === 'allow',
      reason: `No matching rule; default effect: ${this.policy.defaultEffect}`,
    }
  }

  /**
   * Check if a rule matches the given identity and resource.
   */
  private ruleMatches(
    rule: PolicyRule,
    identity: Identity,
    serverId: string,
    toolName?: string
  ): boolean {
    // Check identity matchers
    if (rule.identities && rule.identities.length > 0) {
      const identityMatches = rule.identities.some(ruleIdentity =>
        this.identityMatches(ruleIdentity, identity)
      )
      if (!identityMatches) return false
    }

    // Check server matchers
    if (rule.servers && rule.servers.length > 0) {
      if (!rule.servers.includes(serverId)) return false
    }

    // Check tool matchers
    if (rule.tools && rule.tools.length > 0) {
      if (!toolName) return false
      const namespacedTool = `${serverId}__${toolName}`
      if (!rule.tools.includes(namespacedTool) && !rule.tools.includes(toolName)) {
        return false
      }
    }

    return true
  }

  /**
   * Check if two identities match (partial matching allowed).
   * A rule identity with empty fields acts as a wildcard for that field.
   */
  private identityMatches(ruleIdentity: Identity, actualIdentity: Identity): boolean {
    // User must match exactly if specified
    if (ruleIdentity.user && ruleIdentity.user !== actualIdentity.user) {
      return false
    }
    // Device must match exactly if specified
    if (ruleIdentity.device && ruleIdentity.device !== actualIdentity.device) {
      return false
    }
    // Device ID must match exactly if specified
    if (ruleIdentity.deviceId && ruleIdentity.deviceId !== actualIdentity.deviceId) {
      return false
    }
    // Tailnet must match exactly if specified
    if (ruleIdentity.tailnet && ruleIdentity.tailnet !== actualIdentity.tailnet) {
      return false
    }
    return true
  }

  /**
   * Get all servers an identity has access to (at least one tool).
   */
  getAccessibleServers(identity: Identity, allServerIds: string[]): string[] {
    return allServerIds.filter(serverId => {
      const decision = this.evaluate(identity, serverId)
      return decision.allowed
    })
  }

  /**
   * Get all tools an identity can access on a specific server.
   */
  getAccessibleTools(identity: Identity, serverId: string, allToolNames: string[]): string[] {
    return allToolNames.filter(toolName => {
      const decision = this.evaluate(identity, serverId, toolName)
      return decision.allowed
    })
  }

  /**
   * Get the effective permissions for an identity (for token scoping).
   */
  getEffectivePermissions(identity: Identity, allServers: Map<string, string[]>): TokenPermissions {
    const servers: string[] = []
    const tools: string[] = []

    for (const [serverId, toolNames] of allServers) {
      const serverAllowed = this.evaluate(identity, serverId).allowed
      if (!serverAllowed) continue

      servers.push(serverId)

      for (const toolName of toolNames) {
        const toolAllowed = this.evaluate(identity, serverId, toolName).allowed
        if (toolAllowed) {
          tools.push(`${serverId}__${toolName}`)
        }
      }
    }

    return { servers, tools }
  }
}

export interface TokenPermissions {
  servers: string[]
  tools: string[]
}

/**
 * Create a default policy for initial setup.
 */
export function createDefaultPolicy(updatedBy: string): PolicyDocument {
  return {
    version: 1,
    defaultEffect: 'deny',
    rules: [
      {
        id: 'admin-all',
        name: 'Admin full access',
        identities: [], // Empty = match all (will be restricted by admin check elsewhere)
        effect: 'allow',
        priority: 100,
        description: 'Admin wildcard - configure with real admin identity',
      },
    ],
    updatedAt: Date.now(),
    updatedBy,
  }
}

/**
 * Validate a policy document.
 */
export function validatePolicy(policy: PolicyDocument): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (policy.version < 1) {
    errors.push('Policy version must be >= 1')
  }

  if (!['allow', 'deny'].includes(policy.defaultEffect)) {
    errors.push('defaultEffect must be "allow" or "deny"')
  }

  const ruleIds = new Set<string>()
  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i]

    if (!rule.id) {
      errors.push(`Rule ${i}: missing id`)
    } else if (ruleIds.has(rule.id)) {
      errors.push(`Rule ${i}: duplicate id "${rule.id}"`)
    } else {
      ruleIds.add(rule.id)
    }

    if (!rule.name) {
      errors.push(`Rule ${rule.id}: missing name`)
    }

    if (!['allow', 'deny'].includes(rule.effect)) {
      errors.push(`Rule ${rule.id}: effect must be "allow" or "deny"`)
    }

    if (rule.priority < 0) {
      errors.push(`Rule ${rule.id}: priority must be >= 0`)
    }

    // Validate identity structure
    if (rule.identities) {
      for (const identity of rule.identities) {
        if (identity.user && typeof identity.user !== 'string') {
          errors.push(`Rule ${rule.id}: identity.user must be string`)
        }
        // ... similar for other fields
      }
    }
  }

  return { valid: errors.length === 0, errors }
}