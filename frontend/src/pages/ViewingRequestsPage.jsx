import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/useAuth.js'
import UserAvatar from '../components/UserAvatar.jsx'
import SeekerProfileModal from '../components/SeekerProfileModal.jsx'
import './ViewingRequestsPage.css'

const STATUS_LABELS = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All requests' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

function dateTimeLabel(value) {
  if (!value) return 'Time not provided'
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Time not provided'
    : new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function actionErrorMessage(error) {
  if (error.code === 'invalid_status_transition' || error.status === 409) {
    return 'This request has already been updated. Refresh the list to see its current status.'
  }
  if (error.status === 404) return 'This request is no longer available to you.'
  return error.message || 'The request could not be updated. Please try again.'
}

async function loadAllRequests() {
  const requests = []
  let page = 1
  let hasNext = true
  while (hasNext) {
    const data = await apiRequest(`/viewing-requests/?page=${page}`, { auth: true })
    requests.push(...(data.results || []))
    hasNext = Boolean(data.next)
    page += 1
  }
  return requests
}

function ViewingRequestCard({ request, workspace, onAction, busy, message }) {
  const [showSeekerProfile, setShowSeekerProfile] = useState(false)
  const listing = request.listing || {}
  const isOwner = workspace === 'owner'
  const isPending = request.status === 'PENDING'
  const canOpenListing = listing.lifecycle_status === 'PUBLISHED'
  const listingName = listing.title || `Home ${listing.id}`
  const participant = isOwner ? request.seeker : request.owner

  return (
    <article className="viewing-request-card">
      <div className="viewing-request-card__date" aria-hidden="true">
        <span>{dateTimeLabel(request.preferred_at).split(',')[0]}</span>
      </div>
      <div className="viewing-request-card__body">
        <div className="viewing-request-card__heading">
          <div>
            <p className="eyebrow">{isOwner ? 'Viewing request' : 'Requested home'}</p>
            <h2>
              {canOpenListing
                ? <Link to={`/listings/${listing.id}`}>{listingName}</Link>
                : listingName}
            </h2>
          </div>
          <span className={`viewing-request-status viewing-request-status--${String(request.status || '').toLowerCase()}`}>
            {STATUS_LABELS[request.status] || 'Status unavailable'}
          </span>
        </div>

        <dl className="viewing-request-card__details">
          <div>
            <dt>Preferred time</dt>
            <dd>{dateTimeLabel(request.preferred_at)}</dd>
          </div>
          <div>
            <dt>{isOwner ? 'Home Seeker' : 'Property Owner'}</dt>
            <dd className="viewing-request-card__participant">
              <UserAvatar authenticated size="small" user={participant} />
              <span>{participant?.full_name || 'BasaChai user'}</span>
              {isOwner && (
                <button
                  className="button button--quiet viewing-request-card__profile-btn"
                  onClick={() => setShowSeekerProfile(true)}
                  type="button"
                >
                  View profile
                </button>
              )}
            </dd>
          </div>
        </dl>

        {message && <p className="viewing-request-card__feedback" role="status">{message}</p>}
        {!canOpenListing && (
          <p className="viewing-request-card__note">This home is no longer publicly listed. Your request history is still available.</p>
        )}

        <div className="viewing-request-card__actions">
          {isPending && isOwner && (
            <>
              <button className="button button--primary viewing-request-card__accept" disabled={busy} onClick={() => onAction(request, 'accept')} type="button">
                {busy === 'accept' ? 'Accepting...' : 'Accept'}
              </button>
              <button className="button button--quiet viewing-request-card__reject" disabled={busy} onClick={() => onAction(request, 'reject')} type="button">
                {busy === 'reject' ? 'Rejecting...' : 'Reject'}
              </button>
            </>
          )}
          {isPending && !isOwner && (
            <button className="button button--quiet viewing-request-card__cancel" disabled={busy} onClick={() => onAction(request, 'cancel')} type="button">
              {busy === 'cancel' ? 'Cancelling...' : 'Cancel request'}
            </button>
          )}
          {canOpenListing && <Link className="button button--quiet" to={`/listings/${listing.id}`}>View home</Link>}
        </div>
      </div>
      {isOwner && (
        <SeekerProfileModal
          isOpen={showSeekerProfile}
          onClose={() => setShowSeekerProfile(false)}
          seeker={participant}
        />
      )}
    </article>
  )
}

export default function ViewingRequestsPage({ workspace }) {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [filter, setFilter] = useState('ALL')
  const [busyRequest, setBusyRequest] = useState(null)
  const [feedback, setFeedback] = useState({})
  const isOwner = workspace === 'owner'

  useEffect(() => {
    let active = true
    loadAllRequests()
      .then((allRequests) => { if (active) setRequests(allRequests) })
      .catch((requestError) => { if (active) setError(requestError.message || 'Your viewing requests could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])

  const relevantRequests = useMemo(() => requests.filter((request) => (
    isOwner
      ? String(request.seeker?.id) !== String(user?.id)
      : String(request.seeker?.id) === String(user?.id)
  )), [isOwner, requests, user?.id])

  const visibleRequests = useMemo(() => relevantRequests.filter((request) => (
    filter === 'ALL' || request.status === filter
  )), [filter, relevantRequests])

  const actOnRequest = async (request, action) => {
    setBusyRequest({ id: request.id, action })
    setFeedback((current) => ({ ...current, [request.id]: '' }))
    try {
      const updated = await apiRequest(`/viewing-requests/${encodeURIComponent(request.id)}/${action}/`, {
        method: 'POST',
        body: {},
        auth: true,
      })
      setRequests((current) => current.map((item) => item.id === updated.id ? updated : item))
      const label = STATUS_LABELS[updated.status] || 'Updated'
      setFeedback((current) => ({ ...current, [request.id]: `Request ${label.toLowerCase()}.` }))
    } catch (requestError) {
      setFeedback((current) => ({ ...current, [request.id]: actionErrorMessage(requestError) }))
    } finally {
      setBusyRequest(null)
    }
  }

  return (
    <section className={`viewing-requests-page${isOwner ? '' : ' viewing-requests-page--seeker'}`} aria-labelledby="viewing-requests-title">
      <header className="owner-page-heading viewing-requests-heading">
        <div>
          <p className="eyebrow">{isOwner ? 'Property Owner' : 'Home Seeker'}</p>
          <h1 id="viewing-requests-title">{isOwner ? 'Incoming Viewing Requests' : 'My Viewing Requests'}</h1>
          <p>{isOwner
            ? 'Review visit requests for your homes and respond to pending requests.'
            : 'Keep track of your requested visits and their status.'}</p>
        </div>
        {!isOwner && <Link className="button button--primary" to="/listings">Browse homes</Link>}
      </header>

      <nav className="viewing-request-filters" aria-label="Filter viewing requests">
        {STATUS_FILTERS.map((item) => {
          const count = item.value === 'ALL'
            ? relevantRequests.length
            : relevantRequests.filter((request) => request.status === item.value).length
          return (
            <button
              aria-pressed={filter === item.value}
              className="viewing-request-filters__button"
              key={item.value}
              onClick={() => setFilter(item.value)}
              type="button"
            >
              {item.label} <span>{count}</span>
            </button>
          )
        })}
      </nav>

      {loading && <div className="state-panel" role="status">Loading viewing requests...</div>}
      {!loading && error && (
        <div className="state-panel state-panel--error" role="alert">
          <h2>Viewing requests could not be loaded</h2>
          <p>{error}</p>
          <button className="button button--primary" onClick={() => { setError(''); setLoading(true); setRetry((value) => value + 1) }} type="button">Try again</button>
        </div>
      )}
      {!loading && !error && visibleRequests.length === 0 && (
        <div className="state-panel viewing-request-empty">
          <h2>{filter === 'ALL' ? 'No viewing requests yet' : `No ${STATUS_LABELS[filter]?.toLowerCase() || ''} requests`}</h2>
          <p>{isOwner
            ? 'Requests from Home Seekers will appear here.'
            : filter === 'ALL'
              ? 'When you request a visit, you can follow the response here.'
              : 'Try another status to see more of your requests.'}</p>
          {!isOwner && filter === 'ALL' && <Link className="button button--quiet" to="/listings">Browse homes</Link>}
        </div>
      )}
      {!loading && !error && visibleRequests.length > 0 && (
        <div className="viewing-request-list">
          {visibleRequests.map((request) => {
            const busy = busyRequest?.id === request.id ? busyRequest.action : false
            return (
              <ViewingRequestCard
                busy={busy}
                key={request.id}
                message={feedback[request.id]}
                onAction={actOnRequest}
                request={request}
                workspace={workspace}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
