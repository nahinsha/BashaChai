import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import SavedListingCard from '../components/SavedListingCard.jsx'
import PropertyImage from '../components/PropertyImage.jsx'
import { useComparison } from '../context/useComparison.js'
import './SeekerPages.css'
import './ComparisonPages.css'

const PAGE_SIZE = 20

export default function ShortlistPage() {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [request, setRequest] = useState({ key: '', data: null, error: null })
  const [removingId, setRemovingId] = useState(null)
  const [removeError, setRemoveError] = useState('')
  const [notice, setNotice] = useState('')
  const { selectedListings, limitMessage, addListing, removeListing } = useComparison()
  const requestKey = `${page}:${retry}`

  useEffect(() => {
    let active = true
    apiRequest(`/shortlist/?page=${page}`, { auth: true })
      .then((data) => { if (active) setRequest({ key: requestKey, data, error: null }) })
      .catch((error) => { if (active) setRequest({ key: requestKey, data: null, error }) })
    return () => { active = false }
  }, [page, requestKey])

  const loading = request.key !== requestKey
  const data = loading ? null : request.data
  const error = loading ? null : request.error
  const items = data?.results || []

  const removeSavedHome = async (item) => {
    setRemovingId(item.listing.id)
    setRemoveError('')
    setNotice('')
    try {
      await apiRequest(`/shortlist/${item.listing.id}/`, {
        method: 'DELETE',
        auth: true,
      })
      removeListing(item.listing.id)
      const nextCount = Math.max(0, (data?.count || 0) - 1)
      const lastPage = Math.max(1, Math.ceil(nextCount / PAGE_SIZE))
      setNotice('Home removed from your saved list.')
      if (page > lastPage) setPage(lastPage)
      else setRetry((value) => value + 1)
    } catch (error) {
      setRemoveError(error.status === 404
        ? 'This home is no longer in your saved list. Reload the page to update it.'
        : error.message || 'This home could not be removed. Please try again.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section className="seeker-page seeker-page--shortlist" aria-labelledby="shortlist-title">
      <header className="owner-page-heading shortlist-heading">
        <div>
          <p className="eyebrow">Home Seeker</p>
          <h1 id="shortlist-title">Saved homes</h1>
          <p>Your saved homes and their latest availability.</p>
        </div>
      </header>

      {notice && <p className="owner-feedback" role="status">{notice}</p>}
      {removeError && <p className="owner-form-error" role="alert">{removeError}</p>}
      {!loading && !error && (
        <p className="seeker-list-count" aria-live="polite">
          {data?.count ?? 0} {data?.count === 1 ? 'saved home' : 'saved homes'}
        </p>
      )}

      {loading && <div className="state-panel" role="status">Loading your saved homes…</div>}
      {!loading && error && (
        <div className="state-panel state-panel--error" role="alert">
          <h2>Your saved homes couldn’t be loaded</h2>
          <p>{error.message || 'Please check your connection and try again.'}</p>
          <button className="button button--primary" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="state-panel seeker-empty-state">
          <h2>No saved homes yet</h2>
          <p>Homes you save will appear here.</p>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <>
        <div className="comparison-selection-bar">
          <div>
            <strong>{selectedListings.length} of 3 homes selected</strong>
            <span>Choose saved homes to compare their details side by side.</span>
            {limitMessage && <span className="comparison-limit-message" role="alert">{limitMessage}</span>}
          </div>
          <Link
            aria-disabled={selectedListings.length === 0}
            className="button button--primary"
            onClick={(event) => { if (!selectedListings.length) event.preventDefault() }}
            to="/seeker/compare"
          >Compare selected</Link>
        </div>
        <div className="saved-listing-list">
          {items.map((item) => (
            <SavedListingCard
              item={item}
              key={item.id}
              image={<PropertyImage alt="" className="saved-listing-card__image" fallbackClassName="saved-listing-card__image-fallback" fallbackLabel="Photo coming soon" src={item.listing.images?.[0]?.url || item.listing.primary_image_url} />}
              onRemove={removeSavedHome}
              removing={removingId === item.listing.id}
              onToggleComparison={() => selectedListings.some((selected) => selected.id === item.listing.id)
                ? removeListing(item.listing.id)
                : addListing(item.listing)}
              selectedForComparison={selectedListings.some((selected) => selected.id === item.listing.id)}
            />
          ))}
        </div>
        </>
      )}

      {!loading && !error && items.length > 0 && (data?.previous || data?.next) && (
        <nav className="owner-pagination" aria-label="Saved homes pages">
          <button className="button button--quiet" disabled={!data.previous} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
          <span>Page {page}</span>
          <button className="button button--quiet" disabled={!data.next} onClick={() => setPage((value) => value + 1)} type="button">Next</button>
        </nav>
      )}
    </section>
  )
}
