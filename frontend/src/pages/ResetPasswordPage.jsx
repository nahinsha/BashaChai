import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset } from '../api.js'
import './PasswordRecoveryPages.css'

function passwordError(error) {
  const value = error.fields?.new_password
  if (Array.isArray(value)) return value.join(' ')
  return typeof value === 'string' ? value : ''
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [invalidToken, setInvalidToken] = useState(!token)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setFieldError('')
    if (!token) {
      setInvalidToken(true)
      return
    }
    if (password !== confirmPassword) {
      setFieldError('The passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await confirmPasswordReset(token, password)
      setComplete(true)
    } catch (requestError) {
      const validationMessage = passwordError(requestError)
      if (requestError.status === 401 || requestError.code === 'invalid_token') {
        setInvalidToken(true)
      } else if (validationMessage) {
        setFieldError(validationMessage)
      } else {
        setError(requestError.message || 'Your password could not be changed. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="login-page password-recovery-page" aria-labelledby="reset-password-title">
      <div className="login-card password-recovery-card">
        <p className="eyebrow">Account help</p>
        <h1 id="reset-password-title">Choose a new password</h1>
        {complete ? (
          <div className="password-recovery-result" role="status">
            <p>Your password has been changed.</p>
            <Link className="button button--primary password-recovery-button" to="/login">Sign in</Link>
          </div>
        ) : invalidToken ? (
          <div className="password-recovery-result" role="alert">
            <p>This reset link is invalid or has expired. Request a new link to continue.</p>
            <Link className="button button--primary password-recovery-button" to="/forgot-password">Request another link</Link>
          </div>
        ) : (
          <>
            <p className="login-card__intro">Choose a strong password for your BasaChai account.</p>
            {error && <p className="login-message login-message--error" role="alert">{error}</p>}
            <form className="login-form" onSubmit={submit}>
              <label className="form-field" htmlFor="reset-new-password">
                <span>New password</span>
                <input
                  autoComplete="new-password"
                  id="reset-new-password"
                  minLength={8}
                  onChange={(event) => { setPassword(event.target.value); setFieldError('') }}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <label className="form-field" htmlFor="reset-confirm-password">
                <span>Confirm new password</span>
                <input
                  aria-describedby={fieldError ? 'reset-password-error' : undefined}
                  aria-invalid={Boolean(fieldError)}
                  autoComplete="new-password"
                  id="reset-confirm-password"
                  minLength={8}
                  onChange={(event) => { setConfirmPassword(event.target.value); setFieldError('') }}
                  required
                  type="password"
                  value={confirmPassword}
                />
                {fieldError && <small className="password-recovery-field-error" id="reset-password-error" role="alert">{fieldError}</small>}
              </label>
              <button className="button button--primary login-submit password-recovery-button" disabled={submitting} type="submit">
                {submitting ? 'Saving...' : error ? 'Try again' : 'Save new password'}
              </button>
            </form>
            <p className="login-card__browse"><Link to="/login">Back to sign in</Link></p>
          </>
        )}
      </div>
    </section>
  )
}
