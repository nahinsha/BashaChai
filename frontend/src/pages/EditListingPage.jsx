import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { PROPERTY_TYPE_OPTIONS } from '../constants/listingOptions.js'
import ListingPhotosSection from '../components/ListingPhotosSection.jsx'
import PropertyImage from '../components/PropertyImage.jsx'
import { useListingPhotoSelection } from '../hooks/useListingPhotoSelection.js'
import './OwnerPages.css'
import './EditListingPage.css'

const SUGGESTED_FACILITIES = ['Wi-Fi', 'Parking', 'Lift', 'Security', 'Generator', 'Balcony', 'Gas', 'Water Supply']

function errorMessage(value) {
  if (Array.isArray(value)) return value.map(errorMessage).join(' ')
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return Object.values(value).map(errorMessage).join(' ')
  return ''
}

function editableValues(listing) {
  return {
    title: listing.title || '',
    location: listing.location || '',
    property_type: listing.property_type || '',
    monthly_rent: listing.monthly_rent ?? '',
    bedrooms: listing.bedrooms ?? '',
    bathrooms: listing.bathrooms ?? '',
    description: listing.description || '',
    amenities: Array.isArray(listing.amenities) ? listing.amenities.join('\n') : '',
  }
}

function dateLabel(value) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EditListingPage() {
  const { listingId } = useParams()
  const navigate = useNavigate()
  const [retry, setRetry] = useState(0)
  const [request, setRequest] = useState({ key: '', listing: null, error: null })
  const [form, setForm] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [photoNotice, setPhotoNotice] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [photoErrors, setPhotoErrors] = useState({})
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [removingImageId, setRemovingImageId] = useState(null)
  const [saving, setSaving] = useState(false)
  const images = request.listing?.images || []
  const {
    selectedPhotos,
    selectionMessages,
    selectFiles,
    removeSelectedPhoto,
    removeUploadedPhotos,
  } = useListingPhotoSelection(images.length)

  useEffect(() => {
    let active = true
    const key = `${listingId}:${retry}`
    apiRequest(`/owner/listings/${listingId}/`, { auth: true })
      .then((listing) => {
        if (!active) return
        setRequest({ key, listing, error: null })
        setForm(editableValues(listing))
      })
      .catch((error) => {
        if (active) setRequest({ key, listing: null, error })
      })
    return () => { active = false }
  }, [listingId, retry])

  const requestKey = `${listingId}:${retry}`
  const loading = request.key !== requestKey
  const listing = loading ? null : request.listing
  const loadError = loading ? null : request.error
  const dirty = Boolean(listing && form && (selectedPhotos.length > 0 || JSON.stringify(form) !== JSON.stringify(editableValues(listing))))
  const publishRequirements = [
    { label: 'Location', complete: Boolean(form?.location.trim()) },
    { label: 'Property type', complete: Boolean(form?.property_type) },
    { label: 'Monthly rent', complete: Number(form?.monthly_rent) > 0 },
    { label: 'Bedrooms', complete: form?.bedrooms !== '' && Number(form?.bedrooms) >= 0 },
    { label: 'Bathrooms', complete: form?.bathrooms !== '' && Number(form?.bathrooms) >= 0 },
    { label: 'At least 1 photo', complete: images.length > 0 },
  ]
  const completedRequirements = publishRequirements.filter(({ complete }) => complete).length

  const setValue = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setFormError('')
  }

  const adjustNumber = (field, amount) => {
    const next = Math.max(0, (Number(form[field]) || 0) + amount)
    setForm((current) => ({ ...current, [field]: String(next) }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setFormError('')
  }

  const toggleFacility = (facility) => {
    const current = form.amenities.split('\n').map((item) => item.trim()).filter(Boolean)
    const next = current.includes(facility) ? current.filter((item) => item !== facility) : [...current, facility]
    setForm((value) => ({ ...value, amenities: next.join('\n') }))
    setFormError('')
  }

  const removePendingPhoto = (id) => {
    removeSelectedPhoto(id)
    setPhotoErrors((current) => ({ ...current, [id]: undefined }))
  }

  const uploadSelectedPhotos = async () => {
    if (!listing || selectedPhotos.length === 0) return
    setUploadingPhotos(true)
    setPhotoError('')
    setPhotoNotice('')
    const uploadedIds = []
    const uploadedImages = []
    const failures = {}

    for (const photo of selectedPhotos) {
      const body = new FormData()
      body.append('image', photo.file)
      try {
        const uploadedImage = await apiRequest(`/owner/listings/${listingId}/images/`, {
          method: 'POST',
          body,
          auth: true,
        })
        uploadedIds.push(photo.id)
        uploadedImages.push(uploadedImage)
      } catch (error) {
        failures[photo.id] = error.fields?.image
          ? errorMessage(error.fields.image)
          : error.code === 'listing_removed'
            ? 'This listing has been removed and can no longer be changed.'
            : error.message || 'This photo could not be uploaded. Please try again.'
      }
    }

    if (uploadedIds.length) {
      removeUploadedPhotos(uploadedIds)
      setRequest((current) => current.listing
        ? {
          ...current,
          listing: {
            ...current.listing,
            images: [...current.listing.images, ...uploadedImages].sort((a, b) => a.slot - b.slot),
          },
        }
        : current)
      setPhotoNotice(`${uploadedIds.length} photo${uploadedIds.length === 1 ? '' : 's'} uploaded.`)
    }
    setPhotoErrors(failures)
    setUploadingPhotos(false)
  }

  const removeSavedPhoto = async (image) => {
    if (!listing) return
    setRemovingImageId(image.id)
    setPhotoError('')
    setPhotoNotice('')
    try {
      await apiRequest(`/owner/listings/${listingId}/images/${image.id}/`, {
        method: 'DELETE',
        auth: true,
      })
      setRequest((current) => current.listing
        ? {
          ...current,
          listing: {
            ...current.listing,
            images: current.listing.images.filter((item) => item.id !== image.id),
          },
        }
        : current)
      setPhotoNotice('Photo removed.')
    } catch (error) {
      setPhotoError(error.code === 'last_image_required'
        ? 'A Published listing must keep at least one photo. Add another photo before removing this one.'
        : error.code === 'listing_removed'
          ? 'This listing has been removed and its photos can no longer be changed.'
          : error.message || 'This photo could not be removed. Please try again.')
    } finally {
      setRemovingImageId(null)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!listing || listing.lifecycle_status === 'REMOVED') return

    setFieldErrors({})
    setFormError('')
    setSaving(true)
    const amenities = form.amenities.split('\n').map((item) => item.trim()).filter(Boolean)
    const payload = {
      title: form.title.trim() || null,
      location: form.location.trim() || null,
      property_type: form.property_type || null,
      monthly_rent: form.monthly_rent,
      bedrooms: Number(form.bedrooms),
      bathrooms: Number(form.bathrooms),
      description: form.description,
      amenities,
    }

    try {
      await apiRequest(`/owner/listings/${listingId}/`, {
        method: 'PATCH',
        body: payload,
        auth: true,
      })
      navigate('/owner/listings', {
        replace: true,
        state: { notice: 'Your listing details have been saved.' },
      })
    } catch (error) {
      setFieldErrors(Object.fromEntries(
        Object.entries(error.fields || {}).map(([field, value]) => [field, errorMessage(value)]),
      ))
      setFormError(error.code === 'listing_removed'
        ? 'This listing has been removed and can no longer be changed.'
        : error.message || 'Your changes could not be saved. Please review the fields and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="owner-dashboard edit-listing-page" aria-labelledby="edit-listing-title">
      <header className="owner-page-heading edit-listing-page__heading">
        <div>
          <p className="eyebrow">Property Owner</p>
          <h1 id="edit-listing-title">Edit Listing</h1>
          <p>Update the details people see about your property.</p>
        </div>
        <Link className="button button--quiet" to="/owner/listings">Back to My Listings</Link>
      </header>

      {loading && <div className="state-panel" role="status">Loading listing…</div>}
      {!loading && loadError && (
        <div className="state-panel state-panel--error" role="alert">
          <h2>This listing couldn’t be loaded</h2>
          <p>{loadError.message || 'Please check your connection and try again.'}</p>
          <button className="button button--primary" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button>
        </div>
      )}
      {!loading && listing?.lifecycle_status === 'REMOVED' && (
        <div className="state-panel" role="status">
          <h2>This listing has been removed</h2>
          <p>Removed listings can’t be changed. Existing conversations and viewing requests remain available to their participants.</p>
          <Link className="button button--primary" to="/owner/listings">Return to My Listings</Link>
        </div>
      )}
      {!loading && !loadError && listing && form && listing.lifecycle_status !== 'REMOVED' && (
                <div className="edit-listing-layout">
          <div className="owner-form-card edit-listing-main">
            {formError && <p className="owner-form-error" role="alert">{formError}</p>}
            {photoNotice && <p className="owner-feedback" role="status">{photoNotice}</p>}
            {photoError && <p className="owner-form-error" role="alert">{photoError}</p>}
            <form className="owner-listing-form edit-listing-form" id="edit-listing-form" onSubmit={submit}>
              <section className="edit-listing-section edit-listing-basic" aria-labelledby="edit-basic-title">
                <div className="edit-listing-section__heading"><h2 id="edit-basic-title"><span aria-hidden="true">⌂</span> Basic information</h2><span className="edit-listing-note"><i>*</i> Required to publish</span></div>
                <div className="edit-listing-grid">
                  <label className="form-field edit-listing-field--title" htmlFor="edit-listing-title-field">
                    <span>Property headline <small>Optional</small></span>
                    <input aria-describedby={fieldErrors.title ? 'edit-title-error' : undefined} aria-invalid={Boolean(fieldErrors.title)} id="edit-listing-title-field" maxLength={150} onChange={setValue('title')} value={form.title} />
                    {fieldErrors.title && <span className="owner-field-error" id="edit-title-error">{fieldErrors.title}</span>}
                  </label>
                  <label className="form-field edit-listing-field--location" htmlFor="edit-listing-location">
                    <span>Location <em>*</em></span>
                    <input aria-describedby={fieldErrors.location ? 'edit-location-error' : undefined} aria-invalid={Boolean(fieldErrors.location)} id="edit-listing-location" maxLength={150} onChange={setValue('location')} value={form.location} />
                    {fieldErrors.location && <span className="owner-field-error" id="edit-location-error">{fieldErrors.location}</span>}
                  </label>
                  <label className="form-field edit-listing-field--type" htmlFor="edit-listing-property-type">
                    <span>Property type <em>*</em></span>
                    <select aria-describedby={fieldErrors.property_type ? 'edit-property-type-error' : undefined} aria-invalid={Boolean(fieldErrors.property_type)} id="edit-listing-property-type" onChange={setValue('property_type')} value={form.property_type}>
                      <option value="">Select a property type</option>
                      {form.property_type && !PROPERTY_TYPE_OPTIONS.includes(form.property_type) && <option value={form.property_type}>Current type: {form.property_type}</option>}
                      {PROPERTY_TYPE_OPTIONS.map((propertyType) => <option key={propertyType} value={propertyType}>{propertyType}</option>)}
                    </select>
                    {fieldErrors.property_type && <span className="owner-field-error" id="edit-property-type-error">{fieldErrors.property_type}</span>}
                  </label>
                  <label className="form-field edit-listing-field--rent" htmlFor="edit-listing-rent">
                    <span>Monthly rent <em>*</em></span>
                    <span className="edit-listing-rent-input"><b>BDT</b><input aria-describedby={fieldErrors.monthly_rent ? 'edit-rent-error' : undefined} aria-invalid={Boolean(fieldErrors.monthly_rent)} id="edit-listing-rent" min="0.01" onChange={setValue('monthly_rent')} required step="0.01" type="number" value={form.monthly_rent} /></span>
                    {fieldErrors.monthly_rent && <span className="owner-field-error" id="edit-rent-error">{fieldErrors.monthly_rent}</span>}
                  </label>
                  <div className="form-field edit-listing-field--bedrooms">
                    <label htmlFor="edit-listing-bedrooms">Bedrooms <em>*</em></label>
                    <span className="edit-listing-number-stepper"><button aria-label="Decrease bedrooms" disabled={Number(form.bedrooms) <= 0} onClick={() => adjustNumber('bedrooms', -1)} type="button">-</button><input aria-describedby={fieldErrors.bedrooms ? 'edit-bedrooms-error' : undefined} aria-invalid={Boolean(fieldErrors.bedrooms)} id="edit-listing-bedrooms" max="32767" min="0" onChange={setValue('bedrooms')} required step="1" type="number" value={form.bedrooms} /><button aria-label="Increase bedrooms" onClick={() => adjustNumber('bedrooms', 1)} type="button">+</button></span>
                    {fieldErrors.bedrooms && <span className="owner-field-error" id="edit-bedrooms-error">{fieldErrors.bedrooms}</span>}
                  </div>
                  <div className="form-field edit-listing-field--bathrooms">
                    <label htmlFor="edit-listing-bathrooms">Bathrooms <em>*</em></label>
                    <span className="edit-listing-number-stepper"><button aria-label="Decrease bathrooms" disabled={Number(form.bathrooms) <= 0} onClick={() => adjustNumber('bathrooms', -1)} type="button">-</button><input aria-describedby={fieldErrors.bathrooms ? 'edit-bathrooms-error' : undefined} aria-invalid={Boolean(fieldErrors.bathrooms)} id="edit-listing-bathrooms" max="32767" min="0" onChange={setValue('bathrooms')} required step="1" type="number" value={form.bathrooms} /><button aria-label="Increase bathrooms" onClick={() => adjustNumber('bathrooms', 1)} type="button">+</button></span>
                    {fieldErrors.bathrooms && <span className="owner-field-error" id="edit-bathrooms-error">{fieldErrors.bathrooms}</span>}
                  </div>
                </div>
                <label className="form-field edit-listing-description" htmlFor="edit-listing-description">
                  <span>Description <small>Optional</small></span>
                  <textarea aria-describedby={fieldErrors.description ? 'edit-description-error' : undefined} aria-invalid={Boolean(fieldErrors.description)} id="edit-listing-description" maxLength={2000} onChange={setValue('description')} value={form.description} />
                  {fieldErrors.description && <span className="owner-field-error" id="edit-description-error">{fieldErrors.description}</span>}
                </label>
              </section>
              <section
                className="edit-listing-section edit-listing-photo-section"
                aria-label="Property photos"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  if (!saving && !uploadingPhotos && !removingImageId) selectFiles(event.dataTransfer.files)
                }}
              >
                <ListingPhotosSection
                  existingImages={images}
                  isPublished={listing.lifecycle_status === 'PUBLISHED'}
                  onFilesSelected={selectFiles}
                  onRemoveExisting={removeSavedPhoto}
                  onRemoveSelected={removePendingPhoto}
                  onUploadSelected={uploadSelectedPhotos}
                  photoErrors={photoErrors}
                  removingImageId={removingImageId}
                  selectedPhotos={selectedPhotos}
                  selectionMessages={selectionMessages}
                  uploading={uploadingPhotos}
                  disabled={saving || uploadingPhotos || removingImageId !== null || listing.lifecycle_status === 'REMOVED'}
                />
              </section>
              <section className="edit-listing-section edit-listing-facilities" aria-labelledby="edit-facilities-title">
                <div className="edit-listing-section__heading"><h2 id="edit-facilities-title"><span aria-hidden="true">☆</span> Facilities</h2><span className="edit-listing-note">{form.amenities.split('\n').filter(Boolean).length} selected</span></div>
                <div className="edit-listing-facility-options">
                  {SUGGESTED_FACILITIES.map((facility) => {
                    const selected = form.amenities.split('\n').map((item) => item.trim()).includes(facility)
                    return <button aria-pressed={selected} className={selected ? 'is-selected' : ''} key={facility} onClick={() => toggleFacility(facility)} type="button">{facility}</button>
                  })}
                </div>
                <label className="form-field edit-listing-custom-facilities" htmlFor="edit-listing-facilities">Add other facilities <small>One per line</small>
                  <textarea aria-describedby={fieldErrors.amenities ? 'edit-amenities-error' : undefined} aria-invalid={Boolean(fieldErrors.amenities)} id="edit-listing-facilities" onChange={setValue('amenities')} placeholder="e.g. Rooftop garden" value={form.amenities} />
                  {fieldErrors.amenities && <span className="owner-field-error" id="edit-amenities-error">{fieldErrors.amenities}</span>}
                </label>
              </section>
              <div className="owner-listing-form__actions edit-listing-bottom-actions">
                <Link className="button button--quiet" to="/owner/listings">Cancel</Link>
                <button className="button button--primary" disabled={saving || uploadingPhotos} type="submit">{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
          <aside className="edit-listing-aside">
            <section className="edit-listing-save-panel" aria-label="Save listing changes">
              <div className="edit-listing-status-row"><span className={'edit-listing-status edit-listing-status--' + listing.lifecycle_status.toLowerCase()}><i aria-hidden="true" />{listing.lifecycle_status.charAt(0) + listing.lifecycle_status.slice(1).toLowerCase()}</span><span>Updated {dateLabel(listing.updated_at)}</span></div>
              <p className={'edit-listing-dirty' + (dirty ? ' is-dirty' : '')}><i aria-hidden="true" />{dirty ? 'Unsaved changes' : 'All changes saved'}</p>
              <button className="button button--primary" disabled={saving || uploadingPhotos} form="edit-listing-form" type="submit">{saving ? 'Saving...' : 'Save changes'}</button>
              <Link className="button button--quiet" to="/owner/listings">Cancel</Link>
            </section>
            <section className="edit-listing-requirements" aria-labelledby="edit-publish-requirements-title">
              <div className="edit-listing-aside-heading"><h2 id="edit-publish-requirements-title">Publish requirements</h2><span>{completedRequirements} of {publishRequirements.length}</span></div>
              <ul>{publishRequirements.map(({ label, complete }) => <li className={complete ? 'is-complete' : ''} key={label}><i aria-hidden="true">{complete ? '✓' : ''}</i>{label}</li>)}</ul>
            </section>
            <section className="edit-listing-preview" aria-label="How seekers see your listing">
              <h2>How seekers see it</h2>
              <PropertyImage alt={form.title || 'Property preview'} authenticated className="edit-listing-preview__image" fallbackClassName="edit-listing-preview__placeholder" fallbackLabel="Photo preview" src={images[0]?.url} />
              <p className="edit-listing-preview__location">⌖ {form.location || 'Location not set'}</p>
              <h3>BDT {Number(form.monthly_rent || 0).toLocaleString('en-BD')} <small>/ month</small></h3>
              <p className="edit-listing-preview__type">{form.property_type || 'Property type not set'}</p>
              <div className="edit-listing-preview__facts"><span>{form.bedrooms || 0} beds</span><span>{form.bathrooms || 0} baths</span></div>
            </section>
          </aside>
        </div>
      )}
    </section>
  )
}
