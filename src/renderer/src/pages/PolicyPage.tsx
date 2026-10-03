import { useState } from 'react'
import { usePolicy, useUpdatePolicy } from '../hooks'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Select,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
  Textarea,
} from '../components/Layout'
import type { PolicyDocument, PolicyRule, Identity } from '../../../shared/policy.js'

function formatEffect(effect: 'allow' | 'deny') {
  return effect === 'allow' ? 'Allow' : 'Deny'
}

function formatIdentity(identity: Identity) {
  const parts = []
  if (identity.user) parts.push(`user: ${identity.user}`)
  if (identity.device) parts.push(`device: ${identity.device}`)
  if (identity.deviceId) parts.push(`deviceId: ${identity.deviceId}`)
  if (identity.tailnet) parts.push(`tailnet: ${identity.tailnet}`)
  return parts.length > 0 ? parts.join(', ') : 'All identities'
}

function RuleForm({
  rule,
  onSubmit,
  onCancel,
  isLoading,
}: {
  rule?: PolicyRule | null
  onSubmit: (data: Omit<PolicyRule, 'id'>) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [formData, setFormData] = useState<Omit<PolicyRule, 'id'>>({
    name: '',
    identities: [],
    servers: [],
    tools: [],
    effect: 'allow',
    priority: 0,
    description: '',
  })

  if (rule) {
    setFormData({
      name: rule.name,
      identities: rule.identities || [],
      servers: rule.servers || [],
      tools: rule.tools || [],
      effect: rule.effect,
      priority: rule.priority,
      description: rule.description || '',
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit Rule' : 'Add Rule'}</DialogTitle>
          <DialogDescription>
            Define access control rules. Rules are evaluated by priority (highest first).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Rule Name</Label>
            <Input id="name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
          </div>

          <div className="space-y-2">
            <Label>Effect</Label>
            <Select
              value={formData.effect}
              onChange={e => setFormData({ ...formData, effect: e.target.value as 'allow' | 'deny' })}
            >
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              type="number"
              value={formData.priority}
              onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value, 10) })}
              min="0"
            />
            <p className="text-xs text-muted-foreground">Higher priority rules are evaluated first.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="identities">Identities (JSON array, optional)</Label>
            <Textarea
              id="identities"
              placeholder='[{"user": "alice@example.com", "device": "", "deviceId": "", "tailnet": ""}]'
              value={JSON.stringify(formData.identities, null, 2)}
              onChange={e => {
                try {
                  setFormData({ ...formData, identities: JSON.parse(e.target.value) })
                } catch {
                  // Ignore JSON while the user is mid-edit
                }
              }}
            />
            <p className="text-xs text-muted-foreground">Empty array = match all authenticated users. Leave fields empty for wildcards.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="servers">Server IDs (JSON array, optional)</Label>
            <Textarea
              id="servers"
              placeholder='["filesystem", "git"]'
              value={JSON.stringify(formData.servers, null, 2)}
              onChange={e => {
                try {
                  setFormData({ ...formData, servers: JSON.parse(e.target.value) })
                } catch {
                  // Ignore JSON while the user is mid-edit
                }
              }}
            />
            <p className="text-xs text-muted-foreground">Empty array = all servers.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tools">Tool Names (JSON array, optional)</Label>
            <Textarea
              id="tools"
              placeholder='["filesystem__read_file", "git__search_repository"]'
              value={JSON.stringify(formData.tools, null, 2)}
              onChange={e => {
                try {
                  setFormData({ ...formData, tools: JSON.parse(e.target.value) })
                } catch {
                  // Ignore JSON while the user is mid-edit
                }
              }}
            />
            <p className="text-xs text-muted-foreground">Use namespaced format: serverId__toolName. Empty array = all tools on matched servers.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {rule ? 'Save Changes' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PolicyPage({ policy: _initialPolicy }: { policy: PolicyDocument | undefined }) {
  const { data: policy, isLoading, refetch } = usePolicy()
  const updatePolicy = useUpdatePolicy()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<PolicyRule | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleCreate = async (data: Omit<PolicyRule, 'id'>) => {
    const newRule: PolicyRule = { ...data, id: crypto.randomUUID() }
    const updatedPolicy = { ...policy!, rules: [...(policy?.rules || []), newRule], updatedAt: Date.now(), updatedBy: 'ui' }
    await updatePolicy.mutateAsync(updatedPolicy)
    setDialogOpen(false)
    refetch()
  }

  const handleUpdate = async (data: Omit<PolicyRule, 'id'>) => {
    if (editingRule && policy) {
      const updatedRules = policy.rules.map(r => (r.id === editingRule.id ? { ...data, id: r.id } : r))
      const updatedPolicy = { ...policy, rules: updatedRules, updatedAt: Date.now(), updatedBy: 'ui' }
      await updatePolicy.mutateAsync(updatedPolicy)
      setDialogOpen(false)
      setEditingRule(null)
      refetch()
    }
  }

  const handleDelete = async (id: string) => {
    if (policy && confirm('Are you sure you want to delete this rule?')) {
      const updatedRules = policy.rules.filter(r => r.id !== id)
      const updatedPolicy = { ...policy, rules: updatedRules, updatedAt: Date.now(), updatedBy: 'ui' }
      await updatePolicy.mutateAsync(updatedPolicy)
      refetch()
    }
    setDeletingId(null)
  }

  const handleDefaultEffectChange = async (effect: 'allow' | 'deny') => {
    if (policy) {
      const updatedPolicy = { ...policy, defaultEffect: effect, updatedAt: Date.now(), updatedBy: 'ui' }
      await updatePolicy.mutateAsync(updatedPolicy)
      refetch()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Authorization Policy</h1>
          <p className="text-muted-foreground">Control who can access which servers and tools</p>
        </div>
        <Button onClick={() => { setEditingRule(null); setDialogOpen(true); }}>Add Rule</Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Default Effect</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="cursor-pointer">
              <input
                type="radio"
                name="defaultEffect"
                checked={policy?.defaultEffect === 'allow'}
                onChange={() => handleDefaultEffectChange('allow')}
                className="mr-2"
              />
              Allow
            </Label>
            <Label className="cursor-pointer">
              <input
                type="radio"
                name="defaultEffect"
                checked={policy?.defaultEffect === 'deny'}
                onChange={() => handleDefaultEffectChange('deny')}
                className="mr-2"
              />
              Deny
            </Label>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Default effect applied when no rule matches. <strong>Deny</strong> is recommended for security.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-pulse">Loading policy...</div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Effect</TableHead>
                <TableHead>Identities</TableHead>
                <TableHead>Servers</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(policy?.rules || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No rules defined. Click "Add Rule" to create your first policy rule.
                  </TableCell>
                </TableRow>
              ) : (
                (policy?.rules || []).map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <Badge variant="outline">{rule.priority}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant={rule.effect === 'allow' ? 'default' : 'destructive'}>
                        {formatEffect(rule.effect)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {rule.identities && rule.identities.length > 0 ? (
                        rule.identities.map(id => (
                          <Badge key={`${id.user}-${id.deviceId}`} variant="secondary" className="mr-1">
                            {formatIdentity(id)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">All</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {rule.servers && rule.servers.length > 0 ? (
                        rule.servers.map(s => <Badge key={s} variant="secondary" className="mr-1">{s}</Badge>)
                      ) : (
                        <span className="text-muted-foreground">All</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {rule.tools && rule.tools.length > 0 ? (
                        rule.tools.map(t => <Badge key={t} variant="secondary" className="mr-1">{t}</Badge>)
                      ) : (
                        <span className="text-muted-foreground">All</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingRule(rule); setDialogOpen(true); }}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeletingId(rule.id)} className="text-destructive hover:text-destructive">
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {dialogOpen && (
        <RuleForm
          rule={editingRule}
          onSubmit={editingRule ? handleUpdate : handleCreate}
          onCancel={() => { setDialogOpen(false); setEditingRule(null); }}
          isLoading={updatePolicy.isPending}
        />
      )}

      {deletingId && (
        <Dialog open={true} onOpenChange={() => setDeletingId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Rule</DialogTitle>
              <DialogDescription>Are you sure you want to delete this rule? This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete(deletingId!)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}