import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Sidebar, Header, GatewayStatusBadge } from './components/Layout'
import { ServersPage } from './pages/ServersPage'
import { PolicyPage } from './pages/PolicyPage'
import { ActivityPage } from './pages/ActivityPage'
import { HealthPage } from './pages/HealthPage'
import { SettingsPage } from './pages/SettingsPage'
import { useGatewayStatus, useServers, usePolicy } from './hooks'

function Navigation() {
  const navItems = [
    { path: '/', label: 'Servers', icon: 'server' },
    { path: '/policy', label: 'Policy', icon: 'shield' },
    { path: '/activity', label: 'Activity', icon: 'activity' },
    { path: '/health', label: 'Health', icon: 'heart-pulse' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ]

  return (
    <Sidebar>
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`
            }
          >
            <Icon name={item.icon} className="h-5 w-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </Sidebar>
  )
}

function Icon({ name, className }: { name: string; className?: string }) {
  // Simple inline icons - in production use lucide-react
  const icons: Record<string, JSX.Element> = {
    server: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
    shield: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    activity: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    'heart-pulse': (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 12 17.66" />
        <path d="M23 19V21" />
        <path d="M17 19V21" />
        <path d="M11 19V21" />
        <path d="M5 19V21" />
      </svg>
    ),
    settings: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  }
  return icons[name] || null
}

function AppContent() {
  const { data: gatewayStatus } = useGatewayStatus()
  const { data: servers } = useServers()
  const { data: policy } = usePolicy()

  return (
    <div className="flex h-screen bg-background">
      <Navigation />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header>
          <GatewayStatusBadge status={gatewayStatus} />
        </Header>
        <main className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/" element={<ServersPage servers={servers || []} />} />
            <Route path="/policy" element={<PolicyPage policy={policy} />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/health" element={<HealthPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}