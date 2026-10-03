import { useState } from 'react'
import { useServers, useCreateServer, useUpdateServer, useDeleteServer } from '../hooks'
import {
  Card,
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
} from '../components/Layout'
import type { ServerConfig } from '../../../shared/protocol.js'
import { TransportType } from '../../../shared/protocol.js'

type ServerInput = Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>

interface ServerFormState {
  name: string
  transport: TransportType
  command: string
  args: string
  env: string
  cwd: string
  url: string
  headers: string
  enabled: boolean
  description: string
}

const TRANSPORT_OPTIONS: { value: TransportType; label: string }[] = [
  { value: TransportType.Stdio, label: 'stdio (spawned process)' },
  { value: TransportType.StreamableHttp, label: 'Streamable HTTP' },
  { value: TransportType.Sse, label: 'SSE (legacy)' },
]

function formatTransport(transport: TransportType) {
  const option = TRANSPORT_OPTIONS.find(o => o.value === transport)
  return option?.label || transport
}

function ServerForm({
  server,
  onSubmit,
  onCancel,
  isLoading,
}: {
  server?: ServerConfig | null
  onSubmit: (data: ServerInput) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [formData, setFormData] = useState<ServerFormState>({
    name: '',
    transport: TransportType.Stdio,
    command: '',
    args: '',
    env: '',
    cwd: '',
    url: '',
    headers: '',
    enabled: true,
    description: '',
  })

  if (server) {
    setFormData({
      name: server.name,
      transport: server.transport,
      command: server.command || '',
      args: JSON.stringify(server.args || [], null, 2),
      env: JSON.stringify(server.env || {}, null, 2),
      cwd: server.cwd || '',
      url: server.url || '',
      headers: JSON.stringify(server.headers || {}, null, 2),
      enabled: server.enabled,
      description: server.description || '',
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const data: ServerInput = {
        name: formData.name,
        transport: formData.transport,
        command: formData.command || undefined,
        args: formData.args ? JSON.parse(formData.args) : undefined,
        env: formData.env ? JSON.parse(formData.env) : undefined,
        cwd: formData.cwd || undefined,
        url: formData.url || undefined,
        headers: formData.headers ? JSON.parse(formData.headers) : undefined,
        enabled: formData.enabled,
        description: formData.description || undefined,
      }
      onSubmit(data)
    } catch {
      alert('Invalid JSON in args/env/headers')
    }
  }

  const isStdio = formData.transport === TransportType.Stdio
  const isHttp =
    formData.transport === TransportType.StreamableHttp || formData.transport === TransportType.Sse

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{server ? 'Edit Server' : 'Add Server'}</DialogTitle>
          <DialogDescription>
            Configure an MCP server to expose through the gateway.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transport">Transport</Label>
            <Select
              id="transport"
              value={formData.transport}
              onChange={e => setFormData({ ...formData, transport: e.target.value as TransportType })}
            >
              {TRANSPORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>

          {isStdio && (
            <div className="space-y-4 border-l-2 border-primary/20 pl-4">
              <h4 className="font-medium">stdio Configuration</h4>
              <div className="space-y-2">
                <Label htmlFor="command">Command</Label>
                <Input id="command" placeholder="npx" value={formData.command} onChange={e => setFormData({ ...formData, command: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="args">Arguments (JSON array)</Label>
                <Textarea id="args" placeholder='["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]' value={formData.args} onChange={e => setFormData({ ...formData, args: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cwd">Working Directory (optional)</Label>
                <Input id="cwd" value={formData.cwd} onChange={e => setFormData({ ...formData, cwd: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="env">Environment Variables (JSON object, optional)</Label>
                <Textarea id="env" placeholder='{"KEY": "value"}' value={formData.env} onChange={e => setFormData({ ...formData, env: e.target.value })} />
              </div>
            </div>
          )}

          {isHttp && (
            <div className="space-y-4 border-l-2 border-primary/20 pl-4">
              <h4 className="font-medium">HTTP Configuration</h4>
              <div className="space-y-2">
                <Label htmlFor="url">URL</Label>
                <Input id="url" placeholder="http://localhost:3000/mcp" value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="headers">Headers (JSON object, optional)</Label>
                <Textarea id="headers" placeholder='{"Authorization": "Bearer token"}' value={formData.headers} onChange={e => setFormData({ ...formData, headers: e.target.value })} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="enabled" className="cursor-pointer">Enabled</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {server ? 'Save Changes' : 'Add Server'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Need to import Textarea
import { Textarea } from '../components/Layout'

export function ServersPage({ servers: _initialServers }: { servers: ServerConfig[] }) {
  const { data: servers = [], isLoading, refetch } = useServers()
  const createServer = useCreateServer()
  const updateServer = useUpdateServer()
  const deleteServer = useDeleteServer()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleCreate = async (data: ServerInput) => {
    await createServer.mutateAsync(data)
    setDialogOpen(false)
    refetch()
  }

  const handleUpdate = async (data: ServerInput) => {
    if (editingServer) {
      await updateServer.mutateAsync({ id: editingServer.id, updates: data })
      setDialogOpen(false)
      setEditingServer(null)
      refetch()
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this server?')) {
      await deleteServer.mutateAsync(id)
      refetch()
    }
    setDeletingId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">MCP Servers</h1>
          <p className="text-muted-foreground">Manage local MCP servers exposed through the gateway</p>
        </div>
        <Button onClick={() => { setEditingServer(null); setDialogOpen(true); }}>
          Add Server
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-pulse">Loading servers...</div>
          </CardContent>
        </Card>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-muted-foreground">No servers configured yet. Click "Add Server" to get started.</div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Transport</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map(server => (
                <TableRow key={server.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{server.name}</p>
                      {server.description && <p className="text-sm text-muted-foreground">{server.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatTransport(server.transport)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={server.enabled ? 'default' : 'secondary'}>
                      {server.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingServer(server); setDialogOpen(true); }}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeletingId(server.id)} className="text-destructive hover:text-destructive">
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {dialogOpen && (
        <ServerForm
          server={editingServer}
          onSubmit={editingServer ? handleUpdate : handleCreate}
          onCancel={() => { setDialogOpen(false); setEditingServer(null); }}
          isLoading={createServer.isPending || updateServer.isPending}
        />
      )}

      {deletingId && (
        <Dialog open={true} onOpenChange={() => setDeletingId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Server</DialogTitle>
              <DialogDescription>Are you sure you want to delete this server? This action cannot be undone.</DialogDescription>
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