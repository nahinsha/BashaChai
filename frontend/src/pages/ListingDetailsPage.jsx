import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import PropertyImage from '../components/PropertyImage.jsx'
import UserAvatar from '../components/UserAvatar.jsx'
import ShortlistSaveButton from '../components/ShortlistSaveButton.jsx'
import MessageOwnerAction from '../components/MessageOwnerAction.jsx'
import RequestViewingAction from '../components/RequestViewingAction.jsx'
import ReportListingAction from '../components/ReportListingAction.jsx'
import { getListingDisplayTitle } from '../utils/listingTitle.js'
import './PublicPages.css'

const STATUS_LABELS = { AVAILABLE: 'Available', UNAVAILABLE: 'Unavailable', NEEDS_RECONFIRMATION: 'Needs reconfirmation' }

function dateLabel(value) {
  if (!value) return 'Not provided'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'Not provided' : new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(date)
}

function DetailState({ title, message, retry }) {
  return (
    <section className="detail-page detail-page--state" aria-labelledby="detail-state-title">
      <div className="detail-content-layout detail-content-layout--state">
        <div className="detail-state-card" role="alert">
          <h1 id="detail-state-title">{title}</h1>
          <p>{message}</p>
          {retry && <button className="button button--primary" onClick={retry} type="button">Try again</button>}
        </div>
        <aside className="detail-state-aside">
          <p>Explore other homes on BasaChai.</p>
          <Link className="button button--quiet" to="/listings">Back to listings</Link>
        </aside>
      </div>
    </section>
  )
}

function DetailLoadingState() {
  return (
    <section aria-busy="true" aria-label="Loading property details" className="detail-page detail-page--loading">
      <div aria-live="polite" className="visually-hidden" role="status">Loading listing details...</div>
      <div className="detail-content-layout">
        <div className="detail-main-stack">
          <div aria-hidden="true" className="detail-card detail-skeleton detail-skeleton--gallery" />
          <div aria-hidden="true" className="detail-card detail-skeleton detail-skeleton--about" />
          <div aria-hidden="true" className="detail-card detail-skeleton detail-skeleton--amenities" />
        </div>
        <aside className="detail-sidebar">
          <div aria-hidden="true" className="detail-card detail-skeleton detail-skeleton--summary" />
          <div aria-hidden="true" className="detail-card detail-skeleton detail-skeleton--dates" />
          <div aria-hidden="true" className="detail-card detail-skeleton detail-skeleton--owner" />
        </aside>
      </div>
    </section>
  )
}

export default function ListingDetailsPage() {
  const { listingId } = useParams()
  const [request, setRequest] = useState({ key: null, listing: null, error: null })
  const [retry, setRetry] = useState(0)
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const lightboxRef = useRef(null)
  const load = useCallback(() => apiRequest(`/listings/${encodeURIComponent(listingId)}/`), [listingId])
  const requestKey = `${listingId}:${retry}`

  useEffect(() => {
    let active = true
    load().then((data) => {
      if (!active) return
      setActiveGalleryIndex(0)
      setLightboxIndex(null)
      setRequest({ key: requestKey, listing: data, error: null })
    }).catch((requestError) => {
      if (active) setRequest({ key: requestKey, listing: null, error: requestError })
    })
    return () => { active = false }
  }, [listingId, load, requestKey])

  const images = request.key === requestKey
    ? [...(request.listing?.images || [])].sort((first, second) => (first.slot || 0) - (second.slot || 0)).slice(0, 5)
    : []
  const lightboxOpen = lightboxIndex != null && images.length > 0

  useEffect(() => {
    if (!lightboxOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement
    document.body.style.overflow = 'hidden'
    lightboxRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [lightboxOpen])

  useEffect(() => {
    if (!lightboxOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setLightboxIndex(null)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        const nextIndex = (lightboxIndex - 1 + images.length) % images.length
        setActiveGalleryIndex(nextIndex)
        setLightboxIndex(nextIndex)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        const nextIndex = (lightboxIndex + 1) % images.length
        setActiveGalleryIndex(nextIndex)
        setLightboxIndex(nextIndex)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, images.length, lightboxOpen])

  const loading = request.key !== requestKey
  const listing = loading ? null : request.listing
  const error = loading ? null : request.error
  if (loading) return <DetailLoadingState />
  if (error?.status === 404) return <DetailState title="This listing is unavailable" message="It may no longer be publicly available." />
  if (error) return <DetailState title="We couldn’t load this listing" message={error.message} retry={() => setRetry((value) => value + 1)} />
  if (!listing) return null

  const displayTitle = getListingDisplayTitle(listing)
  const activeImage = images[activeGalleryIndex]
  const lightboxImage = lightboxIndex == null ? null : images[lightboxIndex]
  const rentLabel = listing.monthly_rent == null ? 'Rent not provided' : `৳${Number(listing.monthly_rent).toLocaleString('en-BD')} / month`
  const selectGalleryImage = (index) => {
    setActiveGalleryIndex(index)
    setLightboxIndex(index)
  }

  return (
    <article className="detail-page">
      <Link className="text-link detail-back" to="/listings">← Back to listings</Link>
      <div className="detail-content-layout">
        <div className="detail-main-stack">
          <section aria-label="Property image gallery" className="detail-card detail-gallery-card">
            <div className="detail-gallery__stage">
              {activeImage ? (
                <button
                  aria-label={`Open property photo ${activeGalleryIndex + 1} of ${images.length}`}
                  className="detail-gallery__main-open"
                  onClick={() => setLightboxIndex(activeGalleryIndex)}
                  type="button"
                >
                  <PropertyImage
                    alt={`${displayTitle} photo ${activeGalleryIndex + 1}`}
                    className="detail-gallery__main-image"
                    fallbackClassName="detail-gallery__main-fallback"
                    src={activeImage.url}
                  />
                </button>
              ) : (
                <PropertyImage alt="" fallbackLabel="Image unavailable" fallbackClassName="detail-gallery__main-fallback" src={null} />
              )}
              {images.length > 0 && <span className="detail-gallery__counter" aria-live="polite">{activeGalleryIndex + 1} of {images.length}</span>}
            </div>
            {images.length > 1 && (
              <div aria-label="Property photo thumbnails" className="detail-gallery__thumbnails">
                {images.map((image, index) => (
                  <button
                    aria-current={index === activeGalleryIndex ? 'true' : undefined}
                    aria-label={`Open property photo ${index + 1}`}
                    className={index === activeGalleryIndex ? 'detail-gallery__thumbnail is-active' : 'detail-gallery__thumbnail'}
                    key={image.id ?? image.slot}
                    onClick={() => selectGalleryImage(index)}
                    type="button"
                  >
                    <PropertyImage alt="" className="detail-gallery__thumbnail-image" fallbackClassName="detail-gallery__thumbnail-fallback" src={image.url} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="detail-card detail-description" aria-labelledby="detail-about-title">
            <h2 id="detail-about-title">About this home</h2>
            <p>{listing.description?.trim() || 'Description not provided by the owner.'}</p>
          </section>

          <section className="detail-card detail-amenities" aria-labelledby="detail-amenities-title">
            <h2 id="detail-amenities-title">Amenities</h2>
            {listing.amenities?.length
              ? <ul className="amenity-list">{listing.amenities.map((amenity, index) => <li key={`${amenity}-${index}`}>{amenity}</li>)}</ul>
              : <p>No amenities listed.</p>}
          </section>
        </div>

        <aside aria-label="Property actions and owner information" className="detail-sidebar" role="complementary">
          <section className="detail-card detail-summary" aria-labelledby="detail-title">
            <p className="eyebrow">{listing.location || 'Area not provided'}</p>
            <h1 id="detail-title">{displayTitle}</h1>
            <div className="detail-summary__price-row">
              <p className="detail-price">{rentLabel}</p>
              <span className={`availability availability--${String(listing.availability?.status || '').toLowerCase()}`}>
                {STATUS_LABELS[listing.availability?.status] || 'Availability unknown'}
              </span>
            </div>
            <dl className="detail-facts">
              <div><dt>Type</dt><dd>{listing.property_type || 'Not provided'}</dd></div>
              <div><dt>Bedrooms</dt><dd>{listing.bedrooms == null ? 'Unknown' : listing.bedrooms}</dd></div>
              <div><dt>Bathrooms</dt><dd>{listing.bathrooms == null ? 'Unknown' : listing.bathrooms}</dd></div>
            </dl>
            <div className="detail-summary__actions" aria-label="Property actions">
              <MessageOwnerAction listing={listing} />
              <RequestViewingAction listing={listing} />
              <span className="detail-summary__save"><ShortlistSaveButton listingId={listing.id} /></span>
            </div>
          </section>

          <section className="detail-card detail-dates" aria-label="Listing dates">
            <dl>
              <div><dt>Availability last confirmed</dt><dd>{dateLabel(listing.availability?.last_confirmed_at)}</dd></div>
              <div><dt>Listing last updated</dt><dd>{dateLabel(listing.updated_at)}</dd></div>
            </dl>
          </section>

          {listing.owner?.full_name && (
            <section className="detail-card detail-owner" aria-label="Property owner">
              <UserAvatar size="small" user={listing.owner} />
              <div className="detail-owner__identity">
                <p className="eyebrow">Property owner</p>
                <p className="detail-owner__name">{listing.owner.full_name}</p>
                {listing.owner.id != null && <Link className="text-link" to={`/owners/${listing.owner.id}`}>View owner profile</Link>}
              </div>
            </section>
          )}

          <div className="detail-report">
            <ReportListingAction listingId={listing.id} ownerId={listing.owner?.id} />
          </div>
        </aside>
      </div>

      {lightboxImage && (
        <div
          aria-label="Property photo gallery"
          aria-modal="true"
          className="property-lightbox"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxIndex(null) }}
          ref={lightboxRef}
          role="dialog"
          tabIndex={-1}
        >
          <button aria-label="Close gallery" className="property-lightbox__close" onClick={() => setLightboxIndex(null)} type="button">×</button>
          <div className="property-lightbox__stage">
            <button
              aria-label="Previous image"
              className="property-lightbox__nav"
              disabled={images.length < 2}
              onClick={() => selectGalleryImage((lightboxIndex - 1 + images.length) % images.length)}
              type="button"
            >‹</button>
            <figure className="property-lightbox__figure">
              <PropertyImage
                alt={`${displayTitle} photo ${lightboxIndex + 1}`}
                className="property-lightbox__image"
                fallbackClassName="property-lightbox__fallback"
                src={lightboxImage.url}
              />
              <figcaption>{lightboxIndex + 1} of {images.length}</figcaption>
            </figure>
            <button
              aria-label="Next image"
              className="property-lightbox__nav"
              disabled={images.length < 2}
              onClick={() => selectGalleryImage((lightboxIndex + 1) % images.length)}
              type="button"
            >›</button>
          </div>
          {images.length > 1 && (
            <nav aria-label="Choose a property photo" className="property-lightbox__thumbnails">
              {images.map((image, index) => (
                <button
                  aria-current={index === lightboxIndex ? 'true' : undefined}
                  aria-label={`Show photo ${index + 1}`}
                  className={index === lightboxIndex ? 'property-lightbox__thumbnail is-active' : 'property-lightbox__thumbnail'}
                  key={image.id ?? image.slot}
                  onClick={() => selectGalleryImage(index)}
                  type="button"
                >
                  <PropertyImage alt="" className="property-lightbox__thumbnail-image" fallbackClassName="property-lightbox__thumbnail-fallback" src={image.url} />
                </button>
              ))}
            </nav>
          )}
        </div>
      )}
    </article>
  )
}
