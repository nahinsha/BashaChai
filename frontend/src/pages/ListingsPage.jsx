import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import SearchFilters from '../components/SearchFilters.jsx'
import ShortlistSaveButton from '../components/ShortlistSaveButton.jsx'
import PropertyImage from '../components/PropertyImage.jsx'
import { LISTING_SEARCH_FILTER_KEYS } from '../constants/listingOptions.js'
import { getListingDisplayTitle } from '../utils/listingTitle.js'
import './PublicPages.css'

const FILTER_KEYS = [...LISTING_SEARCH_FILTER_KEYS, 'availability']
const AVAILABILITY_LABELS = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  NEEDS_RECONFIRMATION: 'Needs reconfirmation',
}

function readFilters(params) {
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) || '']))
}

function apiQuery(params) {
  const query = new URLSearchParams()
  for (const key of [...FILTER_KEYS, 'sort', 'page']) {
    const value = params.get(key)
    if (value) query.set(key, value)
  }
  return query.toString()
}

function formatRent(value) {
  return value == null ? 'Rent not provided' : `৳${Number(value).toLocaleString('en-BD')} / month`
}

function ApiError({ error, onRetry }) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <h2>We couldn’t load these listings</h2>
      <p>{error?.message || 'Please check your connection and try again.'}</p>
      <button className="button button--primary" onClick={onRetry} type="button">Try again</button>
    </div>
  )
}

export function PublicListingCard({ listing, compact = false }) {
  const displayTitle = getListingDisplayTitle(listing)

  return (
    <article className={`listing-card${compact ? ' listing-card--compact' : ''}`}>
      <Link className="listing-card__image-link" to={`/listings/${listing.id}`} aria-label={`View ${displayTitle}`}>
        <PropertyImage
          alt=""
          className="listing-card__image"
          fallbackClassName="listing-card__image listing-card__image--empty"
          src={listing.primary_image_url}
        />
        <span className={`availability availability--${String(listing.availability?.status || '').toLowerCase()}`}>
          {AVAILABILITY_LABELS[listing.availability?.status] || 'Availability unknown'}
        </span>
      </Link>
      <div className="listing-card__body">
        <div className="listing-card__heading">
          <div>
            <p className="listing-card__location">{listing.location || 'Location not provided'}</p>
            <h2><Link to={`/listings/${listing.id}`}>{displayTitle}</Link></h2>
          </div>
          <p className="listing-card__rent">{formatRent(listing.monthly_rent)}</p>
        </div>
        <p className="listing-card__facts">
          {listing.property_type || 'Type not provided'}
          <span aria-hidden="true"> · </span>
          {listing.bedrooms == null ? 'Bedrooms unknown' : `${listing.bedrooms} bed`}
          <span aria-hidden="true"> · </span>
          {listing.bathrooms == null ? 'Bathrooms unknown' : `${listing.bathrooms} bath`}
        </p>
        <div className="listing-card__actions">
          <Link className="text-link" to={`/listings/${listing.id}`}>View details <span aria-hidden="true">→</span></Link>
          <ShortlistSaveButton listingId={listing.id} />
        </div>
      </div>
    </article>
  )
}

export default function ListingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterSource = searchParams.toString()
  const [filterState, setFilterState] = useState(() => ({ source: filterSource, value: readFilters(searchParams) }))
  const filters = filterState.source === filterSource ? filterState.value : readFilters(searchParams)
  const setFilters = (update) => setFilterState((current) => ({
    source: filterSource,
    value: typeof update === 'function' ? update(current.source === filterSource ? current.value : readFilters(searchParams)) : update,
  }))
  const sort = searchParams.get('sort') || 'newest'
  const [request, setRequest] = useState({ key: null, results: null, error: null })
  const [validationError, setValidationError] = useState(null)
  const [reload, setReload] = useState(0)
  const queryString = apiQuery(searchParams)
  const requestKey = `${queryString}|${reload}`
  useEffect(() => {
    let active = true
    apiRequest(`/listings/${queryString ? `?${queryString}` : ''}`)
      .then((data) => { if (active) setRequest({ key: requestKey, results: data, error: null }) })
      .catch((requestError) => { if (active) setRequest({ key: requestKey, results: null, error: requestError }) })
    return () => { active = false }
  }, [queryString, requestKey])

  const updateParams = useCallback((nextFilters, nextSort = sort, page = '') => {
    const next = new URLSearchParams()
    for (const key of FILTER_KEYS) if (nextFilters[key]) next.set(key, nextFilters[key])
    if (nextSort && nextSort !== 'newest') next.set('sort', nextSort)
    if (page) next.set('page', page)
    setSearchParams(next)
  }, [setSearchParams, sort])

  const submitFilters = (event) => {
    event.preventDefault()
    if (filters.rent_min && filters.rent_max && Number(filters.rent_min) > Number(filters.rent_max)) {
      setValidationError(new Error('Minimum rent must be less than or equal to maximum rent.'))
      return
    }
    setValidationError(null)
    updateParams(filters, sort)
  }

  const clearFilters = () => {
    const cleared = Object.fromEntries(FILTER_KEYS.map((key) => [key, '']))
    setFilters(cleared)
    updateParams(cleared, sort)
  }

  const changeSort = (event) => {
    const nextSort = event.target.value
    updateParams(filters, nextSort)
  }

  const currentPage = searchParams.get('page') || '1'
  const loading = request.key !== requestKey
  const error = validationError || (loading ? null : request.error)
  const results = loading ? null : request.results
  const currentResults = results?.results || []

  return (
    <section className="results-page" aria-labelledby="results-title">
      <header className="page-heading">
        <p className="eyebrow">Public listings</p>
        <h1 id="results-title">Find your next home</h1>
        <p>Browse published homes across Dhaka. You can search without signing in.</p>
      </header>

      <div className="results-layout">
        <aside className="filter-sidebar" aria-label="Listing filters">
          <h2>Refine your search</h2>
          <SearchFilters idPrefix="desktop" value={filters} onChange={setFilters} onSubmit={submitFilters} onClear={clearFilters} />
        </aside>

        <div className="results-content">
          <details className="mobile-filters">
            <summary>Filters</summary>
            <SearchFilters idPrefix="mobile" value={filters} onChange={setFilters} onSubmit={submitFilters} onClear={clearFilters} />
          </details>
          <div className="results-toolbar">
            <p aria-live="polite">{loading ? 'Loading homes…' : `${results?.count ?? 0} homes found`}</p>
            <label className="sort-control" htmlFor="listing-sort">
              <span>Sort by</span>
              <select id="listing-sort" onChange={changeSort} value={sort}>
                <option value="newest">Newest</option>
                <option value="rent_asc">Rent: low to high</option>
                <option value="rent_desc">Rent: high to low</option>
              </select>
            </label>
          </div>

          {loading && <div className="state-panel" role="status"><span className="loading-dot" /> Loading published listings…</div>}
          {!loading && error && <ApiError error={error} onRetry={() => setReload((value) => value + 1)} />}
          {!loading && !error && currentResults.length === 0 && (
            <div className="state-panel">
              <h2>No homes found</h2>
              <p>Try changing or clearing your filters to see more published listings.</p>
              <button className="button button--quiet" onClick={clearFilters} type="button">Clear filters</button>
            </div>
          )}
          {!loading && !error && currentResults.length > 0 && (
            <div className="listing-grid">
              {currentResults.map((listing) => (
                <PublicListingCard
                  key={listing.id}
                  listing={listing}
                />
              ))}
            </div>
          )}

          {!loading && !error && results?.count > 0 && (
            <nav className="pagination" aria-label="Listing pages">
              <button
                className="button button--quiet"
                disabled={!results.previous}
                onClick={() => updateParams(filters, sort, String(Math.max(1, Number(currentPage) - 1)))}
                type="button"
              >Previous</button>
              <span>Page {currentPage}</span>
              <button
                className="button button--quiet"
                disabled={!results.next}
                onClick={() => updateParams(filters, sort, String(Number(currentPage) + 1))}
                type="button"
              >Next</button>
            </nav>
          )}
        </div>
      </div>

    </section>
  )
}
