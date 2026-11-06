import { useEffect, useState } from 'react'
import { fetchAuthenticatedImage } from '../api.js'

export default function PropertyImage({
  src,
  alt,
  className,
  fallbackClassName,
  fallbackLabel = 'Image unavailable',
  fallbackAriaLabel = fallbackLabel,
  loadingLabel = 'Loading image…',
  authenticated = false,
}) {
  const [failedSource, setFailedSource] = useState(null)
  const [privateImage, setPrivateImage] = useState({ source: null, url: null })

  useEffect(() => {
    if (!authenticated || !src) return undefined

    let active = true
    let objectUrl
    fetchAuthenticatedImage(src)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setPrivateImage({ source: src, url: objectUrl })
      })
      .catch(() => {
        if (active) setFailedSource(src)
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [authenticated, src])

  const failed = !src || failedSource === src
  const blobUrl = privateImage.source === src ? privateImage.url : null

  if (failed) {
    return (
      <div aria-label={fallbackAriaLabel} className={fallbackClassName} role="img">
        {fallbackLabel}
      </div>
    )
  }

  if (authenticated && !blobUrl) {
    return <div aria-live="polite" className={fallbackClassName} role="status">{loadingLabel}</div>
  }

  return (
    <img
      alt={alt}
      className={className}
      onError={() => setFailedSource(src)}
      src={authenticated ? blobUrl : src}
    />
  )
}
