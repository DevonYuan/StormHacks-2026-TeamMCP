import type { GatewayApproval } from '../../shared/account.js'
import type { Identity } from '../../shared/policy.js'
import type { GatewayApprovalRepository } from '../db/repository.js'

/** Own host-local access requests and approval decisions for Tailscale identities. */
export class GatewayApprovalService {
  constructor(private readonly approvals: GatewayApprovalRepository) {}

  request(identity: Identity): GatewayApproval {
    return this.approvals.request(identity)
  }

  listAll(): GatewayApproval[] {
    return this.approvals.getAll()
  }

  approve(id: string): GatewayApproval {
    const approval = this.approvals.approve(id)
    if (!approval) throw new Error('Gateway approval not found.')
    return approval
  }

  revoke(id: string): GatewayApproval {
    const existing = this.approvals.getById(id)
    if (!existing || !this.approvals.revoke(id)) {
      throw new Error('Approved gateway access not found.')
    }
    return { ...existing, status: 'revoked' }
  }

  authorize(identity: Identity): GatewayApproval | undefined {
    return this.approvals.getApprovedForIdentity(identity)
  }

  trustLocalHost(identity: Identity): GatewayApproval {
    return this.approvals.createApprovedIfMissing(identity)
  }
}
