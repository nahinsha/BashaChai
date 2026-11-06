import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/useAuth.js'

export default function ShortlistSaveButton({ listingId }) {
  const { status, user } = useAuth()
  const location = useLocation()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  if (status === 'checking') return null

  if (status !== 'authenticated') {
    return (
      <Link
        className="button button--quiet shortlist-save-button"
        state={{ from: `${location.pathname}${location.search}` }}
        to="/login"
      >Sign in to save</Link>
    )
  }

  if (!user?.roles?.includes('HOME_SEEKER')) return null

  const save = async () => {
    setSaving(true)
    setMessage('')
    setIsError(false)
    try {
      await apiRequest('/shortlist/', {
        method: 'POST',
        body: { listing_id: listingId },
        auth: true,
      })
      setSaved(true)
      setMessage('Saved to your homes.')
    } catch (error) {
      if (error.code === 'already_in_shortlist') {
        setSaved(true)
        setMessage('This home is already saved.')
      } else if (error.status === 404) {
        setIsError(true)
        setMessage('This home is no longer available to save. Refresh the listings and try again.')
      } else {
        setIsError(true)
        setMessage(error.message || 'This home could not be saved. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="shortlist-save-control">
      <button className="button button--quiet shortlist-save-button" disabled={saving || saved} onClick={save} type="button">
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save home'}
      </button>
      {message && <span className={isError ? 'shortlist-save-message shortlist-save-message--error' : 'shortlist-save-message'} role={isError ? 'alert' : 'status'}>{message}</span>}
    </span>
  )
}
