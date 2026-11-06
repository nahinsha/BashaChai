import { useCallback, useEffect, useRef, useState } from 'react'
import { ComparisonContext } from './ComparisonContextValue.js'
import { MAX_COMPARISON_LISTINGS } from './comparisonConstants.js'
import { useAuth } from './useAuth.js'

export function ComparisonProvider({ children }) {
  const { status, user } = useAuth()
  const [selectedListings, setSelectedListings] = useState([])
  const [limitMessage, setLimitMessage] = useState('')
  const selectedRef = useRef([])

  const replaceSelection = (next) => {
    selectedRef.current = next
    setSelectedListings(next)
  }

  const addListing = (listing) => {
    if (status !== 'authenticated' || !user?.roles?.includes('HOME_SEEKER')) return
    const current = selectedRef.current
    if (current.some((item) => item.id === listing.id)) return
    if (current.length >= MAX_COMPARISON_LISTINGS) {
      setLimitMessage(`You can compare up to ${MAX_COMPARISON_LISTINGS} listings at a time.`)
      return
    }
    setLimitMessage('')
    replaceSelection([...current, listing])
  }

  const removeListing = (listingId) => {
    setLimitMessage('')
    replaceSelection(selectedRef.current.filter((item) => item.id !== listingId))
  }

  const clearSelection = useCallback(() => {
    setLimitMessage('')
    replaceSelection([])
  }, [])

  useEffect(() => {
    const handleSessionExpired = () => clearSelection()
    window.addEventListener('basachai:session-expired', handleSessionExpired)
    return () => window.removeEventListener('basachai:session-expired', handleSessionExpired)
  }, [clearSelection])

  return (
    <ComparisonContext.Provider
      value={{
        selectedListings,
        limitMessage,
        addListing,
        removeListing,
        clearSelection,
        setLimitMessage,
      }}
    >
      {children}
    </ComparisonContext.Provider>
  )
}
