import { useConfig, useUpdateConfig, useTailscaleStatus } from '../hooks'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Select,
  Label,
  Badge,
} from '../components/Layout'
import type { GatewayConfig } from '../../../shared/config.js'

export function SettingsPage() {
  const { data: config } = useConfig()
  const updateConfig = useUpdateConfig()
  const { data: tailscaleStatus } = useTailscaleStatus()

  const [localConfig, setLocalConfig] = useState<Partial<GatewayConfig>>({})

  const handleChange = (key: keyof GatewayConfig, value: string | number | boolean) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    await updateConfig.mutateAsync(localConfig)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure gateway behavior and network settings</p>
      </div>

      {/* Gateway Network Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Gateway Network</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              type="number"
              value={localConfig.port || config?.gateway.port || 8788}
              onChange={e => handleChange('port', parseInt(e.target.value, 10))}
              min="1"
              max="65535"
            />
            <p className="text-xs text-muted-foreground">Port for the gateway HTTP listener</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bindAddr">Bind Address</Label>
            <Input
              id="bindAddr"
              value={localConfig.bindAddr || config?.gateway.bindAddr || '127.0.0.1'}
              onChange={e => handleChange('bindAddr', e.target.value)}
              placeholder="127.0.0.1 or 100.x.y.z"
            />
            <p className="text-xs text-muted-foreground">
              IP address to bind to. Use 127.0.0.1 for local only, or your Tailscale IP (100.x.y.z) for remote access.
              <strong>Never use 0.0.0.0</strong>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logLevel">Log Level</Label>
            <Select
              id="logLevel"
              value={localConfig.logLevel || config?.gateway.logLevel || 'info'}
              onChange={e => handleChange('logLevel', e.target.value)}
            >
              <option value="trace">Trace</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="fatal">Fatal</option>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="redactToolPayloads"
              checked={localConfig.redactToolPayloads ?? config?.gateway.redactToolPayloads ?? true}
              onChange={e => handleChange('redactToolPayloads', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="redactToolPayloads" className="cursor-pointer">
              Redact tool payloads in activity log
            </Label>
          </div>
          <p className="text-xs text-muted-foreground ml-6">
            When enabled, tool arguments and results are summarized rather than logged in full. Recommended for privacy.
          </p>

          <div className="flex items-center justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tailscale Status */}
      <Card>
        <CardHeader>
          <CardTitle>Tailscale Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Badge variant={tailscaleStatus?.available ? 'default' : 'destructive'}>
              {tailscaleStatus?.available ? 'Connected' : 'Not Available'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {tailscaleStatus?.available
                ? `IP: ${tailscaleStatus.ip} · Hostname: ${tailscaleStatus.hostname}`
                : 'Install and sign in to Tailscale for remote access'}
            </span>
          </div>

          {tailscaleStatus?.available && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tailnet IP:</span>
                <code>{tailscaleStatus.ip}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hostname:</span>
                <code>{tailscaleStatus.hostname}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">MagicDNS:</span>
                <code>{tailscaleStatus.dnsName}</code>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            The gateway uses Tailscale for secure remote access. Ensure Tailscale is running and both machines
            are on the same tailnet with MagicDNS enabled.
          </p>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Session Tokens</h4>
            <p className="text-sm text-muted-foreground">
              Gateway uses Ed25519-signed session tokens for authentication. The signing key is stored in the OS keychain
              via Electron's safeStorage. Tokens expire after 24 hours by default.
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">Authorization Policy</h4>
            <p className="text-sm text-muted-foreground">
              Policy is stored locally in SQLite and evaluated per-request. Default effect is <strong>deny</strong>.
              Configure rules in the Policy page to grant access to specific users, servers, and tools.
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">Data Persistence</h4>
            <p className="text-sm text-muted-foreground">
              All data (server registry, policy, activity log) is stored in a local SQLite database (<code>gateway.db</code>).
              No data leaves your machine unless explicitly forwarded to a connected MCP client.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span>0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Project</span>
            <span>Team MCP Gateway</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Hackathon</span>
            <span>StormHacks 2026</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Repository</span>
            <span><a href="https://github.com/DevonYuan/StormHacks-2026" target="_blank" className="text-primary hover:underline">GitHub</a></span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Need to import useState
import { useState } from 'react'