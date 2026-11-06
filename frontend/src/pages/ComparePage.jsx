import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShortlistComparison } from '../api.js'
import { useComparison } from '../context/useComparison.js'
import PropertyImage from '../components/PropertyImage.jsx'
import { getListingDisplayTitle } from '../utils/listingTitle.js'
import './PublicPages.css'
import './ComparisonPages.css'

const LIFECYCLE_LABELS = {
  PUBLISHED: 'Published',
  UNPUBLISHED: 'Unpublished · not publicly available',
  REMOVED: 'Removed from public listings',
}

const AVAILABILITY_LABELS = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  NEEDS_RECONFIRMATION: 'Needs reconfirmation',
}

function statusPill(value, labels) {
  const label = labels[value]
  if (!label) return 'Unknown'
  return <span className={`comparison-status comparison-status--${String(value).toLowerCase()}`}>{label}</span>
}

function valueOrUnknown(value, formatter = (item) => item) {
  return value == null || value === '' ? 'Unknown' : formatter(value)
}

function formatDate(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString('en-BD')
}

function formatRent(value) {
  return valueOrUnknown(value, (amount) => `BDT ${Number(amount).toLocaleString('en-BD')} / month`)
}

function comparisonKey(label, listing) {
  const values = {
    'Listing status': listing.lifecycle_status,
    'Monthly rent': listing.monthly_rent,
    Location: listing.location,
    'Property type': listing.property_type,
    Bedrooms: listing.bedrooms,
    Bathrooms: listing.bathrooms,
    Amenities: JSON.stringify(listing.amenities || []),
    Availability: listing.availability?.status,
    'Last confirmed available': listing.availability?.last_confirmed_at,
    'Last updated': listing.updated_at,
  }
  return values[label] == null ? '' : String(values[label])
}

export default function ComparePage() {
  const { selectedListings, removeListing, clearSelection } = useComparison()
  const listingIds = useMemo(() => selectedListings.map((listing) => listing.id), [selectedListings])
  const requestKey = listingIds.join(',')
  const [retry, setRetry] = useState(0)
  const [highlightDifferences, setHighlightDifferences] = useState(false)
  const [request, setRequest] = useState({ key: '', data: null, error: null })

  useEffect(() => {
    if (!listingIds.length) return undefined
    let active = true
    const key = `${requestKey}:${retry}`
    getShortlistComparison(listingIds)
      .then((data) => { if (active) setRequest({ key, data, error: null }) })
      .catch((error) => { if (active) setRequest({ key, data: null, error }) })
    return () => { active = false }
  }, [listingIds, requestKey, retry])

  const requestKeyWithRetry = `${requestKey}:${retry}`
  const loading = Boolean(listingIds.length) && request.key !== requestKeyWithRetry
  const error = loading ? null : request.error
  const comparedListings = loading || error ? [] : (request.data?.results || []).map((item) => item.listing)
  const comparisonSlots = Array.from({ length: 3 }, (_, index) => comparedListings[index] || null)

  if (!selectedListings.length) {
    return (
      <section className="compare-page" aria-labelledby="compare-title">
        <p className="eyebrow">Side by side</p>
        <h1 id="compare-title">Compare homes</h1>
        <div className="state-panel comparison-state-panel">
          <h2>Select saved homes to compare</h2>
          <p>Choose one to three homes from your saved list. Unpublished and removed homes keep their comparison details here.</p>
          <Link className="button button--primary" to="/seeker/saved-listings">Go to saved homes</Link>
        </div>
      </section>
    )
  }

  const cells = [
    ['Listing status', (listing) => statusPill(listing.lifecycle_status, LIFECYCLE_LABELS)],
    ['Monthly rent', (listing) => formatRent(listing.monthly_rent)],
    ['Location', (listing) => valueOrUnknown(listing.location)],
    ['Property type', (listing) => valueOrUnknown(listing.property_type)],
    ['Bedrooms', (listing) => valueOrUnknown(listing.bedrooms)],
    ['Bathrooms', (listing) => valueOrUnknown(listing.bathrooms)],
    ['Amenities', (listing) => valueOrUnknown(listing.amenities?.length ? listing.amenities.join(', ') : null)],
    ['Availability', (listing) => statusPill(listing.availability?.status, AVAILABILITY_LABELS)],
    ['Last confirmed available', (listing) => formatDate(listing.availability?.last_confirmed_at)],
    ['Last updated', (listing) => formatDate(listing.updated_at)],
  ]

  return (
    <section className="compare-page" aria-labelledby="compare-title">
      <div className="compare-heading">
        <div>
          <p className="eyebrow">Side by side</p>
          <h1 id="compare-title">Compare homes</h1>
          <p>Review the details of homes saved to your list. {selectedListings.length} of 3 homes selected.</p>
        </div>
        <div className="compare-heading__actions">
          <button aria-checked={highlightDifferences} className="compare-difference-toggle" onClick={() => setHighlightDifferences((value) => !value)} role="switch" type="button">
            <span className="compare-difference-toggle__track"><i /></span> Highlight differences
          </button>
          <button className="compare-clear-button" onClick={clearSelection} type="button">Clear selection</button>
        </div>
      </div>

      {loading && <div className="state-panel comparison-state-panel" role="status"><span className="loading-dot" /> Loading comparison…</div>}
      {!loading && error && (
        <div className="state-panel state-panel--error comparison-state-panel" role="alert">
          <h2>Your comparison couldn’t be loaded</h2>
          <p>{error.message || 'Please check your connection and try again.'}</p>
          <button className="button button--primary" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button>
        </div>
      )}
      {!loading && !error && (
        <>
          <div className={`comparison-table-wrap${highlightDifferences ? ' is-highlighting-differences' : ''}`} role="region" aria-label="Home comparison" tabIndex="0">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th scope="col">Home details</th>
                  {comparisonSlots.map((listing, index) => {
                    if (!listing) return (
                      <th aria-label={`Empty home slot ${index + 1}`} className="compare-empty-slot" key={`empty-${index}`} scope="col">
                        <div className="compare-empty-prompt">
                          <span aria-hidden="true">＋</span>
                          <p>Select a home from Saved Homes</p>
                          <Link to="/seeker/saved-listings">Go to Saved Homes</Link>
                        </div>
                      </th>
                    )
                    const displayTitle = getListingDisplayTitle(listing)
                    return (
                      <th key={listing.id} scope="col">
                        <PropertyImage alt="" className="compare-home-image" fallbackClassName="compare-home-image-fallback" fallbackLabel="Photo coming soon" src={listing.images?.[0]?.url} />
                        <div className="compare-home-copy">
                          {listing.lifecycle_status === 'PUBLISHED'
                            ? <Link className="compare-home-title" to={`/listings/${listing.id}`}>{displayTitle}</Link>
                            : <span className="compare-home-title">{displayTitle}</span>}
                          <span className="compare-home-location">{valueOrUnknown(listing.location)}</span>
                          <button className="remove-link" onClick={() => removeListing(listing.id)} type="button">Remove from comparison</button>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {cells.map(([label, getValue]) => {
                  const differs = new Set(comparedListings.map((listing) => comparisonKey(label, listing))).size > 1
                  return (
                    <tr className={highlightDifferences && differs ? 'is-different' : ''} key={label}>
                      <th scope="row">{label}</th>
                      {comparisonSlots.map((listing, index) => (
                        <td className={listing ? undefined : 'compare-empty-slot'} key={listing?.id || `empty-${index}`}>
                          {listing ? getValue(listing) : null}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="compare-note">Missing details are shown as unknown. No home is ranked or recommended.</p>
        </>
      )}
    </section>
  )
}
