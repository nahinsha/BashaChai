import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../api.js'
import './PasswordRecoveryPages.css'

function emailError(error) {
  const value = error.fields?.email
  if (Array.isArray(value)) return value.join(' ')
  return typeof value === 'string' ? value : ''
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setFieldError('')
    try {
      await requestPasswordReset(email.trim())
      setSent(true)
    } catch (requestError) {
      setFieldError(emailError(requestError))
      setError(emailError(requestError) ? '' : requestError.message || 'We could not send the request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="login-page password-recovery-page" aria-labelledby="forgot-password-title">
      <div className="login-card password-recovery-card">
        <p className="eyebrow">Account help</p>
        <h1 id="forgot-password-title">Forgot your password?</h1>
        {sent ? (
          <div className="password-recovery-result" role="status">
            <p>If an account exists for that email, password recovery instructions will be sent.</p>
            <p>Check your inbox for a link to choose a new password.</p>
            <Link className="button button--primary password-recovery-button" to="/login">Back to sign in</Link>
          </div>
        ) : (
          <>
            <p className="login-card__intro">Enter the email address you use to sign in. We will send a reset link if an account matches.</p>
            {error && <p className="login-message login-message--error" role="alert">{error}</p>}
            <form className="login-form" onSubmit={submit}>
              <label className="form-field" htmlFor="recovery-email">
                <span>Email</span>
                <input
                  aria-describedby={fieldError ? 'recovery-email-error' : undefined}
                  aria-invalid={Boolean(fieldError)}
                  autoComplete="email"
                  id="recovery-email"
                  name="email"
                  onChange={(event) => { setEmail(event.target.value); setFieldError(''); setError('') }}
                  required
                  type="email"
                  value={email}
                />
                {fieldError && <small className="password-recovery-field-error" id="recovery-email-error">{fieldError}</small>}
              </label>
              <button className="button button--primary login-submit password-recovery-button" disabled={submitting} type="submit">
                {submitting ? 'Sending...' : error ? 'Try again' : 'Send reset link'}
              </button>
            </form>
            <p className="login-card__browse"><Link to="/login">Back to sign in</Link></p>
          </>
        )}
      </div>
    </section>
  )
}
