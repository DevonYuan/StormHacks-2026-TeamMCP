import { useHealth } from '../hooks'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
} from '../components/Layout'
import type { ServerHealth } from '../../../shared/activity.js'

function formatStatus(status: ServerHealth['status']) {
  const labels = {
    healthy: 'Healthy',
    degraded: 'Degraded',
    unhealthy: 'Unhealthy',
    unknown: 'Unknown',
  }
  return labels[status]
}

function getStatusVariant(status: ServerHealth['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'healthy': return 'default'
    case 'degraded': return 'secondary'
    case 'unhealthy': return 'destructive'
    default: return 'outline'
  }
}

function formatTimestamp(ts: number | undefined) {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleString()
}

export function HealthPage() {
  const { data: health = [], isLoading, refetch } = useHealth()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Server Health</h1>
          <p className="text-muted-foreground">Monitor the health and performance of connected MCP servers</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{health.length}</div>
            <div className="text-sm text-muted-foreground">Total Servers</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {health.filter(h => h.status === 'healthy').length}
            </div>
            <div className="text-sm text-muted-foreground">Healthy</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">
              {health.filter(h => h.status === 'degraded').length}
            </div>
            <div className="text-sm text-muted-foreground">Degraded</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {health.filter(h => h.status === 'unhealthy').length}
            </div>
            <div className="text-sm text-muted-foreground">Unhealthy</div>
          </CardContent>
        </Card>
      </div>

      {/* Health Table */}
      <Card>
        {isLoading ? (
          <CardContent className="py-12 text-center">
            <div className="animate-pulse">Loading health data...</div>
          </CardContent>
        ) : health.length === 0 ? (
          <CardContent className="py-12 text-center">
            <div className="text-muted-foreground">No servers connected. Add servers in the Servers page.</div>
          </CardContent>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Check</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Consecutive Failures</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {health.map(server => (
                  <TableRow key={server.serverId}>
                    <TableCell className="font-medium">{server.serverId}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(server.status)}>
                        {formatStatus(server.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatTimestamp(server.lastCheck)}</TableCell>
                    <TableCell>
                      {server.latencyMs !== undefined ? (
                        <span className="font-mono text-sm">{server.latencyMs}ms</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {server.consecutiveFailures > 0 ? (
                        <span className="text-red-600 font-medium">{server.consecutiveFailures}</span>
                      ) : (
                        <span className="text-green-600">0</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {server.error ? (
                        <span className="text-red-600 text-sm">{server.error}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => refetch()}>
                        Refresh
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      {/* Health Details */}
      {health.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Health Check Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {health.map(server => (
                <div key={server.serverId} className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">{server.serverId}</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={getStatusVariant(server.status)}>{formatStatus(server.status)}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Check:</span>
                      <span>{formatTimestamp(server.lastCheck)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Latency:</span>
                      <span>{server.latencyMs !== undefined ? `${server.latencyMs}ms` : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Failures:</span>
                      <span>{server.consecutiveFailures}</span>
                    </div>
                    {server.error && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Error:</span>
                        <span className="text-red-600 text-sm truncate max-w-[200px]">{server.error}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}