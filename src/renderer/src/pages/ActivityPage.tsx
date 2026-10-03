import { useState, useEffect } from 'react'
import { useActivity, useActivityStats, EMPTY_ACTIVITY_STATS } from '../hooks'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Select,
  Badge,
  Label,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/Layout'
import type { ActivityQuery } from '../../../shared/activity.js'

function formatTimestamp(ts: number) {
  return new Date(ts).toLocaleString()
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatMethod(method: string) {
  return method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

export function ActivityPage() {
  const { data: stats = EMPTY_ACTIVITY_STATS, refetch: refetchStats } = useActivityStats()

  const [query, setQuery] = useState<ActivityQuery>({
    limit: 100,
    offset: 0,
    sortBy: 'timestamp',
    sortOrder: 'desc',
  })

  const { data: entries = [], isLoading, refetch } = useActivity(query)

  const pageSize = query.limit ?? 100
  const pageOffset = query.offset ?? 0

  // Auto-refetch stats
  useEffect(() => {
    const interval = setInterval(() => refetchStats(), 10000)
    return () => clearInterval(interval)
  }, [refetchStats])

  // Real-time updates would be handled via electronAPI.onActivity listener

  const handleFilterChange = (key: keyof ActivityQuery, value: unknown) => {
    setQuery(prev => ({ ...prev, [key]: value, offset: 0 }))
  }

  const handlePageChange = (offset: number) => {
    setQuery(prev => ({ ...prev, offset }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Activity Log</h1>
          <p className="text-muted-foreground">Monitor all gateway requests and tool invocations</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.totalRequests || 0}</div>
            <div className="text-sm text-muted-foreground">Total Requests</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.successfulRequests || 0}</div>
            <div className="text-sm text-muted-foreground">Successful</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.failedRequests || 0}</div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.uniqueUsers || 0}</div>
            <div className="text-sm text-muted-foreground">Unique Users</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatDuration(stats.avgDurationMs || 0)}</div>
            <div className="text-sm text-muted-foreground">Avg Duration</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="method">Method</Label>
              <Select
                id="method"
                value={query.method || ''}
                onChange={e => handleFilterChange('method', e.target.value || undefined)}
              >
                <option value="">All Methods</option>
                <option value="tools/call">tools/call</option>
                <option value="tools/list">tools/list</option>
                <option value="resources/read">resources/read</option>
                <option value="resources/list">resources/list</option>
                <option value="prompts/get">prompts/get</option>
                <option value="prompts/list">prompts/list</option>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="serverId">Server</Label>
              <Select
                id="serverId"
                value={query.serverId || ''}
                onChange={e => handleFilterChange('serverId', e.target.value || undefined)}
              >
                <option value="">All Servers</option>
                {Object.keys(stats.byServer || {}).map(serverId => (
                  <option key={serverId} value={serverId}>{serverId}</option>
                ))}
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="identity">Identity</Label>
              <Select
                id="identity"
                value={query.identity || ''}
                onChange={e => handleFilterChange('identity', e.target.value || undefined)}
              >
                <option value="">All Identities</option>
                {Object.keys(stats.byIdentity || {}).map(identity => (
                  <option key={identity} value={identity}>{identity}</option>
                ))}
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="success">Status</Label>
              <Select
                id="success"
                value={query.success !== undefined ? String(query.success) : ''}
                onChange={e => handleFilterChange('success', e.target.value === '' ? undefined : e.target.value === 'true')}
              >
                <option value="">All</option>
                <option value="true">Success</option>
                <option value="false">Failed</option>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="limit">Limit</Label>
              <Select
                id="limit"
                value={String(query.limit)}
                onChange={e => handleFilterChange('limit', parseInt(e.target.value, 10))}
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Time</TableHead>
              <TableHead>Identity</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Server</TableHead>
              <TableHead>Tool</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Duration</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <div className="animate-pulse">Loading activity...</div>
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No activity entries found.
                </TableCell>
              </TableRow>
            ) : (
              entries.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-sm">{formatTimestamp(entry.timestamp)}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{entry.identity.user}</p>
                      <p className="text-xs text-muted-foreground">{entry.identity.device}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatMethod(entry.method)}</Badge>
                  </TableCell>
                  <TableCell>{entry.serverId}</TableCell>
                  <TableCell>
                    {entry.toolName ? (
                      <code className="text-sm">{entry.toolName}</code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.success ? 'default' : 'destructive'}>
                      {entry.success ? 'Success' : 'Failed'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{formatDuration(entry.durationMs)}</TableCell>
                  <TableCell className="max-w-md truncate">
                    {entry.success ? entry.responseSummary : entry.errorMessage || entry.responseSummary}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between py-4 border-t">
          <div className="text-sm text-muted-foreground">
            Showing {entries.length} entries
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(Math.max(0, pageOffset - pageSize))}
              disabled={pageOffset === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pageOffset + pageSize)}
              disabled={entries.length < pageSize}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Error breakdown */}
      {stats.errorsByCode && Object.keys(stats.errorsByCode).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Errors by Code</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.errorsByCode).map(([code, count]) => (
                <Badge key={code} variant="destructive">
                  {code}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}