import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { PROPERTY_TYPE_OPTIONS } from '../constants/listingOptions.js'
import ListingPhotosSection from '../components/ListingPhotosSection.jsx'
import { useListingPhotoSelection } from '../hooks/useListingPhotoSelection.js'
import './CreateListingPage.css'
import './OwnerPages.css'

const SUGGESTED_AMENITIES = ['Wi-Fi', 'Parking', 'Lift', 'Security', 'Generator', 'Balcony', 'Gas', 'Water Supply']
const INITIAL_FORM = {
  title: '',
  location: '',
  property_type: '',
  monthly_rent: '',
  bedrooms: '',
  bathrooms: '',
  description: '',
  amenities: '',
}

function errorMessage(value) {
  if (Array.isArray(value)) return value.map(errorMessage).join(' ')
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return Object.values(value).map(errorMessage).join(' ')
  return ''
}

function createPayload(form) {
  const payload = {
    monthly_rent: form.monthly_rent,
    bedrooms: Number(form.bedrooms),
    bathrooms: Number(form.bathrooms),
  }

  for (const field of ['title', 'location', 'property_type', 'description']) {
    const value = form[field].trim()
    if (value) payload[field] = value
  }

  const amenities = form.amenities.split('\n').map((amenity) => amenity.trim()).filter(Boolean)
  if (amenities.length) payload.amenities = amenities
  return payload
}

export default function CreateListingPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [formNotice, setFormNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createdListingId, setCreatedListingId] = useState(null)
  const [uploadedPhotoCount, setUploadedPhotoCount] = useState(0)
  const [photoErrors, setPhotoErrors] = useState({})
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const {
    selectedPhotos,
    selectionMessages,
    selectFiles,
    removeSelectedPhoto,
    removeUploadedPhotos,
  } = useListingPhotoSelection(0)

  const publishRequirements = [
    { label: 'Location', complete: Boolean(form.location.trim()) },
    { label: 'Property type', complete: Boolean(form.property_type) },
    { label: 'Monthly rent', complete: Number(form.monthly_rent) > 0 },
    { label: 'Bedrooms', complete: form.bedrooms !== '' && Number(form.bedrooms) >= 0 },
    { label: 'Bathrooms', complete: form.bathrooms !== '' && Number(form.bathrooms) >= 0 },
    { label: 'At least 1 photo', complete: selectedPhotos.length + uploadedPhotoCount > 0 },
  ]
  const completedRequirements = publishRequirements.filter(({ complete }) => complete).length
  const canPublish = completedRequirements === publishRequirements.length && !submitting

  const setValue = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setFormError('')
    setFormNotice('')
  }

  const adjustNumber = (field, amount) => {
    const next = Math.max(0, (Number(form[field]) || 0) + amount)
    setForm((current) => ({ ...current, [field]: String(next) }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setFormError('')
    setFormNotice('')
  }

  const toggleAmenity = (amenity) => {
    const current = form.amenities.split('\n').map((item) => item.trim()).filter(Boolean)
    const next = current.includes(amenity) ? current.filter((item) => item !== amenity) : [...current, amenity]
    setForm((value) => ({ ...value, amenities: next.join('\n') }))
    setFormError('')
    setFormNotice('')
  }

  const removePendingPhoto = (id) => {
    removeSelectedPhoto(id)
    setPhotoErrors((current) => ({ ...current, [id]: undefined }))
  }

  const submit = async (event) => {
    event.preventDefault()
    const publishAfterSave = event.nativeEvent.submitter?.value === 'publish'
    setFieldErrors({})
    setFormError('')
    setFormNotice('')
    setSubmitting(true)

    try {
      let listingId = createdListingId
      if (!listingId) {
        const listing = await apiRequest('/owner/listings/', {
          method: 'POST',
          body: createPayload(form),
          auth: true,
        })
        listingId = listing.id
        setCreatedListingId(listingId)
      }

      if (selectedPhotos.length === 0) {
        if (!publishAfterSave) {
          navigate('/owner/listings', {
            replace: true,
            state: { notice: 'Draft listing created successfully.' },
          })
          return
        }
      } else {
        setUploadingPhotos(true)
        const uploadedIds = []
        const failures = {}
        for (const photo of selectedPhotos) {
          const body = new FormData()
          body.append('image', photo.file)
          try {
            await apiRequest(`/owner/listings/${listingId}/images/`, {
              method: 'POST',
              body,
              auth: true,
            })
            uploadedIds.push(photo.id)
          } catch (error) {
            failures[photo.id] = error.fields?.image
              ? errorMessage(error.fields.image)
              : error.message || 'This photo could not be uploaded. Please try again.'
          }
        }

        if (uploadedIds.length) {
          setUploadedPhotoCount((count) => count + uploadedIds.length)
          removeUploadedPhotos(uploadedIds)
        }
        setPhotoErrors(failures)
        if (Object.keys(failures).length > 0) {
          setFormNotice(`Your Draft was saved. ${uploadedIds.length} photo${uploadedIds.length === 1 ? '' : 's'} uploaded; ${Object.keys(failures).length} could not be uploaded. You can retry the remaining photos.`)
          return
        }

        if (!publishAfterSave) {
          navigate(`/owner/listings/${listingId}/edit`, {
            replace: true,
            state: { notice: `Draft saved with ${uploadedIds.length} photo${uploadedIds.length === 1 ? '' : 's'}.` },
          })
          return
        }
      }

      if (publishAfterSave) {
        try {
          await apiRequest(`/owner/listings/${listingId}/availability/`, {
            method: 'POST',
            body: { action: 'STILL_AVAILABLE' },
            auth: true,
          })
          await apiRequest(`/owner/listings/${listingId}/publish/`, { method: 'POST', auth: true })
          navigate('/owner/listings', {
            replace: true,
            state: { notice: 'Your listing is now visible in public search.' },
          })
        } catch (error) {
          navigate(`/owner/listings/${listingId}/edit`, {
            replace: true,
            state: { notice: `Your Draft was saved, but could not be published: ${error.message || 'Please review the listing and try again.'}` },
          })
        }
        return
      }
    } catch (error) {
      setFieldErrors(Object.fromEntries(
        Object.entries(error.fields || {}).map(([field, value]) => [field, errorMessage(value)]),
      ))
      setFormError(error.message || 'Your listing could not be created. Please review the fields and try again.')
    } finally {
      setUploadingPhotos(false)
      setSubmitting(false)
    }
  }

  return (
    <section className="owner-dashboard create-listing-page" aria-labelledby="create-listing-title">
      <header className="owner-page-heading create-listing-heading">
        <div>
          <p className="eyebrow">Property Owner</p>
          <h1 id="create-listing-title">Add a New Listing</h1>
          <p>Share your property with people looking for a place to call home.</p>
        </div>
        <Link className="button button--quiet create-listing-back" to="/owner/listings"><span aria-hidden="true">←</span> Back to My Listings</Link>
      </header>

      <div className="create-listing-layout">
      <div className="owner-form-card create-listing-main">
        {formError && <p className="owner-form-error" role="alert">{formError}</p>}
        {formNotice && <p className="owner-feedback" role="status">{formNotice}</p>}
        {createdListingId && (
          <p className="owner-feedback" role="status">
            Your Draft is saved. <Link to={`/owner/listings/${createdListingId}/edit`}>Continue editing this listing</Link>.
          </p>
        )}
        <form className="owner-listing-form create-listing-form" id="create-listing-form" onSubmit={submit}>
          {!createdListingId && <>
          <section className="create-listing-section create-listing-basic" aria-labelledby="basic-information-title">
          <div className="create-listing-section__heading"><h2 id="basic-information-title"><span aria-hidden="true">⌂</span> Basic information</h2><span className="create-listing-required-note"><i>*</i> Required to publish</span></div>
          <div className="owner-listing-form__grid">
            <label className="form-field create-listing-field--headline" htmlFor="listing-title">
              <span>Property headline <small>Optional. If empty, we will build one from the details.</small></span>
              <input
                aria-describedby={fieldErrors.title ? 'listing-title-help listing-title-error' : 'listing-title-help'}
                aria-invalid={Boolean(fieldErrors.title)}
                id="listing-title"
                maxLength={100}
                name="title"
                onChange={setValue('title')}
                placeholder="e.g., Garden-facing Flat · Gulshan 1"
                value={form.title}
              />
              <small className="create-listing-sr-only" id="listing-title-help">Write a short title describing your property and its location.</small>
              {fieldErrors.title && <span className="owner-field-error" id="listing-title-error">{fieldErrors.title}</span>}
            </label>

            <label className="form-field create-listing-field--location" htmlFor="listing-location">
              <span>Location <em>*</em></span>
              <input
                aria-describedby={fieldErrors.location ? 'listing-location-error' : undefined}
                aria-invalid={Boolean(fieldErrors.location)}
                id="listing-location"
                maxLength={150}
                name="location"
                onChange={setValue('location')}
                placeholder="e.g. Gulshan-02, Dhaka"
                value={form.location}
              />
              {fieldErrors.location && <span className="owner-field-error" id="listing-location-error">{fieldErrors.location}</span>}
            </label>

            <label className="form-field create-listing-field--type" htmlFor="listing-property-type">
              <span>Property Type <em>*</em></span>
              <select
                aria-describedby={fieldErrors.property_type ? 'listing-property-type-error' : undefined}
                aria-invalid={Boolean(fieldErrors.property_type)}
                id="listing-property-type"
                name="property_type"
                onChange={setValue('property_type')}
                value={form.property_type}
              >
                <option value="">Select property type</option>
                {PROPERTY_TYPE_OPTIONS.map((propertyType) => (
                  <option key={propertyType} value={propertyType}>{propertyType}</option>
                ))}
              </select>
              {fieldErrors.property_type && <span className="owner-field-error" id="listing-property-type-error">{fieldErrors.property_type}</span>}
            </label>

            <label className="form-field create-listing-field--rent" htmlFor="listing-monthly-rent">
              <span>Monthly rent <em>*</em></span>
              <span className="create-listing-rent-input"><b>BDT</b><input
                aria-describedby={fieldErrors.monthly_rent ? 'listing-rent-error' : undefined}
                aria-invalid={Boolean(fieldErrors.monthly_rent)}
                id="listing-monthly-rent"
                min="0.01"
                name="monthly_rent"
                onChange={setValue('monthly_rent')}
                placeholder="e.g. 50000"
                required
                step="0.01"
                type="number"
                value={form.monthly_rent}
              /></span>
              {fieldErrors.monthly_rent && <span className="owner-field-error" id="listing-rent-error">{fieldErrors.monthly_rent}</span>}
            </label>

            <div className="form-field create-listing-field--bedrooms">
              <label htmlFor="listing-bedrooms">Bedrooms <em>*</em></label>
              <span className="create-listing-number-stepper"><button aria-label="Decrease bedrooms" disabled={Number(form.bedrooms) <= 0} onClick={() => adjustNumber('bedrooms', -1)} type="button">-</button><input
                aria-describedby={fieldErrors.bedrooms ? 'listing-bedrooms-error' : undefined}
                aria-invalid={Boolean(fieldErrors.bedrooms)}
                id="listing-bedrooms"
                max="32767"
                min="0"
                name="bedrooms"
                onChange={setValue('bedrooms')}
                placeholder="0"
                required
                step="1"
                type="number"
                value={form.bedrooms}
              /><button aria-label="Increase bedrooms" onClick={() => adjustNumber('bedrooms', 1)} type="button">+</button></span>
              {fieldErrors.bedrooms && <span className="owner-field-error" id="listing-bedrooms-error">{fieldErrors.bedrooms}</span>}
            </div>

            <div className="form-field create-listing-field--bathrooms">
              <label htmlFor="listing-bathrooms">Bathrooms <em>*</em></label>
              <span className="create-listing-number-stepper"><button aria-label="Decrease bathrooms" disabled={Number(form.bathrooms) <= 0} onClick={() => adjustNumber('bathrooms', -1)} type="button">-</button><input
                aria-describedby={fieldErrors.bathrooms ? 'listing-bathrooms-error' : undefined}
                aria-invalid={Boolean(fieldErrors.bathrooms)}
                id="listing-bathrooms"
                max="32767"
                min="0"
                name="bathrooms"
                onChange={setValue('bathrooms')}
                placeholder="0"
                required
                step="1"
                type="number"
                value={form.bathrooms}
              /><button aria-label="Increase bathrooms" onClick={() => adjustNumber('bathrooms', 1)} type="button">+</button></span>
              {fieldErrors.bathrooms && <span className="owner-field-error" id="listing-bathrooms-error">{fieldErrors.bathrooms}</span>}
            </div>
          </div>

          <label className="form-field create-listing-description" htmlFor="listing-description">
            <span>Description <small>Optional</small></span>
            <textarea
              aria-describedby={fieldErrors.description ? 'listing-description-error' : undefined}
              aria-invalid={Boolean(fieldErrors.description)}
              id="listing-description"
              name="description"
              onChange={setValue('description')}
              placeholder="Describe your property in detail..."
              value={form.description}
            />
            {fieldErrors.description && <span className="owner-field-error" id="listing-description-error">{fieldErrors.description}</span>}
          </label>

          </section>
          <section
            className="create-listing-section create-listing-photo-section"
            aria-label="Property photos"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (!submitting) selectFiles(event.dataTransfer.files)
            }}
          >
            <ListingPhotosSection disabled={submitting} onFilesSelected={selectFiles} onRemoveSelected={removePendingPhoto} photoErrors={photoErrors} selectedPhotos={selectedPhotos} selectionMessages={selectionMessages} />
          </section>
          <section className="create-listing-section create-listing-amenities" aria-labelledby="listing-amenities-title">
            <div className="create-listing-section__heading"><h2 id="listing-amenities-title"><span aria-hidden="true">☆</span> Facilities</h2><span className="create-listing-required-note">{form.amenities.split('\n').filter(Boolean).length} selected</span></div>
            <div className="create-listing-amenity-options">
              {SUGGESTED_AMENITIES.map((amenity) => {
                const active = form.amenities.split('\n').map((item) => item.trim()).includes(amenity)
                return <button aria-pressed={active} className={active ? 'is-selected' : ''} key={amenity} onClick={() => toggleAmenity(amenity)} type="button">{amenity}</button>
              })}
            </div>
            <label className="create-listing-custom-amenities" htmlFor="listing-amenities">Add other facilities <small>One per line</small>
              <textarea aria-describedby={fieldErrors.amenities ? 'listing-amenities-error' : undefined} aria-invalid={Boolean(fieldErrors.amenities)} id="listing-amenities" name="amenities" onChange={setValue('amenities')} placeholder="e.g. Rooftop garden" value={form.amenities} />
              {fieldErrors.amenities && <span className="owner-field-error" id="listing-amenities-error">{fieldErrors.amenities}</span>}
            </label>
          </section>
          </>}

          {createdListingId && <ListingPhotosSection disabled={submitting} onFilesSelected={selectFiles} onRemoveSelected={removePendingPhoto} photoErrors={photoErrors} selectedPhotos={selectedPhotos} selectionMessages={selectionMessages} />}

          <div className="owner-listing-form__actions create-listing-actions">
        <Link className="button button--quiet" to="/owner/listings">Cancel</Link>
            {(!createdListingId || selectedPhotos.length > 0) && (
              <button className="button button--primary" disabled={submitting} type="submit">
                {submitting ? (uploadingPhotos ? 'Uploading photos…' : 'Saving…') : createdListingId ? 'Retry photo uploads' : 'Save Draft'}
              </button>
            )}
          </div>
        </form>
      </div>
      <aside className="create-listing-aside">
        <section className="create-listing-publish-panel" aria-label="Save or publish listing">
          <span className="create-listing-draft-badge">{createdListingId ? 'Draft saved' : 'Draft - not saved yet'}</span>
          <button className="button button--primary" disabled={!canPublish} form="create-listing-form" name="submitAction" type="submit" value="publish">
            {submitting ? (uploadingPhotos ? 'Uploading photos...' : 'Publishing...') : 'Publish listing'}
          </button>
          <button className="button button--quiet" disabled={submitting} form="create-listing-form" name="submitAction" type="submit" value="draft">
            {submitting ? 'Saving...' : 'Save as draft'}
          </button>
          <Link className="button button--quiet create-listing-cancel" to="/owner/listings">Cancel</Link>
          <p>Publishing makes the listing visible in public search. By publishing, you confirm the home is still available.</p>
        </section>
        <section className="create-listing-requirements" aria-labelledby="create-listing-requirements-title">
          <div className="create-listing-aside-heading"><h2 id="create-listing-requirements-title">Publish requirements</h2><span>{completedRequirements} of {publishRequirements.length}</span></div>
          <ul>{publishRequirements.map(({ label, complete }) => <li className={complete ? 'is-complete' : ''} key={label}><i aria-hidden="true">{complete ? '✓' : ''}</i>{label}</li>)}</ul>
        </section>
        <section className="create-listing-preview" aria-label="How seekers see your listing">
          <h2>How seekers see it</h2>
          {selectedPhotos[0]?.previewUrl
            ? <img alt="Preview of your property" src={selectedPhotos[0].previewUrl} />
            : <div className="create-listing-preview-placeholder">Photo preview</div>}
          <h3>{form.monthly_rent ? `BDT ${Number(form.monthly_rent).toLocaleString('en-BD')}` : 'BDT —'} <small>/ month</small></h3>
          <strong>{form.title.trim() || 'home'}</strong>
          <p className="create-listing-preview-location">{form.location.trim() || 'Location not set'}</p>
          <span className="create-listing-preview-status">Needs reconfirmation</span>
          <p className="create-listing-preview-note">New listings show this until you confirm availability after publishing.</p>
        </section>
        <section className="create-listing-tips">
          <h2>Listing tips</h2>
          <ul><li>Use a clear, specific headline.</li><li>Add bright, honest photos.</li><li>Keep the rent and details accurate.</li></ul>
        </section>
      </aside>
      </div>
    </section>
  )
}
