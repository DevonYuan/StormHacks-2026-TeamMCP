import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { AccountMode } from '../auth/mockAuth'

type AuthForm = 'sign-in' | 'sign-up'

const inputClass =
  'w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-body text-ink-emphasis outline-none placeholder:text-ink-muted focus:outline-2 focus:outline-ring'
const buttonClass =
  'w-full rounded-lg bg-brand px-4 py-2.5 text-button font-medium text-primary-foreground hover:opacity-90'

/** Render the demo signup/login form and collect the preferred operating mode. */
export default function AuthPage(): React.JSX.Element {
  const { signIn, signUp, continueAsGuest } = useAuth()
  const [form, setForm] = useState<AuthForm>('sign-in')
  const [mode, setMode] = useState<AccountMode>('server')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hostAddress, setHostAddress] = useState('')
  const [busy, setBusy] = useState(false)

  /** Validate credentials and authenticate against the selected gateway. */
  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'client' && !hostAddress.trim()) throw new Error('Enter the host gateway address.')
      let status: 'pending' | 'approved' | 'revoked'
      if (form === 'sign-up') {
        if (password !== confirmPassword) throw new Error('Passwords do not match.')
        status = await signUp(name, email, password, mode, mode === 'client' ? hostAddress.trim() : '')
      } else {
        status = await signIn(email, password, mode, mode === 'client' ? hostAddress.trim() : '')
      }
      if (status === 'pending') {
        setNotice('Your account is waiting for approval from the gateway host. Once approved, log in again.')
      } else if (status === 'revoked') {
        setError('This account has been revoked by the gateway host.')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-xl md:grid-cols-2">
        <section className="flex flex-col justify-between bg-surface-sidebar p-8 md:p-10">
          <div>
            <img src="./logo.png" alt="Tether" className="mb-12 h-10 w-auto" />
            <p className="text-h4 text-brand-text uppercase">Team MCP Gateway</p>
            <h1 className="mt-3 text-h1 text-ink-heading">Your tools.<br />Your team.</h1>
            <p className="mt-4 max-w-md text-body text-ink">
              Share local MCP servers with teammates, with access managed by the gateway host.
            </p>
          </div>
          <div className="mt-10 rounded-xl border border-border bg-surface-raised p-4">
            <div className="text-label text-ink-muted uppercase">Gateway accounts</div>
            <p className="mt-2 text-body-small text-ink">
              Accounts are stored by each gateway and linked to the verified Tailscale identity. New client accounts require host approval.
            </p>
          </div>
        </section>

        <section className="p-8 md:p-10">
          <div className="mb-7 flex rounded-lg border border-border p-1" role="tablist" aria-label="Authentication form">
            {(['sign-in', 'sign-up'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={form === item}
                onClick={() => { setForm(item); setError(null) }}
                className={`flex-1 rounded-md px-3 py-2 text-body-small font-medium ${
                  form === item ? 'bg-brand text-primary-foreground' : 'text-ink hover:text-ink-emphasis'
                }`}
              >
                {item === 'sign-in' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          <h2 className="text-h2 text-ink-heading">{form === 'sign-in' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-body-small text-ink">
            {mode === 'client'
              ? 'Sign in to a gateway hosted by a teammate.'
              : form === 'sign-in'
                ? 'Log in to this gateway.'
                : 'Create the host account for this gateway.'}
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === 'client' && (
              <label className="block text-body-small text-ink-emphasis">
                Host gateway address
                <input
                  autoComplete="url"
                  className={`${inputClass} mt-1.5`}
                  value={hostAddress}
                  onChange={(event) => setHostAddress(event.target.value)}
                  placeholder="100.64.12.21:8788"
                  required
                />
              </label>
            )}
            {form === 'sign-up' && (
              <label className="block text-body-small text-ink-emphasis">
                Name
                <input
                  autoComplete="name"
                  className={`${inputClass} mt-1.5`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
            )}
            <label className="block text-body-small text-ink-emphasis">
              Email
              <input
                type="email"
                autoComplete="email"
                className={`${inputClass} mt-1.5`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block text-body-small text-ink-emphasis">
              Password
              <input
                type="password"
                autoComplete={form === 'sign-in' ? 'current-password' : 'new-password'}
                className={`${inputClass} mt-1.5`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
            {form === 'sign-up' && (
              <label className="block text-body-small text-ink-emphasis">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  className={`${inputClass} mt-1.5`}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </label>
            )}

            <fieldset>
              <legend className="mb-2 text-body-small font-medium text-ink-emphasis">How will you use Tether?</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['client', 'server'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={mode === item}
                    onClick={() => setMode(item)}
                    className={`rounded-lg border px-3 py-3 text-left ${
                      mode === item ? 'border-brand bg-brand/10 text-brand-text' : 'border-border text-ink hover:bg-surface-muted'
                    }`}
                  >
                    <span className="block text-button font-medium capitalize">{item}</span>
                    <span className="mt-1 block text-caption text-ink">
                      {item === 'client' ? 'Connect to a teammate’s gateway' : 'Share your local MCP servers'}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            {error && <p role="alert" className="rounded-lg border border-status-blocked/30 bg-status-blocked/5 px-3 py-2 text-body-small text-status-blocked">{error}</p>}
            <button type="submit" disabled={busy} className={`${buttonClass} disabled:opacity-60`}>
              {busy ? 'Connecting…' : form === 'sign-in' ? 'Log in' : 'Create account'}
            </button>
          </form>

          {notice && <p role="status" className="mt-3 rounded-lg border border-border bg-surface-muted px-3 py-2 text-body-small text-ink-emphasis">{notice}</p>}

          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => continueAsGuest(mode)}
              className="mt-3 w-full rounded-lg border border-border px-4 py-2.5 text-button font-medium text-ink-emphasis hover:bg-surface-muted"
            >
              Skip for development
            </button>
          )}

          {import.meta.env.DEV && !window.electronAPI && form === 'sign-in' && (
            <p className="mt-5 rounded-lg bg-surface-muted px-3 py-2 text-caption text-ink">
              Demo account: <span className="font-medium text-ink-emphasis">demo@tether.local</span> / <span className="font-medium text-ink-emphasis">demo1234</span>
            </p>
          )}
          <p className="mt-4 text-caption leading-relaxed text-ink-muted">
            Your password is hashed and stored only by the gateway you select. Client access is linked to your Tailscale identity and the gateway host must approve new accounts.
          </p>
        </section>
      </div>
    </main>
  )
}
