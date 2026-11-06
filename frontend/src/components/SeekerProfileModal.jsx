import { useEffect, useState } from 'react'
import { apiRequest } from '../api.js'
import ProfileShowcase from './ProfileShowcase.jsx'
import './SeekerProfileModal.css'

export default function SeekerProfileModal({ isOpen, onClose, seeker }) {
  const [fetchedSeeker, setFetchedSeeker] = useState(null)
  const [fetchedId, setFetchedId] = useState(null)

  useEffect(() => {
    if (!isOpen || !seeker?.id) return undefined

    let active = true
    apiRequest(`/seekers/${encodeURIComponent(seeker.id)}/`, { auth: true })
      .then((data) => {
        if (active) {
          setFetchedSeeker(data)
          setFetchedId(seeker.id)
        }
      })
      .catch(() => {
        // Fall back to initial seeker data provided in props
      })

    return () => {
      active = false
    }
  }, [isOpen, seeker?.id])

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !seeker) return null

  const profile = (fetchedId === seeker.id && fetchedSeeker) ? fetchedSeeker : seeker

  return (
    <div
      aria-labelledby="seeker-modal-title"
      aria-modal="true"
      className="seeker-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <div className="seeker-modal">
        <header className="seeker-modal__header">
          <h2 id="seeker-modal-title">Home Seeker Profile</h2>
          <button
            aria-label="Close profile modal"
            className="seeker-modal__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="seeker-modal__body">
          <ProfileShowcase
            about={profile.about_me}
            authenticatedAvatar
            details={[
              { label: 'Present address', value: profile.present_address },
              { label: 'Family members', value: profile.family_members },
              { label: 'Permanent address', value: profile.permanent_address },
            ]}
            phoneNumber={profile.phone_number}
            profession={profile.profession}
            age={profile.age ? `${profile.age} years old` : ''}
            profile={profile}
            roleLabel="Home Seeker"
          />
        </div>

        <footer className="seeker-modal__footer">
          <button className="button button--quiet" onClick={onClose} type="button">
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
