import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiRequest } from '../api.js'
import PropertyImage from '../components/PropertyImage.jsx'
import './OwnerPages.css'

const LIFECYCLE_FILTERS = [
  { value: '', label: 'All listing statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'UNPUBLISHED', label: 'Unpublished' },
  { value: 'REMOVED', label: 'Removed' },
]

const LIFECYCLE_LABELS = Object.fromEntries(
  LIFECYCLE_FILTERS.filter(({ value }) => value).map(({ value, label }) => [value, label]),
)

const AVAILABILITY_LABELS = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  NEEDS_RECONFIRMATION: 'Needs your confirmation',
}

const CONFIRMATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const FILTER_ICONS = {
  '': 'grid',
  DRAFT: 'file',
  PUBLISHED: 'check',
  UNPUBLISHED: 'eye-off',
  REMOVED: 'trash',
}

function rentLabel(value) {
  return value == null ? 'Rent not provided' : `BDT ${Number(value).toLocaleString('en-BD')} / month`
}

function dateLabel(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function publishRequirements(listing) {
  const requirements = []
  if (!listing.location?.trim()) requirements.push('Add a location.')
  if (!listing.property_type?.trim()) requirements.push('Choose a property type.')
  if (!(Number(listing.monthly_rent) > 0)) requirements.push('Enter a rent above BDT 0.')
  if (listing.bedrooms == null || Number(listing.bedrooms) < 0) requirements.push('Add the number of bedrooms.')
  if (listing.bathrooms == null || Number(listing.bathrooms) < 0) requirements.push('Add the number of bathrooms.')
  if (!Array.isArray(listing.images) || listing.images.length === 0) {
    requirements.push('Add at least one valid photo. Photo upload is not available on this page yet.')
  }

  const confirmedAt = listing.availability_confirmed_at
    ? Date.parse(listing.availability_confirmed_at)
    : Number.NaN
  const confirmationIsFresh = Number.isFinite(confirmedAt)
    && Date.now() - confirmedAt < CONFIRMATION_WINDOW_MS
    && listing.availability_status !== 'NEEDS_RECONFIRMATION'
  if (!confirmationIsFresh) requirements.push('Confirm whether the home is still available using the buttons above.')
  if (listing.has_active_moderation_hold) {
    requirements.push('This listing is under review and can’t be published until the review restriction is lifted.')
  }
  return requirements
}

function actionErrorMessage(error) {
  if (error.code === 'availability_confirmation_required') {
    return 'Confirm whether the home is still available before publishing.'
  }
  if (error.code === 'moderation_hold_active') {
    return 'This listing is under review and can’t be published until the review restriction is lifted.'
  }
  if (error.code === 'listing_removed') {
    return 'This listing has been removed and can no longer be changed.'
  }
  if (error.code === 'invalid_status_transition') {
    return 'This action is no longer available for the listing. Refresh the page and try again.'
  }
  if (error.fields?.images) {
    return 'Add at least one valid photo before publishing. Photo upload is not available on this page yet.'
  }
  if (error.fields?.location || error.fields?.property_type) {
    return 'Add a location and choose a property type before publishing.'
  }
  return error.message || 'The change could not be saved. Please try again.'
}

function ListingIcon({ name }) {
  const paths = {
    grid: <><rect height="7" rx="1" width="7" x="3" y="3"/><rect height="7" rx="1" width="7" x="14" y="3"/><rect height="7" rx="1" width="7" x="3" y="14"/><rect height="7" rx="1" width="7" x="14" y="14"/></>,
    file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6m-6 4h6"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    'eye-off': <><path d="M3 3 21 21M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-3.1 3.7M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7a10 10 0 0 0 3.1-.5"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m3 4v6m6-6v6"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    bed: <><path d="M3 19V7m18 12v-6a2 2 0 0 0-2-2H7a4 4 0 0 0-4 4m0-2h18M7 11V8a2 2 0 0 1 2-2h3v5"/></>,
    bath: <><path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM7 12V6a3 3 0 0 1 6 0v1m-8 5h14M8 20v2m8-2v2"/></>,
  }

  return <svg aria-hidden="true" className="owner-listings-icon" viewBox="0 0 24 24">{paths[name]}</svg>
}

export default function OwnerListingsPage() {
  const location = useLocation()
  const [lifecycleStatus, setLifecycleStatus] = useState('')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [request, setRequest] = useState({ key: '', data: null, error: null })
  const [pendingAction, setPendingAction] = useState(null)
  const [actionErrors, setActionErrors] = useState({})
  const [successNotice, setSuccessNotice] = useState(location.state?.notice || '')
  const [confirmRemoveId, setConfirmRemoveId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState('newest')
  const [availabilityFilter, setAvailabilityFilter] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const requestKey = `${lifecycleStatus}:${page}:${retry}`

  useEffect(() => {
    let active = true
    const query = new URLSearchParams({ page: String(page) })
    if (lifecycleStatus) query.set('lifecycle_status', lifecycleStatus)

    apiRequest(`/owner/listings/?${query.toString()}`, { auth: true })
      .then((data) => {
        if (active) setRequest({ key: requestKey, data, error: null })
      })
      .catch((error) => {
        if (active) setRequest({ key: requestKey, data: null, error })
      })

    return () => { active = false }
  }, [lifecycleStatus, page, requestKey])

  const loading = request.key !== requestKey
  const data = loading ? null : request.data
  const error = loading ? null : request.error
  const listings = data?.results || []
  const listingsNeedingConfirmation = listings.filter((listing) => (
    listing.lifecycle_status === 'PUBLISHED' && listing.availability_notice
  ))
  const visibleListings = listings
    .filter((listing) => `${listing.title || ''} ${listing.location || ''} ${listing.property_type || ''}`.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    .filter((listing) => !availabilityFilter || listing.availability_status === availabilityFilter)
    .slice()
    .sort((left, right) => {
      if (sortOrder === 'rent-low') return Number(left.monthly_rent) - Number(right.monthly_rent)
      if (sortOrder === 'rent-high') return Number(right.monthly_rent) - Number(left.monthly_rent)
      return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
    })

  const runAction = async (listing, action) => {
    setPendingAction({ id: listing.id, action })
    setActionErrors((current) => ({ ...current, [listing.id]: '' }))
    setSuccessNotice('')

    const endpoints = {
      PUBLISH: `/owner/listings/${listing.id}/publish/`,
      UNPUBLISH: `/owner/listings/${listing.id}/unpublish/`,
      REMOVE: `/owner/listings/${listing.id}/remove/`,
      STILL_AVAILABLE: `/owner/listings/${listing.id}/availability/`,
      NOT_AVAILABLE: `/owner/listings/${listing.id}/availability/`,
    }
    const options = { method: 'POST', auth: true }
    if (action === 'STILL_AVAILABLE' || action === 'NOT_AVAILABLE') options.body = { action }

    try {
      const updatedListing = await apiRequest(endpoints[action], options)
      if (action === 'PUBLISH' || action === 'UNPUBLISH' || action === 'REMOVE') {
        const leavesFilteredList = lifecycleStatus
          && listing.lifecycle_status === lifecycleStatus
          && updatedListing.lifecycle_status !== lifecycleStatus
        const updatedCount = Math.max(0, (data?.count ?? 0) - (leavesFilteredList ? 1 : 0))
        const lastPage = Math.max(1, Math.ceil(updatedCount / 20))
        if (page > lastPage) setPage(lastPage)
        else setRetry((value) => value + 1)
      } else {
        setRequest((current) => current.key === requestKey && current.data
          ? {
            ...current,
            data: {
              ...current.data,
              results: current.data.results.map((item) => item.id === listing.id ? updatedListing : item),
            },
          }
          : current)
      }

      const messages = {
        PUBLISH: 'Your listing is now visible in public search.',
        UNPUBLISH: 'Your listing is now hidden from public search.',
        REMOVE: 'Your listing has been removed. Existing conversations and viewing requests remain available to their participants.',
        STILL_AVAILABLE: 'Thanks. Your listing is marked as available.',
        NOT_AVAILABLE: 'Your listing is marked as not available.',
      }
      setSuccessNotice(messages[action])
      setConfirmRemoveId(null)
    } catch (error) {
      setActionErrors((current) => ({ ...current, [listing.id]: actionErrorMessage(error) }))
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <section className="owner-dashboard owner-listings-page" aria-labelledby="owner-listings-title">
      <header className="owner-listings-hero">
        <div className="owner-listings-hero__copy">
          <span className="owner-listings-header-icon" aria-hidden="true"><ListingIcon name="grid" /></span>
          <h1 id="owner-listings-title">My Listings</h1>
          <span className="owner-listings-eyebrow">Property Owner</span>
          <span className="owner-listings-hero__divider" aria-hidden="true" />
          <p>View and manage your listed properties all in one place.</p>
        </div>
        <Link className="owner-listings-add" to="/owner/listings/new"><span aria-hidden="true">+</span> Add Listing</Link>
      </header>

      {successNotice && (
        <p className="owner-feedback" role="status">{successNotice}</p>
      )}

      {!loading && !error && listingsNeedingConfirmation.length > 0 && (
        <div className="owner-listings-confirmation-alert">
          <p role="status">
            <strong>{listingsNeedingConfirmation.length} published {listingsNeedingConfirmation.length === 1 ? 'listing needs' : 'listings need'} availability reconfirmation.</strong>
            {' '}Visitors see Needs reconfirmation until you confirm.
          </p>
          <button
            className="owner-listings-confirmation-alert__button"
            onClick={() => {
              setLifecycleStatus('PUBLISHED')
              setAvailabilityFilter('NEEDS_RECONFIRMATION')
              setPage(1)
            }}
            type="button"
          >Show them</button>
        </div>
      )}

      <div className="owner-listings-controls">
        <div className="owner-listings-status-tabs" aria-label="Filter listings by status">
          {LIFECYCLE_FILTERS.map(({ value }) => (
            <button
              aria-pressed={lifecycleStatus === value}
              className={`owner-listings-status-tab${lifecycleStatus === value ? ' is-active' : ''}`}
              key={value || 'all'}
              onClick={() => { setLifecycleStatus(value); setPage(1) }}
              type="button"
            >
              <ListingIcon name={FILTER_ICONS[value]} />
              <span>{value ? LIFECYCLE_LABELS[value] : 'All Listings'}</span>
              {!loading && !error && lifecycleStatus === value && <span className="owner-listings-status-count">{data?.count ?? 0}</span>}
            </button>
          ))}
        </div>
        <div className="owner-listings-tools">
          <label className="owner-listings-search" htmlFor="owner-listings-search">
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
            <input id="owner-listings-search" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search your listings by title or location" type="search" value={searchTerm} />
          </label>
          <label className="owner-listings-availability-filter" htmlFor="owner-listings-availability">
            <span className="visually-hidden">Filter by availability</span>
            <select id="owner-listings-availability" onChange={(event) => setAvailabilityFilter(event.target.value)} value={availabilityFilter}>
              <option value="">Any availability</option>
              <option value="AVAILABLE">Available</option>
              <option value="UNAVAILABLE">Unavailable</option>
              <option value="NEEDS_RECONFIRMATION">Needs reconfirmation</option>
            </select>
          </label>
          <label className="owner-listings-sort" htmlFor="owner-listings-sort">
            <span className="visually-hidden">Sort listings</span>
            <select id="owner-listings-sort" onChange={(event) => setSortOrder(event.target.value)} value={sortOrder}>
              <option value="newest">Sort: Newest first</option>
              <option value="rent-low">Sort: Rent (low to high)</option>
              <option value="rent-high">Sort: Rent (high to low)</option>
            </select>
          </label>
          <div className="owner-listings-view-toggle" role="group" aria-label="Listing view">
            <button aria-label="Grid view" aria-pressed={viewMode === 'grid'} className={viewMode === 'grid' ? 'is-active' : ''} onClick={() => setViewMode('grid')} type="button"><ListingIcon name="grid" /></button>
            <button aria-label="List view" aria-pressed={viewMode === 'list'} className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')} type="button"><span aria-hidden="true" className="owner-listings-view-toggle__list-icon"><i /><i /><i /></span></button>
          </div>
        </div>
      </div>

      {!loading && !error && listings.length > 0 && (
        <p className="owner-listings-result-count" role="status" aria-live="polite">
          {visibleListings.length} {visibleListings.length === 1 ? 'listing' : 'listings'} shown on this page
        </p>
      )}

      {loading && <div className="state-panel" role="status">Loading your listings…</div>}
      {!loading && error && (
        <div className="state-panel state-panel--error" role="alert">
          <h2>Your listings couldn’t be loaded</h2>
          <p>{error.message || 'Please check your connection and try again.'}</p>
          <button className="button button--primary" onClick={() => setRetry((value) => value + 1)} type="button">
            Try again
          </button>
        </div>
      )}
      {!loading && !error && listings.length === 0 && (
        <div className="state-panel owner-empty-state">
          <h2>{data?.count ? 'No listings on this page' : 'No listings found'}</h2>
          <p>{lifecycleStatus ? 'Try another lifecycle status or clear the filter.' : 'Add a listing to begin managing your properties.'}</p>
          {lifecycleStatus ? (
            <button className="button button--quiet" onClick={() => setLifecycleStatus('')} type="button">
              Clear filter
            </button>
          ) : (
            <Link className="button button--primary" to="/owner/listings/new">Add Listing</Link>
          )}
          {data?.count > 0 && page > 1 && (
            <button className="button button--quiet" onClick={() => setPage((value) => value - 1)} type="button">
              Previous page
            </button>
          )}
        </div>
      )}
      {!loading && !error && listings.length > 0 && (
        <div className={`owner-listing-list owner-listing-list--redesigned${viewMode === 'grid' ? ' is-grid' : ''}`}>
          {visibleListings.map((listing) => (
            <article className={`owner-listing-card owner-listing-card--redesigned${listing.lifecycle_status === 'REMOVED' ? ' is-removed' : ''}`} key={listing.id}>
              <div className="owner-listing-card__media">
                <PropertyImage
                  alt={listing.title || `Listing in ${listing.location || 'Dhaka'}`}
                  authenticated
                  className="owner-listing-card__image"
                  fallbackClassName="owner-listing-card__image-fallback"
                  fallbackLabel="No photo yet"
                  src={listing.images?.[0]?.url}
                />
                {!listing.images?.[0]?.url && <span className="owner-listing-card__no-photo-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 3 3 3-4 5 6" /></svg></span>}
                {listing.images?.length > 1 && (
                  <div className="owner-listing-card__thumbnails" aria-label={`${listing.images.length} listing photos`}>
                    {listing.images.slice(1, 4).map((image) => (
                      <PropertyImage key={image.id || image.url} alt="" authenticated className="owner-listing-card__thumbnail" fallbackClassName="owner-listing-card__thumbnail-fallback" fallbackLabel="" src={image.url} />
                    ))}
                  </div>
                )}
                {listing.images?.length > 0 && <span className="owner-listing-card__photo-count">{listing.images.length} {listing.images.length === 1 ? 'photo' : 'photos'}</span>}
                <span className={`owner-status owner-status--lifecycle owner-status--${String(listing.lifecycle_status || '').toLowerCase()}`}>
                  <ListingIcon name={FILTER_ICONS[listing.lifecycle_status] || 'file'} />
                  {LIFECYCLE_LABELS[listing.lifecycle_status] || 'Lifecycle unknown'}
                </span>
                {listing.has_active_moderation_hold && (
                  <span className="owner-listing-card__moderation-badge">Moderator hold</span>
                )}
              </div>
              <div className="owner-listing-card__body">
                <div className="owner-listing-card__heading">
                  <h2>{listing.title || `Listing ${listing.id}`}</h2>
                  <p className="owner-listing-card__location"><ListingIcon name="pin" />{listing.location || 'Location not provided'}</p>
                </div>
                <div className="owner-listing-card__details">
                  <strong>{rentLabel(listing.monthly_rent)}</strong>
                  <span><ListingIcon name="bed" />{listing.bedrooms} {Number(listing.bedrooms) === 1 ? 'Bed' : 'Beds'}</span>
                  <span><ListingIcon name="bath" />{listing.bathrooms} {Number(listing.bathrooms) === 1 ? 'Bath' : 'Baths'}</span>
                  {listing.property_type && <span>{listing.property_type}</span>}
                </div>
                {(listing.lifecycle_status === 'DRAFT' || listing.lifecycle_status === 'UNPUBLISHED') && publishRequirements(listing).length > 0 && (
                  <p className="owner-listing-card__publish-hint">{publishRequirements(listing).join(' ')}</p>
                )}
                {listing.has_active_moderation_hold && (
                  <p className="owner-listing-card__moderation-note">
                    A moderator unpublished this listing. You can publish it again once the hold is released.{' '}
                    <Link to="/owner/moderation-feedback">Read feedback</Link>
                  </p>
                )}
                {dateLabel(listing.updated_at) && (
                  <p className="owner-listing-card__updated">Last updated {dateLabel(listing.updated_at)}</p>
                )}
              </div>
              <div className="owner-listing-card__availability">
                <div className="owner-listing-card__availability-heading">
                  <span className="owner-listing-card__availability-label">Availability</span>
                  <span className={`owner-status owner-status--availability owner-status--${String(listing.availability_status || '').toLowerCase()}`}>
                    <span className="owner-listing-card__availability-dot" aria-hidden="true" />
                    {AVAILABILITY_LABELS[listing.availability_status] || 'Not confirmed'}
                  </span>
                </div>
                {listing.lifecycle_status !== 'REMOVED' && (
                  <div className="owner-listing-card__availability-actions" role="group" aria-label="Update availability">
                    <button
                      aria-pressed={listing.availability_status === 'AVAILABLE'}
                      className="owner-listing-action owner-listing-action--availability"
                      disabled={pendingAction?.id === listing.id}
                      onClick={() => runAction(listing, 'STILL_AVAILABLE')}
                      type="button"
                    >{pendingAction?.id === listing.id && pendingAction.action === 'STILL_AVAILABLE' ? 'Saving...' : 'Still Available'}</button>
                    <button
                      aria-pressed={listing.availability_status === 'UNAVAILABLE'}
                      className="owner-listing-action owner-listing-action--availability"
                      disabled={pendingAction?.id === listing.id}
                      onClick={() => runAction(listing, 'NOT_AVAILABLE')}
                      type="button"
                    >{pendingAction?.id === listing.id && pendingAction.action === 'NOT_AVAILABLE' ? 'Saving...' : 'Not Available'}</button>
                  </div>
                )}
                <p className="owner-listing-card__confirmation-date">
                  {dateLabel(listing.availability_confirmed_at)
                    ? `Confirmed ${dateLabel(listing.availability_confirmed_at)}`
                    : 'Never confirmed'}
                </p>
                {listing.availability_notice && (
                  <p className="owner-reminder" role="status">
                    {listing.reminder_day === 5
                      ? 'Please confirm that this home is still available.'
                      : 'Please update whether this home is still available.'}
                  </p>
                )}
              </div>
              <div className="owner-listing-card__actions-redesigned">
                {listing.lifecycle_status === 'REMOVED' && <p className="owner-listing-card__read-only"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg> Removed listings are read-only</p>}
                {listing.lifecycle_status !== 'REMOVED' && (
                  <Link className="owner-listing-action owner-listing-action--edit" to={`/owner/listings/${listing.id}/edit`}><span aria-hidden="true">✎</span> Edit</Link>
                )}
                {listing.lifecycle_status === 'PUBLISHED' && (
                  <button className="owner-listing-action" disabled={pendingAction?.id === listing.id} onClick={() => runAction(listing, 'UNPUBLISH')} type="button">
                    {pendingAction?.id === listing.id && pendingAction.action === 'UNPUBLISH' ? 'Hiding…' : 'Hide'}
                  </button>
                )}
                {(listing.lifecycle_status === 'DRAFT' || listing.lifecycle_status === 'UNPUBLISHED') && (() => {
                  const requirements = publishRequirements(listing)
                  return (
                    <div className={`owner-publish-action${listing.lifecycle_status === 'DRAFT' ? ' owner-publish-action--draft' : ''}`}>
                      <button className={`owner-listing-action owner-listing-action--publish${listing.lifecycle_status === 'DRAFT' ? ' owner-listing-action--draft-publish' : ''}`} disabled={requirements.length > 0 || pendingAction?.id === listing.id} onClick={() => runAction(listing, 'PUBLISH')} type="button">
                        {pendingAction?.id === listing.id && pendingAction.action === 'PUBLISH' ? 'Publishing…' : 'Publish'}
                      </button>
                      {requirements.length > 0 && <p className="owner-action-hint">Before publishing: {requirements.join(' ')}</p>}
                    </div>
                  )
                })()}
                {listing.lifecycle_status !== 'REMOVED' && (
                  <button className="owner-listing-action owner-listing-action--remove" disabled={pendingAction?.id === listing.id} onClick={() => setConfirmRemoveId(listing.id)} type="button">
                    <ListingIcon name="trash" /> Remove
                  </button>
                )}
              </div>
              {confirmRemoveId === listing.id && (
                <div className="owner-remove-confirmation" role="group" aria-label="Confirm listing removal">
                  <p>Remove this listing from public search? Existing conversations and viewing requests will remain available to their participants.</p>
                  <button className="button button--quiet" onClick={() => setConfirmRemoveId(null)} type="button">Keep listing</button>
                  <button className="button button--danger" disabled={pendingAction?.id === listing.id} onClick={() => runAction(listing, 'REMOVE')} type="button">
                    {pendingAction?.id === listing.id && pendingAction.action === 'REMOVE' ? 'Removing…' : 'Confirm removal'}
                  </button>
                </div>
              )}

              {actionErrors[listing.id] && (
                <p className="owner-action-message owner-action-message--error" role="alert">{actionErrors[listing.id]}</p>
              )}
            </article>
          ))}
        </div>
      )}

      {!loading && !error && listings.length > 0 && visibleListings.length === 0 && (
        <div className="state-panel owner-empty-state"><h2>No listings match</h2><p>Try a different search or availability filter.</p><button className="button button--quiet" onClick={() => { setSearchTerm(''); setAvailabilityFilter('') }} type="button">Clear filters</button></div>
      )}

      {!loading && !error && listings.length > 0 && (data?.previous || data?.next) && (
        <nav className="owner-pagination" aria-label="Listing pages">
          <button className="button button--quiet" disabled={!data.previous} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">
            Previous
          </button>
          <span>Page {page}</span>
          <button className="button button--quiet" disabled={!data.next} onClick={() => setPage((value) => value + 1)} type="button">
            Next
          </button>
        </nav>
      )}
    </section>
  )
}
