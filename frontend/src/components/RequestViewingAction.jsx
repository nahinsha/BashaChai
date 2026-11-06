import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/useAuth.js'
import './RequestViewingAction.css'

function localDateTimeMinimum() {
  const date = new Date(Date.now() + 60_000)
  date.setSeconds(0, 0)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function preferredAtError(error) {
  const fieldError = error.fields?.preferred_at
  if (Array.isArray(fieldError)) return fieldError.join(' ')
  if (typeof fieldError === 'string') return fieldError
  return ''
}

export default function RequestViewingAction({ listing }) {
  const { status, user } = useAuth()
  const location = useLocation()
  const [showForm, setShowForm] = useState(false)
  const [preferredAt, setPreferredAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (status === 'checking') return null
  if (status !== 'authenticated') {
    return (
      <Link
        className="button button--quiet request-viewing-action"
        state={{ from: `${location.pathname}${location.search}` }}
        to="/login"
      >Sign in to request a viewing</Link>
    )
  }
  if (!user?.roles?.includes('HOME_SEEKER')) return null
  if (listing.owner?.id != null && String(listing.owner.id) === String(user.id)) {
    return <p className="message-owner-action__note">You can’t request a visit to your own home.</p>
  }

  const isAvailable = listing.availability?.status === 'AVAILABLE'

  const submitRequest = async (event) => {
    event.preventDefault()
    setError('')
    const selectedDate = new Date(preferredAt)
    if (!preferredAt || Number.isNaN(selectedDate.valueOf())) {
      setError('Choose a valid date and time for your visit.')
      return
    }
    if (selectedDate <= new Date()) {
      setError('Choose a future date and time.')
      return
    }

    setSubmitting(true)
    try {
      await apiRequest('/viewing-requests/', {
        method: 'POST',
        body: { listing_id: listing.id, preferred_at: selectedDate.toISOString() },
        auth: true,
      })
      setSuccess(true)
      setShowForm(false)
    } catch (requestError) {
      if (requestError.code === 'duplicate_pending_request') {
        setError('You already have a pending request for this home. You can check it in your viewing requests.')
      } else if (requestError.code === 'listing_not_accepting_requests') {
        setError('This home is no longer accepting viewing requests.')
      } else if (requestError.status === 403) {
        setError('A Home Seeker cannot request a visit to their own home.')
      } else if (requestError.status === 404) {
        setError('This home is no longer available for a viewing request.')
      } else {
        setError(preferredAtError(requestError) || requestError.message || 'Your viewing request could not be sent. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAvailable) {
    return <p className="request-viewing-action__note">This home is not currently accepting viewing requests.</p>
  }

  return (
    <div className="request-viewing-action">
      {success ? (
        <div className="request-viewing-action__success" role="status">
          <p>Your viewing request was sent.</p>
          <Link className="text-link" to="/seeker/viewing-requests">View your requests</Link>
        </div>
      ) : (
        <>
          {!showForm && (
            <button className="button button--primary request-viewing-action__trigger" onClick={() => setShowForm(true)} type="button">
              Request a viewing
            </button>
          )}
          {showForm && (
            <form className="request-viewing-form" onSubmit={submitRequest}>
              <label htmlFor={`preferred-at-${listing.id}`}>Preferred date and time</label>
              <input
                aria-describedby={error ? `preferred-at-error-${listing.id}` : `preferred-at-help-${listing.id}`}
                aria-invalid={Boolean(error)}
                id={`preferred-at-${listing.id}`}
                min={localDateTimeMinimum()}
                onChange={(event) => setPreferredAt(event.target.value)}
                required
                type="datetime-local"
                value={preferredAt}
              />
              {error
                ? <p className="request-viewing-form__error" id={`preferred-at-error-${listing.id}`} role="alert">{error}</p>
                : <p className="request-viewing-form__hint" id={`preferred-at-help-${listing.id}`}>Choose a future time. The owner will respond to your request.</p>}
              <div className="request-viewing-form__actions">
                <button className="button button--primary request-viewing-action__trigger" disabled={submitting} type="submit">
                  {submitting ? 'Sending...' : 'Send request'}
                </button>
                <button className="button button--quiet" disabled={submitting} onClick={() => { setShowForm(false); setError('') }} type="button">Cancel</button>
              </div>
            </form>
          )}
          {error && !showForm && <p className="request-viewing-action__error" role="alert">{error}</p>}
        </>
      )}
    </div>
  )
}
