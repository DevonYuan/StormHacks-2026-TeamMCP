import { describe, it, expect } from 'vitest'
import { PolicyEngine, validatePolicy } from '../../src/backend/gateway/authz/policy.js'
import {
  createDefaultPolicy,
  PolicyDocument,
  PolicyRule,
  Identity,
  addPolicyRule,
  removePolicyRule,
} from '../../src/backend/shared/policy.js'

const testIdentity: Identity = {
  user: 'alice@example.com',
  device: 'alice-laptop',
  deviceId: 'device-123',
  tailnet: 'example.com',
}

const adminIdentity: Identity = {
  user: 'admin@example.com',
  device: 'admin-machine',
  deviceId: 'admin-device',
  tailnet: 'example.com',
}

describe('PolicyEngine', () => {
  it('should deny by default when no rules match', () => {
    const policy: PolicyDocument = {
      version: 1,
      defaultEffect: 'deny',
      rules: [],
      updatedAt: Date.now(),
      updatedBy: 'test',
    }
    const engine = new PolicyEngine(policy)

    const decision = engine.evaluate(testIdentity, 'filesystem', 'read_file')
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('default effect: deny')
  })

  it('should allow by default when configured', () => {
    const policy: PolicyDocument = {
      version: 1,
      defaultEffect: 'allow',
      rules: [],
      updatedAt: Date.now(),
      updatedBy: 'test',
    }
    const engine = new PolicyEngine(policy)

    const decision = engine.evaluate(testIdentity, 'filesystem', 'read_file')
    expect(decision.allowed).toBe(true)
  })

  it('should match allow rule for specific identity', () => {
    const policy: PolicyDocument = {
      version: 1,
      defaultEffect: 'deny',
      rules: [
        {
          id: 'rule-1',
          name: 'Alice filesystem access',
          identities: [{ user: 'alice@example.com', device: '', deviceId: '', tailnet: '' }],
          servers: ['filesystem'],
          effect: 'allow',
          priority: 10,
        },
      ],
      updatedAt: Date.now(),
      updatedBy: 'test',
    }
    const engine = new PolicyEngine(policy)

    const decision = engine.evaluate(testIdentity, 'filesystem', 'read_file')
    expect(decision.allowed).toBe(true)
    expect(decision.matchedRule?.id).toBe('rule-1')
  })

  it('should not match rule for different identity', () => {
    const policy: PolicyDocument = {
      version: 1,
      defaultEffect: 'deny',
      rules: [
        {
          id: 'rule-1',
          name: 'Bob filesystem access',
          identities: [{ user: 'bob@example.com', device: '', deviceId: '', tailnet: '' }],
          servers: ['filesystem'],
          effect: 'allow',
          priority: 10,
        },
      ],
      updatedAt: Date.now(),
      updatedBy: 'test',
    }
    const engine = new PolicyEngine(policy)

    const decision = engine.evaluate(testIdentity, 'filesystem', 'read_file')
    expect(decision.allowed).toBe(false)
  })

  it('should match rule with wildcard identity', () => {
    const policy: PolicyDocument = {
      version: 1,
      defaultEffect: 'deny',
      rules: [
        {
          id: 'rule-1',
          name: 'All users filesystem',
          identities: [{}], // Empty identity = match all
          servers: ['filesystem'],
          effect: 'allow',
          priority: 10,
        },
      ],
      updatedAt: Date.now(),
      updatedBy: 'test',
    }
    const engine = new PolicyEngine(policy)

    const decision = engine.evaluate(testIdentity, 'filesystem', 'read_file')
    expect(decision.allowed).toBe(true)
  })

  it('should respect priority order', () => {
    const policy: PolicyDocument = {
      version: 1,
      defaultEffect: 'deny',
      rules: [
        {
          id: 'rule-low',
          name: 'Low priority deny',
          identities: [{}],
          servers: ['filesystem'],
          effect: 'deny',
          priority: 1,
        },
        {
          id: 'rule-high',
          name: 'High priority allow',
          identities: [{}],
          servers: ['filesystem'],
          effect: 'allow',
          priority: 100,
        },
      ],
      updatedAt: Date.now(),
      updatedBy: 'test',
    }
    const engine = new PolicyEngine(policy)

    // High priority rule should win
    const decision = engine.evaluate(testIdentity, 'filesystem', 'read_file')
    expect(decision.allowed).toBe(true)
    expect(decision.matchedRule?.id).toBe('rule-high')
  })

  it('should match specific server', () => {
    const policy: PolicyDocument = {
      version: 1,
      defaultEffect: 'deny',
      rules: [
        {
          id: 'rule-1',
          name: 'Filesystem only',
          identities: [{}],
          servers: ['filesystem'],
          effect: 'allow',
          priority: 10,
        },
      ],
      updatedAt: Date.now(),
      updatedBy: 'test',
    }
    const engine = new PolicyEngine(policy)

    expect(engine.evaluate(testIdentity, 'filesystem', 'read_file').allowed).toBe(true)
    expect(engine.evaluate(testIdentity, 'git', 'search_repository').allowed).toBe(false)
  })

  it('should match specific tool', () => {
    const policy: PolicyDocument = {
      version: 1,
      defaultEffect: 'deny',
      rules: [
        {
          id: 'rule-1',
          name: 'Read only',
          identities: [{}],
          servers: ['filesystem'],
          tools: ['filesystem__read_file'],
          effect: 'allow',
          priority: 10,
        },
      ],
      updatedAt: Date.now(),
      updatedBy: 'test',
    }
    const engine = new PolicyEngine(policy)

    expect(engine.evaluate(testIdentity, 'filesystem', 'read_file').allowed).toBe(true)
    expect(engine.evaluate(testIdentity, 'filesystem', 'write_file').allowed).toBe(false)
  })

  it('should evaluate deny rules correctly', () => {
    const policy: PolicyDocument = {
      version: 1,
      defaultEffect: 'allow',
      rules: [
        {
          id: 'rule-1',
          name: 'Deny write',
          identities: [{}],
          servers: ['filesystem'],
          tools: ['filesystem__write_file'],
          effect: 'deny',
          priority: 10,
        },
      ],
      updatedAt: Date.now(),
      updatedBy: 'test',
    }
    const engine = new PolicyEngine(policy)

    expect(engine.evaluate(testIdentity, 'filesystem', 'read_file').allowed).toBe(true)
    expect(engine.evaluate(testIdentity, 'filesystem', 'write_file').allowed).toBe(false)
  })
})

describe('createDefaultPolicy', () => {
  it('should create a valid default policy', () => {
    const policy = createDefaultPolicy('test-user')
    expect(policy.version).toBe(1)
    expect(policy.defaultEffect).toBe('deny')
    expect(policy.rules.length).toBeGreaterThan(0)
    expect(policy.updatedBy).toBe('test-user')
  })
})

describe('validatePolicy', () => {
  it('should validate correct policy', () => {
    const policy = createDefaultPolicy('test')
    const result = validatePolicy(policy)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject policy with invalid version', () => {
    const policy = createDefaultPolicy('test')
    policy.version = 0
    const result = validatePolicy(policy)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Policy version must be >= 1')
  })

  it('should reject policy with invalid defaultEffect', () => {
    const policy = createDefaultPolicy('test')
    policy.defaultEffect = 'invalid' as any
    const result = validatePolicy(policy)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('defaultEffect'))).toBe(true)
  })

  it('should reject duplicate rule IDs', () => {
    const policy = createDefaultPolicy('test')
    policy.rules.push({ ...policy.rules[0], id: policy.rules[0].id })
    const result = validatePolicy(policy)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('duplicate id'))).toBe(true)
  })
})
describe('policy rule mutations', () => {
  const basePolicy = (): PolicyDocument => ({
    version: 1,
    defaultEffect: 'deny',
    rules: [{ id: 'rule-a', name: 'A', identities: [], effect: 'allow', priority: 10 }],
    updatedAt: 0,
    updatedBy: 'test',
  })

  const rule: PolicyRule = {
    id: 'rule-b',
    name: 'B',
    identities: [],
    effect: 'deny',
    priority: 20,
  }

  it('appends a rule without mutating the input', () => {
    const before = basePolicy()
    const after = addPolicyRule(before, rule, 'ui')

    expect(before.rules).toHaveLength(1)
    expect(after.rules.map((r) => r.id)).toEqual(['rule-a', 'rule-b'])
    expect(after.updatedBy).toBe('ui')
    expect(after.updatedAt).toBeGreaterThan(0)
  })

  it('removes a rule and leaves the rest untouched', () => {
    const before = addPolicyRule(basePolicy(), rule, 'ui')
    const after = removePolicyRule(before, 'rule-a', 'ui')

    expect(after.rules.map((r) => r.id)).toEqual(['rule-b'])
    expect(after.updatedBy).toBe('ui')
  })

  it('removing an unknown rule is a no-op on the rule list', () => {
    const after = removePolicyRule(basePolicy(), 'missing', 'ui')
    expect(after.rules.map((r) => r.id)).toEqual(['rule-a'])
  })
})

