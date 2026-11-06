import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest, resolveApiUrl } from '../api.js'
import PropertyImage from '../components/PropertyImage.jsx'
import PlatformFeedbackLink from '../components/PlatformFeedbackLink.jsx'
import { useAuth } from '../context/useAuth.js'
import { useComparison } from '../context/useComparison.js'
import './HomeSeekerDashboardPage.css'

const AVAILABILITY_LABELS = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  NEEDS_RECONFIRMATION: 'Needs reconfirmation',
}

const REQUEST_LABELS = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

async function loadAllPages(path) {
  const records = []
  let page = 1
  let hasNext = true

  while (hasNext) {
    const data = await apiRequest(`${path}?page=${page}`, { auth: true })
    records.push(...(data.results || []))
    hasNext = Boolean(data.next)
    page += 1
  }

  return records
}

function dateLabel(value) {
  if (!value) return 'Time not provided'
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Time not provided'
    : new Intl.DateTimeFormat('en-BD', { weekday: 'short', day: 'numeric', month: 'short' }).format(date)
}

function rentLabel(value) {
  return value == null ? 'Rent not provided' : `৳${Number(value).toLocaleString('en-BD')} / month`
}

function PropertyThumb({ variant = 0, src }) {
  return (
    <span className={`seeker-dashboard__thumb seeker-dashboard__thumb--${variant % 3}`} aria-hidden="true">
      {src ? (
        <PropertyImage
          alt=""
          className="seeker-dashboard__thumb-image"
          fallbackAriaLabel="Property photo unavailable"
          fallbackClassName="seeker-dashboard__thumb-image seeker-dashboard__thumb-image--empty"
          fallbackLabel="Photo unavailable"
          src={src}
        />
      ) : (
        <svg viewBox="0 0 84 64" focusable="false">
          <rect className="seeker-dashboard__thumb-sky" width="84" height="64" rx="9" />
          <path className="seeker-dashboard__thumb-ground" d="M0 52h84v3a9 9 0 0 1-9 9H9a9 9 0 0 1-9-9z" />
          <path className="seeker-dashboard__thumb-building" d="M18 11h48v41H18z" />
          {[0, 1, 2].map((row) => [0, 1, 2].map((column) => (
            <rect
              className="seeker-dashboard__thumb-window"
              height="7"
              key={`${row}-${column}`}
              width="6"
              x={24 + column * 13}
              y={17 + row * 11}
            />
          )))}
        </svg>
      )}
    </span>
  )
}

function MetricLink({ to, value, label, note }) {
  return (
    <Link className="seeker-dashboard__metric" to={to}>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{note}</small>
    </Link>
  )
}

function StatusPill({ status, labels, kind }) {
  const label = labels[status] || 'Status unavailable'
  return (
    <span className={`seeker-dashboard__pill seeker-dashboard__pill--${kind}-${String(status || '').toLowerCase()}`}>
      {label}
    </span>
  )
}

function SectionHeading({ id, children, to, linkLabel }) {
  return (
    <header className="seeker-dashboard__section-heading">
      <h2 id={id}>{children}</h2>
      <Link to={to}>{linkLabel}</Link>
    </header>
  )
}

function RequestRow({ request, index, busy, message, onCancel, imageUrl }) {
  const listing = request.listing || {}
  const isPublished = listing.lifecycle_status === 'PUBLISHED'

  return (
    <article className="seeker-dashboard__request-row">
      <PropertyThumb src={imageUrl} variant={index} />
      <div className="seeker-dashboard__row-copy">
        <strong>
          {isPublished
            ? <Link to={`/listings/${listing.id}`}>{listing.title || `Home ${listing.id}`}</Link>
            : listing.title || `Home ${listing.id || ''}`}
        </strong>
        <span>Preferred {dateLabel(request.preferred_at)} · {request.owner?.full_name || 'Property owner'}</span>
        {message && <small className="seeker-dashboard__row-message" role="status">{message}</small>}
      </div>
      <div className="seeker-dashboard__request-actions">
        <StatusPill kind="request" labels={REQUEST_LABELS} status={request.status} />
        {request.status === 'PENDING' && (
          <button className="seeker-dashboard__cancel" disabled={busy} onClick={() => onCancel(request)} type="button">
            {busy ? 'Cancelling…' : 'Cancel request'}
          </button>
        )}
      </div>
    </article>
  )
}

function SavedRow({ item, index, imageUrl }) {
  const listing = item.listing || {}
  const isPublished = listing.lifecycle_status === 'PUBLISHED'

  return (
    <article className="seeker-dashboard__saved-row">
      <PropertyThumb src={imageUrl} variant={index} />
      <div className="seeker-dashboard__row-copy">
        <strong>
          {isPublished
            ? <Link to={`/listings/${listing.id}`}>{listing.title || `Home ${listing.id}`}</Link>
            : listing.title || `Home ${listing.id || ''}`}
        </strong>
        <span>{rentLabel(listing.monthly_rent)}</span>
        <StatusPill kind="availability" labels={AVAILABILITY_LABELS} status={listing.availability?.status} />
      </div>
    </article>
  )
}

function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`
}

export default function HomeSeekerDashboardPage() {
  const { user } = useAuth()
  const { selectedListings } = useComparison()
  const [retry, setRetry] = useState(0)
  const [request, setRequest] = useState({ key: '', data: null, error: null })
  const [listingImageUrls, setListingImageUrls] = useState({})
  const [busyRequestId, setBusyRequestId] = useState(null)
  const [requestMessages, setRequestMessages] = useState({})
  const requestKey = String(retry)

  useEffect(() => {
    let active = true
    Promise.all([
      loadAllPages('/shortlist/'),
      loadAllPages('/viewing-requests/'),
      apiRequest('/conversations/?role=seeker&page=1', { auth: true }),
    ])
      .then(([savedHomes, viewingRequests, conversations]) => {
        if (active) {
          setListingImageUrls({})
          setRequest({
            key: requestKey,
            data: { savedHomes, viewingRequests, conversationCount: conversations.count ?? conversations.results?.length ?? 0 },
            error: null,
          })

          const imageListings = [
            ...savedHomes.slice(0, 3).map((item) => item.listing),
            ...viewingRequests
              .filter((item) => String(item.seeker?.id) === String(user?.id) && item.status !== 'CANCELLED')
              .slice(0, 3)
              .map((item) => item.listing),
          ]
            .filter((listing) => listing?.id && listing.lifecycle_status === 'PUBLISHED')
            .filter((listing, index, listings) => listings.findIndex((candidate) => candidate.id === listing.id) === index)
          Promise.all(imageListings.map(async (listing) => {
            try {
              const details = await apiRequest(`/listings/${encodeURIComponent(listing.id)}/`)
              return [listing.id, details.images?.[0]?.url ? resolveApiUrl(details.images[0].url) : '']
            } catch {
              return [listing.id, '']
            }
          })).then((entries) => {
            if (active) setListingImageUrls(Object.fromEntries(entries))
          })
        }
      })
      .catch((error) => { if (active) setRequest({ key: requestKey, data: null, error }) })

    return () => { active = false }
  }, [requestKey, user?.id])

  const loading = request.key !== requestKey
  const error = loading ? null : request.error
  const data = loading ? null : request.data
  const savedHomes = data?.savedHomes || []
  const viewingRequests = (data?.viewingRequests || []).filter((item) => String(item.seeker?.id) === String(user?.id))
  const pendingCount = viewingRequests.filter((item) => item.status === 'PENDING').length
  const unavailableCount = savedHomes.filter((item) => item.listing?.lifecycle_status !== 'PUBLISHED').length
  const reconfirmationCount = savedHomes.filter((item) => (
    item.listing?.lifecycle_status === 'PUBLISHED'
    && item.listing?.availability?.status === 'NEEDS_RECONFIRMATION'
  )).length
  const recentRequests = viewingRequests.filter((item) => item.status !== 'CANCELLED').slice(0, 3)
  const recentSavedHomes = savedHomes.slice(0, 3)

  const cancelRequest = async (viewingRequest) => {
    setBusyRequestId(viewingRequest.id)
    setRequestMessages((current) => ({ ...current, [viewingRequest.id]: '' }))
    try {
      const updated = await apiRequest(`/viewing-requests/${encodeURIComponent(viewingRequest.id)}/cancel/`, {
        method: 'POST',
        body: {},
        auth: true,
      })
      setRequest((current) => current.key === requestKey
        ? {
          ...current,
          data: {
            ...current.data,
            viewingRequests: current.data.viewingRequests.map((item) => item.id === updated.id ? updated : item),
          },
        }
        : current)
      setRequestMessages((current) => ({ ...current, [viewingRequest.id]: 'Request cancelled.' }))
    } catch (actionError) {
      setRequestMessages((current) => ({
        ...current,
        [viewingRequest.id]: actionError.status === 409
          ? 'This request has already been updated. Refresh the dashboard to see its current status.'
          : actionError.message || 'The request could not be cancelled. Please try again.',
      }))
    } finally {
      setBusyRequestId(null)
    }
  }

  return (
    <section className="seeker-dashboard" aria-labelledby="seeker-dashboard-title">
      <header className="seeker-dashboard__heading">
        <h1 id="seeker-dashboard-title">Welcome back, {user?.full_name?.trim().split(/\s+/)[0] || 'there'}</h1>
        <p>Your saved homes, viewing requests and conversations.</p>
      </header>

      <div className="seeker-dashboard__metrics" aria-live="polite">
        <MetricLink
          label="Saved homes"
          note={unavailableCount ? `${unavailableCount} no longer public` : 'All still public'}
          to="/seeker/saved-listings"
          value={loading ? '…' : savedHomes.length}
        />
        <MetricLink
          label="Selected to compare"
          note="Up to 3 at a time"
          to="/seeker/compare"
          value={selectedListings.length}
        />
        <MetricLink
          label="Pending requests"
          note={pendingCount ? 'Waiting for the owner' : 'Nothing waiting'}
          to="/seeker/viewing-requests"
          value={loading ? '…' : pendingCount}
        />
        <MetricLink
          label="Conversations"
          note="Open Messages to reply"
          to="/seeker/messages"
          value={loading ? '…' : data?.conversationCount ?? '…'}
        />
      </div>

      <PlatformFeedbackLink to="/seeker/feedback" />

      {!loading && !error && (unavailableCount > 0 || reconfirmationCount > 0) && (
        <aside className="seeker-dashboard__notice" role="status">
          <strong>Worth a look</strong>
          <p>
            {unavailableCount > 0 && `${plural(unavailableCount, 'saved home', 'saved homes')} ${unavailableCount === 1 ? 'is' : 'aren’t'} publicly available any more.`}
            {unavailableCount > 0 && reconfirmationCount > 0 ? ' ' : ''}
            {reconfirmationCount > 0 && `${plural(reconfirmationCount, 'saved home', 'saved homes')} ${reconfirmationCount === 1 ? 'needs' : 'need'} the owner to reconfirm availability.`}
            {' '}<Link to="/seeker/saved-listings">See saved homes</Link>
          </p>
        </aside>
      )}

      {loading && <div className="seeker-dashboard__state" role="status">Loading your dashboard…</div>}
      {!loading && error && (
        <div className="seeker-dashboard__state seeker-dashboard__state--error" role="alert">
          <h2>Your dashboard couldn’t be loaded</h2>
          <p>{error.message || 'Please check your connection and try again.'}</p>
          <button className="button button--primary" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button>
        </div>
      )}

      {!loading && !error && (
        <div className="seeker-dashboard__columns">
          <section className="seeker-dashboard__panel" aria-labelledby="seeker-dashboard-requests-title">
            <SectionHeading id="seeker-dashboard-requests-title" linkLabel="All requests" to="/seeker/viewing-requests">Viewing requests</SectionHeading>
            {recentRequests.length ? (
              <div className="seeker-dashboard__request-list">
                {recentRequests.map((item, index) => (
                  <RequestRow
                    busy={busyRequestId === item.id}
                    index={index}
                    key={item.id}
                    message={requestMessages[item.id]}
                    onCancel={cancelRequest}
                    imageUrl={listingImageUrls[item.listing?.id]}
                    request={item}
                  />
                ))}
              </div>
            ) : <p className="seeker-dashboard__empty">No viewing requests yet. When you request a visit, updates will appear here.</p>}
          </section>

          <section className="seeker-dashboard__panel" aria-labelledby="seeker-dashboard-saved-title">
            <SectionHeading id="seeker-dashboard-saved-title" linkLabel="See all" to="/seeker/saved-listings">Recently saved</SectionHeading>
            {recentSavedHomes.length ? (
              <div className="seeker-dashboard__saved-list">
                {recentSavedHomes.map((item, index) => (
                  <SavedRow imageUrl={listingImageUrls[item.listing?.id]} index={index} item={item} key={item.id} />
                ))}
              </div>
            ) : <p className="seeker-dashboard__empty">No saved homes yet. Save homes while browsing to keep them close.</p>}
          </section>
        </div>
      )}
    </section>
  )
}
