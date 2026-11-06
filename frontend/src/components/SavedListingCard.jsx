import { Link } from 'react-router-dom'
import { getListingDisplayTitle } from '../utils/listingTitle.js'

const LIFECYCLE_LABELS = {
  PUBLISHED: 'Published',
  UNPUBLISHED: 'Unpublished',
  REMOVED: 'Removed',
}

function CardIcon({ name }) {
  const shapes = {
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/></>,
    bed: <><path d="M3 18V6m0 9h18v6M3 11h18v4M7 11V8h5a3 3 0 0 1 3 3"/></>,
    bath: <><path d="M4 12V6a2 2 0 0 1 4 0v2M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3ZM7 20v2m10-2v2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>,
  }
  return <svg aria-hidden="true" className={`saved-listing-icon saved-listing-icon--${name}`} viewBox="0 0 24 24">{shapes[name]}</svg>
}

export default function SavedListingCard({
  item,
  image,
  onRemove,
  removing = false,
  onToggleComparison,
  selectedForComparison = false,
}) {
  const listing = item.listing
  const displayTitle = getListingDisplayTitle(listing)
  const isPublished = listing.lifecycle_status === 'PUBLISHED'
  const lifecycleLabel = LIFECYCLE_LABELS[listing.lifecycle_status] || 'Listing unavailable'
  const unavailableMessage = listing.lifecycle_status === 'UNPUBLISHED'
    ? 'This home is not currently available in public listings.'
    : listing.lifecycle_status === 'REMOVED'
      ? 'This home has been removed from public listings.'
      : ''
  const availabilityStatus = listing.availability?.status
  const availabilityLabel = availabilityStatus === 'AVAILABLE'
    ? 'Available now'
    : availabilityStatus === 'UNAVAILABLE'
      ? 'Currently unavailable'
      : 'Availability not confirmed'

  return (
    <article className="saved-listing-card">
      <div className="saved-listing-card__media">
        {image}
        <span className={`saved-listing-card__status saved-listing-card__status--${String(listing.lifecycle_status || '').toLowerCase()}`}>
          {isPublished && <CardIcon name="check" />}{lifecycleLabel}
        </span>
        <span aria-label="Saved home" className="saved-listing-card__heart"><CardIcon name="heart" /></span>
      </div>

      <div className="saved-listing-card__body">
        <div className="saved-listing-card__heading">
          <p className="saved-listing-card__location"><CardIcon name="pin" />{listing.location || 'Location not provided'}</p>
          <h2>{displayTitle}</h2>
        </div>
        {unavailableMessage && <p className="saved-listing-card__notice">{unavailableMessage}</p>}

        <div className="saved-listing-card__facts">
          <strong>{listing.monthly_rent == null ? 'Rent not provided' : `BDT ${Number(listing.monthly_rent).toLocaleString('en-BD')}`} {listing.monthly_rent != null && <small>/ month</small>}</strong>
          <span className="saved-listing-card__fact-pill"><CardIcon name="home" />{listing.property_type || 'Property type not provided'}</span>
          <span className="saved-listing-card__fact-pill"><CardIcon name="bed" />{listing.bedrooms == null ? 'Bedrooms unknown' : `${listing.bedrooms} bedrooms`}</span>
          <span className="saved-listing-card__fact-pill"><CardIcon name="bath" />{listing.bathrooms == null ? 'Bathrooms unknown' : `${listing.bathrooms} bathrooms`}</span>
        </div>

        <div className="saved-listing-card__availability">
          <span className={`saved-listing-card__availability-pill saved-listing-card__availability-pill--${String(availabilityStatus || '').toLowerCase()}`}><i aria-hidden="true" />{availabilityLabel}</span>
        </div>

        <div className="saved-listing-card__actions">
          <div className="saved-listing-card__primary-actions">
            {isPublished && <Link className="saved-listing-card__details-link" to={`/listings/${listing.id}`}>View home details</Link>}
            <button aria-pressed={selectedForComparison} className={selectedForComparison ? 'saved-listing-card__compare is-selected' : 'saved-listing-card__compare'} onClick={onToggleComparison} type="button">
              {selectedForComparison ? 'Remove from comparison' : 'Select to compare'}
            </button>
          </div>
          <button className="saved-listing-card__remove" disabled={removing} onClick={() => onRemove(item)} type="button">
            <span aria-hidden="true">⌫</span>{removing ? 'Removing…' : 'Remove saved home'}
          </button>
        </div>
      </div>
    </article>
  )
}
