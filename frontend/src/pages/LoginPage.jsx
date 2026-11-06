import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import './PublicPages.css'

function defaultDestination(user) {
  if (user?.roles?.includes('ADMIN_MODERATOR')) return '/moderation/reports'
  if (user?.roles?.includes('HOME_SEEKER')) return '/seeker'
  if (user?.roles?.includes('PROPERTY_OWNER')) return '/owner'
  return '/'
}

export default function LoginPage() {
  const { status, user, sessionExpired, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  if (status === 'checking' && !loading) {
    return <div className="state-panel" role="status">Checking your session…</div>
  }

  if (status === 'authenticated' && !loading) {
    return <Navigate to={defaultDestination(user)} replace />
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const currentUser = await signIn(email.trim(), password)
      const requestedPath = location.state?.from
      const requestedRole = requestedPath?.startsWith('/moderation')
        ? 'ADMIN_MODERATOR'
        : requestedPath?.startsWith('/owner')
        ? 'PROPERTY_OWNER'
        : requestedPath?.startsWith('/seeker')
          ? 'HOME_SEEKER'
          : null
      const requestedRoles = requestedPath === '/profile'
        ? ['HOME_SEEKER', 'PROPERTY_OWNER']
        : requestedRole ? [requestedRole] : null
      const target = requestedPath && (!requestedRoles || requestedRoles.some((role) => currentUser.roles.includes(role)))
        ? requestedPath
        : defaultDestination(currentUser)
      navigate(target, { replace: true })
    } catch (requestError) {
      setError(requestError.message || 'We couldn’t sign you in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="login-page login-page--reference" aria-labelledby="login-title">
      <div className="login-layout">
      <aside className="login-story" aria-labelledby="login-story-title">
        <Link className="login-story__brand" to="/" aria-label="BasaChai home">
          <span aria-hidden="true" className="login-story__brand-mark"><svg viewBox="0 0 24 24"><path d="m4 11 8-7 8 7v9h-6v-6h-4v6H4z"/></svg></span>
          <span>BasaChai</span>
        </Link>
        <div className="login-story__copy">
          <p className="login-story__welcome" id="login-story-title">Welcome Back to <span>BasaChai</span></p>
          <h1>Welcome back.</h1>
          <p className="login-story__tagline"><em>Your home search journey continues here.</em></p>
          <p className="login-story__description">Everything you need to pick up where you left off.</p>
          <ul>
            <li>Revisit your saved homes</li>
            <li>Keep track of your conversations</li>
            <li>Stay connected with property owners</li>
          </ul>
        </div>
        <svg aria-hidden="true" className="login-story__street-art" viewBox="0 0 581 230" preserveAspectRatio="none">
          <circle cx="34" cy="112" r="58" fill="#064d3b"/>
          <circle cx="536" cy="136" r="57" fill="#064d3b"/>
          <path d="M305 9h174v168H305z" fill="#d8ded6"/>
          <path d="M323 30h21v19h-21zm39 0h21v19h-21zm39 0h21v19h-21zm39 0h21v19h-21zm-117 35h21v19h-21zm39 0h21v19h-21zm39 0h21v19h-21zm39 0h21v19h-21zm-117 35h21v19h-21zm39 0h21v19h-21zm39 0h21v19h-21zm39 0h21v19h-21zm-117 35h21v19h-21zm39 0h21v19h-21zm39 0h21v19h-21zm39 0h21v19h-21z" fill="#37735c"/>
          <path d="M0 177h581v53H0z" fill="#18241f"/>
          <path d="M0 207h581" stroke="#dce4dd" strokeDasharray="29 22" strokeWidth="3"/>
          <circle cx="110" cy="185" r="29" fill="none" stroke="#e6eee7" strokeWidth="5"/>
          <circle cx="204" cy="185" r="29" fill="none" stroke="#e6eee7" strokeWidth="5"/>
          <path d="m91 166 16-49 67-14 36 63H91Z" fill="#d5342a"/>
          <path d="M111 166h99v14h-99z" fill="#c7ed31"/>
        </svg>
      </aside>
      <div className="login-panel">
        <svg aria-hidden="true" className="login-panel__skyline" viewBox="0 0 240 150">
          <path d="M0 80h28v70H0zm34-40h22v110H34zm29-40h34v120H63zm40 60h26v90h-26zm33-40h31v110h-31zm37 50h24v60h-24zm30-20h32v80h-32z" fill="#dfefe7"/>
        </svg>
        <div className="login-panel__content">
          <p className="login-panel__eyebrow">Welcome back</p>
          <h2 id="login-title">Sign in to BasaChai</h2>
          <p className="login-panel__intro">Pick up where you left off.</p>
          {(sessionExpired || location.state?.sessionExpired) && (
            <p className="login-message" role="status">Your session expired. Please sign in again.</p>
          )}
          {error && <p className="login-message login-message--error" role="alert">{error}</p>}
          <form className="login-form login-panel__form" onSubmit={submit}>
            <label className="form-field" htmlFor="login-email">
              <span>Email</span>
              <span className="login-panel__input-wrap">
                <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
                <input autoComplete="username" id="login-email" name="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email}/>
              </span>
            </label>
            <div className="login-panel__password-heading">
              <label className="form-field__label" htmlFor="login-password">Password</label>
              <Link className="login-card__forgot" to="/forgot-password">Forgot password?</Link>
            </div>
            <span className="login-panel__input-wrap">
              <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
              <input autoComplete="current-password" id="login-password" name="password" onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required type={showPassword ? 'text' : 'password'} value={password}/>
              <button aria-label={showPassword ? 'Hide password' : 'Show password'} className="login-panel__show-password" onClick={() => setShowPassword((shown) => !shown)} type="button">{showPassword ? 'Hide' : 'Show'}</button>
            </span>
            <button className="button button--primary login-submit" disabled={loading} type="submit">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 4h5v16h-5M10 8l4 4-4 4m4-4H3"/></svg>
              {loading ? 'Signing in\u2026' : 'Sign in'}
            </button>
          </form>
          <p className="login-panel__register">New to BasaChai? <Link to="/register">Create account</Link></p>
        </div>
      </div>
      </div>
    </section>
  )
}
