import { MAX_PHOTOS } from '../hooks/useListingPhotoSelection.js'
import PropertyImage from './PropertyImage.jsx'

function SavedPhoto({ image }) {
  return (
    <PropertyImage
      alt={`Listing photo ${image.slot}`}
      authenticated
      className="listing-photo__image"
      fallbackClassName="listing-photo__unavailable"
      fallbackLabel={`Photo ${image.slot} preview unavailable`}
      loadingLabel={`Loading photo ${image.slot}…`}
      src={image.url}
    />
  )
}

export default function ListingPhotosSection({
  existingImages = [],
  selectedPhotos = [],
  selectionMessages = [],
  photoErrors = {},
  onFilesSelected,
  onRemoveSelected,
  onRemoveExisting,
  removingImageId = null,
  onUploadSelected,
  uploading = false,
  isPublished = false,
  disabled = false,
}) {
  const totalPhotos = existingImages.length + selectedPhotos.length
  const canSelectMore = totalPhotos < MAX_PHOTOS && !disabled && !uploading
  const lastPublishedPhoto = isPublished && existingImages.length === 1

  const handleFiles = (event) => {
    onFilesSelected(event.target.files)
    event.target.value = ''
  }

  return (
    <section className="listing-photos" aria-labelledby="listing-photos-title">
      <div className="listing-photos__heading">
        <div>
          <h2 id="listing-photos-title">Photos</h2>
          <p>Choose up to 5 JPG, JPEG, PNG, or WebP photos. Each photo must be 5 MB or smaller.</p>
        </div>
        <span>{totalPhotos} of {MAX_PHOTOS}</span>
      </div>

      <label className="listing-photos__picker">
        <span>{canSelectMore ? 'Choose photos' : 'Photo limit reached'}</span>
        <input
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          disabled={!canSelectMore}
          multiple
          onChange={handleFiles}
          type="file"
        />
      </label>
      <p className="listing-photos__hint">
        Selected photos are previewed here before upload. Photos are checked again when uploaded.
      </p>

      {selectionMessages.length > 0 && (
        <ul className="listing-photos__errors" role="alert">
          {selectionMessages.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
        </ul>
      )}

      {(existingImages.length > 0 || selectedPhotos.length > 0) && (
        <div className="listing-photos__grid">
          {existingImages.map((image) => (
            <article className="listing-photo" key={`saved-${image.id}`}>
              <SavedPhoto image={image} />
              <p className="listing-photo__name">Photo {image.slot}</p>
              {onRemoveExisting && (
                <>
                  <button
                    className="button button--quiet listing-photo__remove"
                    disabled={disabled || uploading || removingImageId === image.id || lastPublishedPhoto}
                    onClick={() => onRemoveExisting(image)}
                    type="button"
                  >{removingImageId === image.id ? 'Removing…' : 'Remove photo'}</button>
                </>
              )}
            </article>
          ))}

          {selectedPhotos.map((photo) => (
            <article className="listing-photo" key={`selected-${photo.id}`}>
              <img alt={`Preview of ${photo.file.name}`} className="listing-photo__image" src={photo.previewUrl} />
              <p className="listing-photo__name" title={photo.file.name}>{photo.file.name}</p>
              <button
                className="button button--quiet listing-photo__remove"
                disabled={disabled || uploading}
                onClick={() => onRemoveSelected(photo.id)}
                type="button"
              >Remove selected photo</button>
              {photoErrors[photo.id] && <p className="listing-photo__error" role="alert">{photoErrors[photo.id]}</p>}
            </article>
          ))}
        </div>
      )}

      {lastPublishedPhoto && (
        <p className="listing-photos__rule" role="status">
          A Published listing must keep at least one photo.
        </p>
      )}

      {onUploadSelected && selectedPhotos.length > 0 && (
        <button
          className="button button--primary listing-photos__upload"
          disabled={disabled || uploading}
          onClick={onUploadSelected}
          type="button"
        >{uploading ? 'Uploading photos…' : 'Upload selected photos'}</button>
      )}
    </section>
  )
}
