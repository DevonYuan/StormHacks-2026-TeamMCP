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

  /** Validate the form and begin the mock session. */
  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setError(null)
    try {
      if (form === 'sign-up') {
        if (password !== confirmPassword) throw new Error('Passwords do not match.')
        signUp(name, email, password, mode)
      } else {
        signIn(email, password, mode)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
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
            <div className="text-label text-ink-muted uppercase">Demo authentication</div>
            <p className="mt-2 text-body-small text-ink">
              This temporary sign-in is only for the app interface. The gateway still uses Tailscale identity and its server-side policy.
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
            {form === 'sign-in' ? 'Log in to continue to your workspace.' : 'Your demo account lasts until the app reloads.'}
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
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
            <button type="submit" className={buttonClass}>
              {form === 'sign-in' ? 'Log in' : 'Create account'}
            </button>
          </form>

          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => continueAsGuest(mode)}
              className="mt-3 w-full rounded-lg border border-border px-4 py-2.5 text-button font-medium text-ink-emphasis hover:bg-surface-muted"
            >
              Skip for development
            </button>
          )}

          {form === 'sign-in' && (
            <p className="mt-5 rounded-lg bg-surface-muted px-3 py-2 text-caption text-ink">
              Demo account: <span className="font-medium text-ink-emphasis">demo@tether.local</span> / <span className="font-medium text-ink-emphasis">demo1234</span>
            </p>
          )}
          <p className="mt-4 text-caption leading-relaxed text-ink-muted">
            Demo only: accounts, passwords, and login history are held in memory and are not sent to a database. This does not secure or identify requests to the gateway.
          </p>
        </section>
      </div>
    </main>
  )
}
