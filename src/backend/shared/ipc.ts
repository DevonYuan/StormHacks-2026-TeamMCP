export const IPC_CHANNELS = {
  GATEWAY_START: 'gateway:start',
  GATEWAY_STOP: 'gateway:stop',
  GATEWAY_STATUS: 'gateway:status',
  GATEWAY_LOG: 'gateway:log',
  GATEWAY_EXPOSE: 'gateway:expose',

  SERVERS_GET: 'servers:get',
  SERVERS_CREATE: 'servers:create',
  SERVERS_UPDATE: 'servers:update',
  SERVERS_DELETE: 'servers:delete',
  SERVERS_CONNECT: 'servers:connect',
  SERVERS_DISCONNECT: 'servers:disconnect',
  SERVERS_REFRESH: 'servers:refresh',

  POLICY_GET: 'policy:get',
  POLICY_UPDATE: 'policy:update',
  POLICY_ADD_RULE: 'policy:addRule',
  POLICY_REMOVE_RULE: 'policy:removeRule',

  ACTIVITY_QUERY: 'activity:query',
  ACTIVITY_STATS: 'activity:stats',
  ACTIVITY_PRUNE: 'activity:prune',

  HEALTH_GET: 'health:get',
  HOST_STATS: 'host:stats',

  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',

  TAILSCALE_STATUS: 'tailscale:status',
  TAILSCALE_WHOIS: 'tailscale:whois',
  TAILSCALE_DEVICES: 'tailscale:devices',

  SHARE_GET: 'share:get',
  PEERS_ADD: 'peers:add',
  PEERS_REMOVE: 'peers:remove',

  EVENT_ACTIVITY: 'event:activity',
  EVENT_SERVER_HEALTH: 'event:serverHealth',
  EVENT_GATEWAY_STATUS: 'event:gatewayStatus',
  EVENT_TOOLS_CHANGED: 'event:toolsChanged',
  PROTOCOL_URL: 'protocol:url',
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
