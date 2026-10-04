export type ApprovalStatus = 'pending' | 'approved' | 'revoked'

/** One Tailscale user’s access decision on a single gateway. */
export interface GatewayApproval {
  id: string
  tailscaleUser: string
  tailnet: string
  device: string
  status: ApprovalStatus
  createdAt: number
  approvedAt?: number
}
