import { useEffect, useRef, useState } from 'react'

const MAX_PHOTOS = 5
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

export function useListingPhotoSelection(existingCount = 0) {
  const [selectedPhotos, setSelectedPhotos] = useState([])
  const [selectionMessages, setSelectionMessages] = useState([])
  const previewUrls = useRef(new Set())
  const nextId = useRef(1)

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current.clear()
  }, [])

  const selectFiles = (fileList) => {
    const files = Array.from(fileList || [])
    const added = []
    const messages = []
    let availableSlots = Math.max(0, MAX_PHOTOS - existingCount - selectedPhotos.length)

    files.forEach((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        messages.push(`${file.name}: choose a JPG, JPEG, PNG, or WebP photo.`)
        return
      }
      if (file.size === 0) {
        messages.push(`${file.name}: this photo is empty.`)
        return
      }
      if (file.size > MAX_PHOTO_BYTES) {
        messages.push(`${file.name}: each photo must be 5 MB or smaller.`)
        return
      }
      if (availableSlots <= 0) {
        messages.push('A listing can have up to 5 photos in total.')
        return
      }

      const previewUrl = URL.createObjectURL(file)
      previewUrls.current.add(previewUrl)
      added.push({ id: nextId.current++, file, previewUrl })
      availableSlots -= 1
    })

    if (added.length) setSelectedPhotos((current) => [...current, ...added])
    setSelectionMessages(messages)
  }

  const removeSelectedPhoto = (id) => {
    setSelectedPhotos((current) => {
      const photo = current.find((item) => item.id === id)
      if (photo) {
        URL.revokeObjectURL(photo.previewUrl)
        previewUrls.current.delete(photo.previewUrl)
      }
      return current.filter((item) => item.id !== id)
    })
  }

  const removeUploadedPhotos = (ids) => {
    const uploaded = new Set(ids)
    setSelectedPhotos((current) => {
      current.forEach((photo) => {
        if (uploaded.has(photo.id)) {
          URL.revokeObjectURL(photo.previewUrl)
          previewUrls.current.delete(photo.previewUrl)
        }
      })
      return current.filter((photo) => !uploaded.has(photo.id))
    })
  }

  return {
    selectedPhotos,
    selectionMessages,
    selectFiles,
    removeSelectedPhoto,
    removeUploadedPhotos,
  }
}

export { MAX_PHOTOS, MAX_PHOTO_BYTES }
