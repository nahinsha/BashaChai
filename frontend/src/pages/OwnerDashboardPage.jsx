import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import PropertyImage from '../components/PropertyImage.jsx'
import PlatformFeedbackLink from '../components/PlatformFeedbackLink.jsx'
import { useAuth } from '../context/useAuth.js'
import { OwnerModerationFeedback } from './ModerationPages.jsx'
import './OwnerPages.css'

const LIFECYCLE_LABELS = {
  DRAFT: 'Unpublished',
  PUBLISHED: 'Published',
  UNPUBLISHED: 'Unpublished',
  REMOVED: 'Removed',
}

const AVAILABILITY_LABELS = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  NEEDS_RECONFIRMATION: 'Needs reconfirmation',
}

function rentLabel(value) {
  return value == null ? 'Rent not provided' : `৳${Number(value).toLocaleString('en-BD')}`
}

function dateLabel(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-GB', options).format(date)
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

function ListingRow({ listing }) {
  const availability = listing.availability_status || ''
  const publication = LIFECYCLE_LABELS[listing.lifecycle_status] || 'Unknown'

  return (
    <article className="owner-overview-listing">
      <PropertyImage authenticated alt="" className="owner-overview-listing__image" fallbackClassName="owner-overview-listing__image owner-overview-listing__image--empty" src={listing.images?.[0]?.url || listing.primary_image_url} />
      <div className="owner-overview-listing__body">
        <h3>{listing.title || `Listing ${listing.id}`}</h3>
        <p className="owner-overview-listing__rent">{rentLabel(listing.monthly_rent)} <span>· {listing.location || 'Location not provided'}</span></p>
        <div className="owner-overview-listing__meta">
          <span>Publication <b className="owner-overview-listing__publication">{publication}</b></span>
          {listing.has_active_moderation_hold && <b className="owner-overview-listing__hold">Admin hold</b>}
          <span>Availability <b className={`owner-overview-listing__availability owner-overview-listing__availability--${availability.toLowerCase()}`}><i aria-hidden="true" />{AVAILABILITY_LABELS[availability] || 'Unknown'}</b></span>
        </div>
        <p className="owner-overview-listing__dates">Confirmed {dateLabel(listing.availability_confirmed_at)} · Updated {dateLabel(listing.updated_at)}</p>
        {listing.has_active_moderation_hold && <p className="owner-overview-listing__notice">Unpublished by a moderator. You can publish again once the hold is released.</p>}
      </div>
    </article>
  )
}

export default function OwnerDashboardPage() {
  const { user } = useAuth()
  const [retry, setRetry] = useState(0)
  const [request, setRequest] = useState({ key: '', data: null, error: null })
  const [pendingId, setPendingId] = useState(null)
  const [pendingRequest, setPendingRequest] = useState(null)
  const [actionErrors, setActionErrors] = useState({})
  const [actionMessages, setActionMessages] = useState({})
  const [requestMessages, setRequestMessages] = useState({})
  const requestKey = String(retry)

  useEffect(() => {
    let active = true
    Promise.all([
      loadAllPages('/owner/listings/'),
      loadAllPages('/viewing-requests/'),
    ])
      .then(([listings, viewingRequests]) => {
        if (active) setRequest({ key: requestKey, data: { listings, viewingRequests }, error: null })
      })
      .catch((error) => { if (active) setRequest({ key: requestKey, data: null, error }) })
    return () => { active = false }
  }, [requestKey])

  const loading = request.key !== requestKey
  const data = loading ? null : request.data
  const error = loading ? null : request.error
  const listings = data?.listings || []
  const incomingRequests = (data?.viewingRequests || []).filter((item) => String(item.seeker?.id) !== String(user?.id))
  const pendingRequests = incomingRequests.filter((item) => item.status === 'PENDING')
  const recentListings = listings.slice(0, 4)
  const confirmationListings = listings.filter((listing) => listing.availability_status === 'NEEDS_RECONFIRMATION')
  const publishedCount = listings.filter((listing) => listing.lifecycle_status === 'PUBLISHED').length
  const hiddenCount = listings.filter((listing) => ['DRAFT', 'UNPUBLISHED'].includes(listing.lifecycle_status)).length

  const handleAvailabilityAction = async (listing, action) => {
    setPendingId(listing.id)
    setActionErrors((current) => ({ ...current, [listing.id]: '' }))
    setActionMessages((current) => ({ ...current, [listing.id]: '' }))
    try {
      const updatedListing = await apiRequest(
        `/owner/listings/${listing.id}/availability/`,
        { method: 'POST', body: { action }, auth: true },
      )
      setRequest((current) => current.key === requestKey
        ? { ...current, data: { ...current.data, listings: current.data.listings.map((item) => item.id === listing.id ? updatedListing : item) } }
        : current)
      setActionMessages((current) => ({ ...current, [listing.id]: 'Availability updated.' }))
    } catch (actionError) {
      setActionErrors((current) => ({ ...current, [listing.id]: actionError.message || 'Availability could not be updated. Please try again.' }))
    } finally {
      setPendingId(null)
    }
  }

  const handleViewingRequestAction = async (viewingRequest, action) => {
    setPendingRequest({ id: viewingRequest.id, action })
    setRequestMessages((current) => ({ ...current, [viewingRequest.id]: '' }))
    try {
      const updated = await apiRequest(`/viewing-requests/${encodeURIComponent(viewingRequest.id)}/${action}/`, {
        method: 'POST', body: {}, auth: true,
      })
      setRequest((current) => current.key === requestKey
        ? { ...current, data: { ...current.data, viewingRequests: current.data.viewingRequests.map((item) => item.id === updated.id ? updated : item) } }
        : current)
      setRequestMessages((current) => ({ ...current, [viewingRequest.id]: `Request ${String(updated.status || 'updated').toLowerCase()}.` }))
    } catch (requestError) {
      setRequestMessages((current) => ({ ...current, [viewingRequest.id]: requestError.message || 'The request could not be updated. Please try again.' }))
    } finally {
      setPendingRequest(null)
    }
  }

  return (
    <section className="owner-dashboard owner-dashboard--overview" aria-labelledby="owner-dashboard-title">
      <header className="owner-page-heading owner-overview-heading">
        <div>
          <h1 id="owner-dashboard-title">Welcome back, {user?.full_name?.split(' ')[0] || 'there'}.</h1>
          <p>Manage your listings, messages and viewing requests.</p>
        </div>
      </header>

      <div className="owner-dashboard__summary owner-overview-stats" aria-live="polite">
        <div><strong>{loading ? '…' : publishedCount}</strong><span>Published</span><small>Visible in public search</small></div>
        <div><strong>{loading ? '…' : hiddenCount}</strong><span>Draft or unpublished</span><small>Hidden from public search</small></div>
        <div><strong>{loading ? '…' : confirmationListings.length}</strong><span>Need reconfirmation</span><small>Availability older than 7 days</small></div>
        <div><strong>{loading ? '…' : pendingRequests.length}</strong><span>Pending requests</span><small>Waiting for your reply</small></div>
      </div>

      <PlatformFeedbackLink to="/owner/feedback" />

      <OwnerModerationFeedback preview previewLinkLabel="Read the feedback" />

      {!loading && !error && confirmationListings.length > 0 && (
        <section className="owner-overview-panel owner-overview-confirm" aria-labelledby="confirm-availability-title">
          <h2 id="confirm-availability-title">Confirm availability</h2>
          <p>Visitors see these as “Needs reconfirmation” until you confirm.</p>
          {confirmationListings.slice(0, 3).map((listing) => (
            <div className="owner-overview-confirm__row" key={listing.id}>
              <div>
                <h3>{listing.title || `Listing ${listing.id}`}</h3>
                <p>Confirmed {dateLabel(listing.availability_confirmed_at)}</p>
                {(actionErrors[listing.id] || actionMessages[listing.id]) && <p className={actionErrors[listing.id] ? 'owner-overview-message owner-overview-message--error' : 'owner-overview-message'} role={actionErrors[listing.id] ? 'alert' : 'status'}>{actionErrors[listing.id] || actionMessages[listing.id]}</p>}
              </div>
              <div className="owner-overview-confirm__actions">
                {(listing.availability_actions || []).includes('STILL_AVAILABLE') && <button className="button button--primary" disabled={pendingId === listing.id} onClick={() => handleAvailabilityAction(listing, 'STILL_AVAILABLE')} type="button">{pendingId === listing.id ? 'Confirming…' : 'Confirm today'}</button>}
                {(listing.availability_actions || []).includes('NOT_AVAILABLE') && <button className="button button--quiet" disabled={pendingId === listing.id} onClick={() => handleAvailabilityAction(listing, 'NOT_AVAILABLE')} type="button">Not available</button>}
              </div>
            </div>
          ))}
        </section>
      )}

      {loading && <div className="state-panel" role="status">Loading your dashboard…</div>}
      {!loading && error && (
        <div className="state-panel state-panel--error" role="alert">
          <h2>Your dashboard couldn’t be loaded</h2>
          <p>{error.message || 'Please check your connection and try again.'}</p>
          <button className="button button--primary" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button>
        </div>
      )}
      {!loading && !error && (
        <div className="owner-overview-columns">
          <section className="owner-overview-panel owner-overview-recent" aria-labelledby="recent-listings-title">
            <header className="owner-overview-panel__heading"><h2 id="recent-listings-title">Recent listings</h2><Link to="/owner/listings">View all</Link></header>
            {recentListings.length ? <div className="owner-overview-list">{recentListings.map((listing) => <ListingRow key={listing.id} listing={listing} />)}</div> : <p className="owner-overview-empty">You have no listings yet. Add a listing to begin managing your properties.</p>}
            <Link className="button button--primary owner-overview-add" to="/owner/listings/new">+ Add listing</Link>
          </section>

          <section className="owner-overview-panel owner-overview-requests" aria-labelledby="pending-requests-title">
            <header className="owner-overview-panel__heading"><h2 id="pending-requests-title">Pending viewing requests</h2><Link to="/owner/viewing-requests">All requests</Link></header>
            {pendingRequests.length ? <div className="owner-overview-request-list">{pendingRequests.slice(0, 5).map((item) => {
              const busy = pendingRequest?.id === item.id ? pendingRequest.action : ''
              return (
                <article className="owner-overview-request" key={item.id}>
                  <div className="owner-overview-request__body">
                    <h3>{item.listing?.title || `Listing ${item.listing?.id ?? ''}`}</h3>
                    <p>{item.seeker?.full_name || 'Home Seeker'} · Preferred {dateLabel(item.preferred_at, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                    {requestMessages[item.id] && <p className="owner-overview-message" role="status">{requestMessages[item.id]}</p>}
                  </div>
                  <div className="owner-overview-request__actions">
                    <button className="button button--primary" disabled={Boolean(busy)} onClick={() => handleViewingRequestAction(item, 'accept')} type="button">{busy === 'accept' ? 'Accepting…' : 'Accept'}</button>
                    <button className="button button--quiet" disabled={Boolean(busy)} onClick={() => handleViewingRequestAction(item, 'reject')} type="button">{busy === 'reject' ? 'Rejecting…' : 'Reject'}</button>
                  </div>
                </article>
              )
            })}</div> : <p className="owner-overview-empty">No pending viewing requests.</p>}
          </section>
        </div>
      )}
    </section>
  )
}
