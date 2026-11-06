import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/useAuth.js'

export default function MessageOwnerAction({ listing }) {
  const { status, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (status === 'checking') return null

  if (status !== 'authenticated') {
    return (
      <Link
        className="button button--primary message-owner-action"
        state={{ from: `${location.pathname}${location.search}` }}
        to="/login"
      >Sign in to message the owner</Link>
    )
  }

  if (!user?.roles?.includes('HOME_SEEKER')) return null
  if (listing.owner?.id != null && String(listing.owner.id) === String(user.id)) {
    return <p className="message-owner-action__note">You can’t message about your own home.</p>
  }

  const startConversation = async () => {
    setLoading(true)
    setError('')
    try {
      const conversation = await apiRequest('/conversations/', {
        method: 'POST',
        body: { listing_id: listing.id },
        auth: true,
      })
      navigate(`/seeker/messages/${conversation.id}`)
    } catch (requestError) {
      if (requestError.code === 'listing_not_contactable') {
        setError('A new conversation can’t be started for this home right now.')
      } else if (requestError.status === 403) {
        setError('You need a Home Seeker account to message an owner.')
      } else if (requestError.status === 404) {
        setError('This home is no longer available to contact.')
      } else {
        setError(requestError.message || 'We couldn’t open a conversation. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="message-owner-action">
      <button className="button button--primary" disabled={loading} onClick={startConversation} type="button">
        {loading ? 'Opening conversation…' : 'Message owner'}
      </button>
      {error && <p className="message-owner-action__error" role="alert">{error}</p>}
    </div>
  )
}
