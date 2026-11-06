import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/useAuth.js'
import './ReportListingAction.css'

function reasonFieldError(error) {
  const value = error.fields?.reason
  if (Array.isArray(value)) return value.join(' ')
  return typeof value === 'string' ? value : ''
}

export default function ReportListingAction({ listingId, ownerId }) {
  const { status, user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')

  if (status === 'checking') return null
  if (status !== 'authenticated') {
    return (
      <div className="report-listing-action report-listing-action--signin">
        <p>See something wrong with this home?</p>
        <Link
          className="text-link"
          state={{ from: `${location.pathname}${location.search}` }}
          to="/login"
        >Sign in as a Home Seeker to report it</Link>
      </div>
    )
  }

  if (!user?.roles?.includes('HOME_SEEKER') || String(user.id) === String(ownerId)) return null

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setFieldError('')
    if (!reason.trim()) {
      setFieldError('Please explain why you are reporting this listing.')
      return
    }

    setSubmitting(true)
    try {
      await apiRequest('/reports/', {
        method: 'POST',
        body: { listing_id: listingId, reason: reason.trim() },
        auth: true,
      })
      setSubmitted(true)
      setReason('')
    } catch (requestError) {
      const validation = reasonFieldError(requestError)
      setFieldError(validation)
      if (!validation) {
        if (requestError.status === 403) {
          setError('You do not have permission to report this listing.')
        } else if (requestError.status === 404) {
          setError('This listing is no longer available to report.')
        } else {
          setError(requestError.message || 'Your report could not be sent. Please try again.')
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="report-listing-action" aria-labelledby="report-listing-title">
      <p className="eyebrow">Help keep BasaChai useful</p>
      <h2 id="report-listing-title">Report this listing</h2>
      {submitted ? (
        <div className="report-listing-success" role="status">
          <p>Your report has been submitted. Our moderation team will review it.</p>
        </div>
      ) : !open ? (
        <>
          <p>If this home seems suspicious, misleading, or inappropriate, let us know.</p>
          <button className="button button--quiet report-listing-button" onClick={() => setOpen(true)} type="button">
            Report this home
          </button>
        </>
      ) : (
        <form className="report-listing-form" onSubmit={submit}>
          <p>Explain what seems suspicious, misleading, or inappropriate about this home.</p>
          {error && <p className="report-listing-error" role="alert">{error}</p>}
          <label className="form-field" htmlFor={`report-reason-${listingId}`}>
            <span>Reason for reporting</span>
            <textarea
              aria-describedby={fieldError ? `report-reason-error-${listingId}` : undefined}
              aria-invalid={Boolean(fieldError)}
              id={`report-reason-${listingId}`}
              name="reason"
              onChange={(event) => { setReason(event.target.value); setFieldError(''); setError('') }}
              required
              rows={4}
              value={reason}
            />
            {fieldError && <small className="report-listing-field-error" id={`report-reason-error-${listingId}`}>{fieldError}</small>}
          </label>
          <div className="report-listing-form__actions">
            <button className="button button--primary report-listing-button" disabled={submitting} type="submit">
              {submitting ? 'Sending report…' : error ? 'Try again' : 'Submit report'}
            </button>
            <button className="button button--quiet" disabled={submitting} onClick={() => { setOpen(false); setError(''); setFieldError('') }} type="button">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
