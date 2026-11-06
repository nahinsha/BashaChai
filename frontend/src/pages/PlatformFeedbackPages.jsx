import { useEffect, useState } from 'react'
import { apiRequest } from '../api.js'
import './PlatformFeedbackPages.css'

const STATUS_LABELS = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
}

function dateLabel(value) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function FeedbackHeading({ admin = false }) {
  return <header className="platform-feedback__heading">
    <p className="eyebrow">{admin ? 'Admin / Moderator' : 'BasaChai community'}</p>
    <h1>Feedback &amp; Reviews</h1>
    <p>{admin
      ? 'Review feedback about the BasaChai platform experience.'
      : 'Share feedback about your experience using BasaChai. Your ideas help us make house hunting easier for everyone.'}</p>
  </header>
}

function StatusPill({ status }) {
  return <span className={`platform-feedback__status platform-feedback__status--${String(status || '').toLowerCase()}`}>{STATUS_LABELS[status] || 'Status unavailable'}</span>
}

function Rating({ value, onChange }) {
  return <fieldset className="platform-feedback__rating">
    <legend>Your rating <span>(optional)</span></legend>
    <div>{[1, 2, 3, 4, 5].map((score) => <button aria-label={`${score} out of 5 stars`} aria-pressed={value === score} className={score <= value ? 'is-selected' : ''} key={score} onClick={() => onChange(value === score ? 0 : score)} type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2.8 2.85 5.78 6.38.93-4.62 4.5 1.09 6.36L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93L12 2.8Z" /></svg></button>)}<span className="platform-feedback__rating-hint">Tap a star to rate</span></div>
  </fieldset>
}

export function MemberPlatformFeedbackPage() {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [request, setRequest] = useState({ key: '', data: null, error: null })
  const [rating, setRating] = useState(0)
  const [message, setMessage] = useState('')
  const [scopeAcknowledged, setScopeAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [notice, setNotice] = useState('')
  const requestKey = `${page}:${retry}`

  useEffect(() => {
    let active = true
    apiRequest(`/platform-feedback/?page=${page}`, { auth: true })
      .then((data) => { if (active) setRequest({ key: requestKey, data, error: null }) })
      .catch((error) => { if (active) setRequest({ key: requestKey, data: null, error }) })
    return () => { active = false }
  }, [page, requestKey])

  const loading = request.key !== requestKey
  const error = loading ? null : request.error
  const data = loading ? null : request.data
  const submissions = data?.results || []

  const submitFeedback = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    setNotice('')
    try {
      await apiRequest('/platform-feedback/', {
        method: 'POST',
        body: { rating: rating || null, message: message.trim(), scope_acknowledged: scopeAcknowledged },
        auth: true,
      })
      setMessage('')
      setRating(0)
      setScopeAcknowledged(false)
      setPage(1)
      setRetry((value) => value + 1)
      setNotice('Thank you. Your platform feedback has been submitted.')
    } catch (issue) {
      setSubmitError(issue.message || 'Your feedback could not be submitted. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const pages = Math.max(1, Math.ceil((data?.count || 0) / (data?.page_size || 20)))

  return <section className="platform-feedback-page platform-feedback-page--member">
    <FeedbackHeading />
    <form className="platform-feedback__form" onSubmit={submitFeedback}>
      <h2>Tell us about your BasaChai experience</h2>
      <p>Use this form for platform features, usability, and ideas that could improve BasaChai.</p>
      <Rating onChange={setRating} value={rating} />
      <label className="platform-feedback__message">Your feedback
        <textarea maxLength={2000} onChange={(event) => setMessage(event.target.value)} placeholder="What is working well, or what could we improve?" required rows={5} value={message} />
        <small>{message.length}/2000 characters</small>
      </label>
      <label className="platform-feedback__scope"><input checked={scopeAcknowledged} onChange={(event) => setScopeAcknowledged(event.target.checked)} required type="checkbox" />
        This is feedback about the BasaChai platform experience, not a private conversation or complaint about another person.
      </label>
      {submitError && <p className="platform-feedback__error" role="alert">{submitError}</p>}
      {notice && <p className="platform-feedback__notice" role="status">{notice}</p>}
      <button className="button button--primary" disabled={submitting || !message.trim() || !scopeAcknowledged} type="submit">{submitting ? 'Submitting…' : 'Submit feedback'}</button>
    </form>

    <aside className="platform-feedback__aside">
    <section className="platform-feedback__submissions" aria-labelledby="my-platform-feedback-title">
      <header><div><h2 id="my-platform-feedback-title">Your submissions</h2><p>Only you and the BasaChai admin team can see your submissions.</p></div><button aria-label="Refresh submissions" className="platform-feedback__refresh" disabled={loading} onClick={() => setRetry((value) => value + 1)} type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></svg></button></header>
      {loading && <p className="platform-feedback__state" role="status">Loading your feedback…</p>}
      {error && <div className="platform-feedback__state" role="alert"><p>{error.message || 'Your feedback could not be loaded.'}</p><button className="button button--quiet" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button></div>}
      {!loading && !error && !submissions.length && <div className="platform-feedback__empty"><span className="platform-feedback__empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h16l1 11H3L4 8Z"/><path d="M8 8V5h8v3m-8 5 1.5 2h5L16 13"/></svg></span><strong>No feedback yet</strong><p>You have not submitted any platform feedback yet.</p></div>}
      {!loading && !error && submissions.length > 0 && <div className="platform-feedback__list">{submissions.map((item) => <article className="platform-feedback__item" key={item.id}>
        <header><div><strong>{item.rating ? `${item.rating} out of 5 stars` : 'No rating'}</strong><time dateTime={item.created_at}>{dateLabel(item.created_at)}</time></div><StatusPill status={item.status} /></header>
        <p>{item.message}</p>
      </article>)}</div>}
      {!loading && !error && data?.count > (data?.page_size || 20) && <nav className="platform-feedback__pagination" aria-label="Feedback pages"><button className="button button--quiet" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button><span>Page {page} of {pages}</span><button className="button button--quiet" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} type="button">Next</button></nav>}
    </section>
    <section className="platform-feedback__helpful"><h2>What makes feedback helpful</h2><ul><li>Say what you were trying to do on BasaChai.</li><li>Describe what worked well or got in the way.</li><li>Share one idea that would make it better.</li></ul></section>
    <div className="platform-feedback__reminder"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z"/><path d="M9 12h.01M12 9v4m0 3h.01"/></svg><p>Please do not include private conversations or complaints about other people.</p></div>
    </aside>
  </section>
}

export function AdminPlatformFeedbackPage() {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')
  const [retry, setRetry] = useState(0)
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [request, setRequest] = useState({ key: '', data: null, error: null })
  const query = new URLSearchParams({ page: String(page) })
  if (filter) query.set('status', filter)
  const queryString = query.toString()
  const requestKey = `${queryString}:${retry}`

  useEffect(() => {
    let active = true
    apiRequest(`/moderation/feedback/?${queryString}`, { auth: true })
      .then((data) => { if (active) setRequest({ key: requestKey, data, error: null }) })
      .catch((error) => { if (active) setRequest({ key: requestKey, data: null, error }) })
    return () => { active = false }
  }, [queryString, requestKey])

  const loading = request.key !== requestKey
  const data = loading ? null : request.data
  const error = loading ? null : request.error
  const changeStatus = async (item, status) => {
    setBusyId(item.id)
    setNotice('')
    setErrorMessage('')
    try {
      await apiRequest(`/moderation/feedback/${item.id}/`, { method: 'PATCH', body: { status }, auth: true })
      setNotice(`Feedback #${item.id} marked ${STATUS_LABELS[status].toLowerCase()}.`)
      setRetry((value) => value + 1)
    } catch (issue) {
      setErrorMessage(issue.message || 'The feedback status could not be updated.')
    } finally {
      setBusyId(null)
    }
  }
  const pages = Math.max(1, Math.ceil((data?.count || 0) / (data?.page_size || 20)))

  return <section className="platform-feedback-page platform-feedback-page--admin">
    <FeedbackHeading admin />
    <section className="platform-feedback__submissions platform-feedback__admin-queue" aria-labelledby="admin-platform-feedback-title">
      <header><div><h2 id="admin-platform-feedback-title">Platform feedback</h2><p>Submissions are about the BasaChai product experience. Private conversations are not included.</p></div><label className="platform-feedback__filter">Status<select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1) }}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></header>
      {notice && <p className="platform-feedback__notice" role="status">{notice}</p>}
      {errorMessage && <p className="platform-feedback__error" role="alert">{errorMessage}</p>}
      {loading && <p className="platform-feedback__state" role="status">Loading platform feedback…</p>}
      {error && <div className="platform-feedback__state" role="alert"><p>{error.message || 'Platform feedback could not be loaded.'}</p><button className="button button--quiet" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button></div>}
      {!loading && !error && !data?.results?.length && <p className="platform-feedback__state">No platform feedback has been submitted.</p>}
      {!loading && !error && data?.results?.length > 0 && <div className="platform-feedback__list">{data.results.map((item) => <article className="platform-feedback__item" key={item.id}>
        <header><div><strong>{item.author_name}</strong><span>{item.author_email}</span><time dateTime={item.created_at}>{dateLabel(item.created_at)}</time></div><label className="platform-feedback__status-control">Status<select disabled={busyId === item.id} onChange={(event) => changeStatus(item, event.target.value)} value={item.status}><option value="SUBMITTED">Submitted</option><option value="UNDER_REVIEW">Under review</option><option value="RESOLVED">Resolved</option><option value="REJECTED">Rejected</option></select></label></header>
        {item.rating && <p className="platform-feedback__rating-display" aria-label={`${item.rating} out of 5 stars`}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)} <span>{item.rating}/5</span></p>}
        <p>{item.message}</p>
        {item.reviewed_by_name && <small>Last updated by {item.reviewed_by_name} · {dateLabel(item.reviewed_at)}</small>}
      </article>)}</div>}
      {!loading && !error && data?.count > (data?.page_size || 20) && <nav className="platform-feedback__pagination" aria-label="Feedback pages"><button className="button button--quiet" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button><span>Page {page} of {pages}</span><button className="button button--quiet" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} type="button">Next</button></nav>}
    </section>
  </section>
}
