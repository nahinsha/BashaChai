import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import PropertyImage from '../components/PropertyImage.jsx'
import ShortlistSaveButton from '../components/ShortlistSaveButton.jsx'
import { useAuth } from '../context/useAuth.js'
import { BEDROOM_COUNTS, LISTING_SEARCH_FILTER_KEYS, PROPERTY_TYPE_OPTIONS } from '../constants/listingOptions.js'
import { getListingDisplayTitle } from '../utils/listingTitle.js'
import './PublicPages.css'

const POPULAR_AREAS = ['Uttara', 'Bashundhara', 'Gulshan', 'Banani', 'Mirpur', 'Dhanmondi', 'Mohakhali']
const PUBLIC_POPULAR_AREAS = ['Uttara', 'Bashundhara', 'Gulshan', 'Banani', 'Mirpur', 'Dhanmondi', 'Mohakhali']
const AVAILABILITY_LABELS = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  NEEDS_RECONFIRMATION: 'Needs reconfirmation',
}

const EMPTY_SEARCH_FILTERS = {
  location: '',
  rent_min: '',
  rent_max: '',
  property_type: '',
  bedrooms: '',
}

function makeSearch(filters, sort, page) {
  const params = new URLSearchParams()
  for (const key of LISTING_SEARCH_FILTER_KEYS) {
    if (filters[key]) params.set(key, filters[key])
  }
  params.set('sort', sort)
  params.set('page', String(page))
  return params.toString()
}

function HomeListingCard({ listing, publicHome = false }) {
  const title = getListingDisplayTitle(listing)
  const availability = listing.availability?.status || ''
  const rent = listing.monthly_rent == null
    ? 'Rent not provided'
    : `\u09F3${Number(listing.monthly_rent).toLocaleString('en-BD')}`

  return (
    <article className={`reference-home__card${publicHome ? ' reference-home__card--public' : ''}`}>
      <div className="reference-home__card-media">
        <Link className="reference-home__card-image-link" to={`/listings/${listing.id}`} aria-label={`View ${title}`}>
          <PropertyImage alt="" className="reference-home__card-image" fallbackClassName="reference-home__card-image reference-home__card-image--empty" src={listing.primary_image_url} />
        </Link>
        {publicHome && (
          <>
            <span className={`reference-home__availability reference-home__availability--${availability.toLowerCase()}`}>
              <i aria-hidden="true" />
              {AVAILABILITY_LABELS[availability] || 'Availability unknown'}
            </span>
            <div className="reference-home__card-save"><ShortlistSaveButton listingId={listing.id} /></div>
          </>
        )}
      </div>
      <div className="reference-home__card-body">
        <p className="reference-home__rent">{rent}<small> / month</small></p>
        <h3><Link to={`/listings/${listing.id}`}>{title}</Link></h3>
        <p className="reference-home__location">
          {publicHome && <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>}
          {listing.location || 'Location not provided'}
        </p>
        <p className="reference-home__facts">
          {publicHome ? (
            <>
              <span className="reference-home__fact-item"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 19v-9m18 9v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2m0 2h18M7 11V7a2 2 0 0 1 2-2h3v6m0-4h5a2 2 0 0 1 2 2v2"/></svg>{listing.bedrooms == null ? 'Bedrooms unknown' : `${listing.bedrooms} bed`}</span>
              <span className="reference-home__fact-item"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm10 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 20c0-3.3 2-5 5-5s5 1.7 5 5m0 0c0-3.3 2-5 5-5s5 1.7 5 5M12 4v7m-3-3 3 3 3-3"/></svg>{listing.bathrooms == null ? 'Bathrooms unknown' : `${listing.bathrooms} bath`}</span>
              <span className="reference-home__fact-item"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 21h18M5 21V8h14v13M8 8V4h8v4m-7 4h1m4 0h1m-6 4h1m4 0h1m-6 5v-2h4v2"/></svg>{listing.property_type ? listing.property_type.replace(/\s*\/\s*/, ' | ') : 'Type not provided'}</span>
            </>
          ) : (
            <>
              {listing.bedrooms == null ? 'Bedrooms unknown' : `${listing.bedrooms} bed`}
              <span aria-hidden="true">{'\u00b7'}</span>
              {listing.bathrooms == null ? 'Bathrooms unknown' : `${listing.bathrooms} bath`}
              <span aria-hidden="true">{'\u00b7'}</span>
              {listing.property_type || 'Type not provided'}
            </>
          )}
        </p>
        {publicHome ? (
          <Link className="reference-home__view-details" to={`/listings/${listing.id}`}>View Details <span aria-hidden="true">{'\u2192'}</span></Link>
        ) : (
          <div className="reference-home__card-footer">
            <span className={`reference-home__availability reference-home__availability--${availability.toLowerCase()}`}>
              <i aria-hidden="true" />
              {AVAILABILITY_LABELS[availability] || 'Availability unknown'}
            </span>
            <ShortlistSaveButton listingId={listing.id} />
          </div>
        )}
      </div>
    </article>
  )
}

export default function HomePage({ authenticatedDashboard = false, publicView = false }) {
  const [filters, setFilters] = useState(EMPTY_SEARCH_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_SEARCH_FILTERS)
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [retry, setRetry] = useState(0)
  const [searchError, setSearchError] = useState('')
  const [listingRequest, setListingRequest] = useState({ key: '', data: null, error: null })
  const { status } = useAuth()
  const authenticated = status === 'authenticated'
  const dashboardView = authenticatedDashboard || (authenticated && !publicView)
  const query = makeSearch(appliedFilters, sort, page)
  const requestKey = `${query}|${retry}`

  useEffect(() => {
    let active = true
    apiRequest(`/listings/?${query}`)
      .then((data) => {
        if (!active) return
        setListingRequest({ key: requestKey, data, error: null })
        if (page === 1 && data.results?.length) setPageSize(data.results.length)
      })
      .catch((error) => { if (active) setListingRequest({ key: requestKey, data: null, error }) })
    return () => { active = false }
  }, [page, query, requestKey])

  const submitSearch = (event) => {
    event.preventDefault()
    if (filters.rent_min && filters.rent_max && Number(filters.rent_min) > Number(filters.rent_max)) {
      setSearchError('Minimum rent must be less than or equal to maximum rent.')
      return
    }
    setSearchError('')
    setAppliedFilters(filters)
    setPage(1)
  }

  const setArea = (area) => {
    const nextFilters = { ...appliedFilters, location: appliedFilters.location === area ? '' : area }
    setFilters(nextFilters)
    setAppliedFilters(nextFilters)
    setSearchError('')
    setPage(1)
  }

  const loading = listingRequest.key !== requestKey
  const results = loading ? null : listingRequest.data
  const error = loading ? null : listingRequest.error
  const listings = results?.results || []
  const pageCount = Math.max(1, Math.ceil((results?.count || 0) / pageSize))
  const hasSearch = LISTING_SEARCH_FILTER_KEYS.some((key) => Boolean(appliedFilters[key]))
  const searchForm = (
    <form className="reference-home__search" id={!dashboardView ? 'public-home-search' : undefined} onSubmit={submitSearch}>
      <label className="reference-home__field reference-home__field--area" htmlFor="home-area">
        <span>{!dashboardView && <svg aria-hidden="true" className="reference-home__field-icon" viewBox="0 0 24 24"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>}Location</span>
        <input autoComplete="off" id="home-area" onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))} placeholder={dashboardView ? 'e.g. Mirpur, Dhanmondi, Uttara' : 'e.g. Mirpur, Dhanmondi'} value={filters.location} />
      </label>
      <div className="reference-home__field reference-home__field--rent">
        <span>{!dashboardView && <svg aria-hidden="true" className="reference-home__field-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M14.8 8.5c-.6-.7-1.5-1-2.7-1-1.4 0-2.3.7-2.3 1.7 0 2.8 5.4 1.1 5.4 4 0 1.2-1.1 2-2.8 2-1.2 0-2.3-.4-3.1-1.2M12 5.5v13"/></svg>}Monthly Rent (BDT)</span>
        <div className="rent-range">
          <label className="visually-hidden" htmlFor="home-rent-min">Minimum monthly rent</label>
          <input id="home-rent-min" min="0" onChange={(event) => setFilters((current) => ({ ...current, rent_min: event.target.value }))} placeholder={dashboardView ? 'Minimum' : 'Min'} step="any" type="number" value={filters.rent_min} />
          <span className="rent-range__separator" aria-hidden="true">to</span>
          <label className="visually-hidden" htmlFor="home-rent-max">Maximum monthly rent</label>
          <input aria-describedby="home-rent-error" inputMode="numeric" id="home-rent-max" min="0" onChange={(event) => setFilters((current) => ({ ...current, rent_max: event.target.value }))} placeholder={dashboardView ? 'Maximum' : 'Max'} type="number" value={filters.rent_max} />
        </div>
        <span className="reference-home__field-error" id="home-rent-error" role="alert">{filters.rent_max && Number(filters.rent_max) < 0 ? 'Rent cannot be negative.' : ''}</span>
      </div>
      <label className="reference-home__field" htmlFor="home-property-type">
        <span>{!dashboardView && <svg aria-hidden="true" className="reference-home__field-icon" viewBox="0 0 24 24"><path d="m3 11 9-7 9 7M5 10v10h14V10M9 20v-6h6v6"/></svg>}Property Type</span>
        <select id="home-property-type" onChange={(event) => setFilters((current) => ({ ...current, property_type: event.target.value }))} value={filters.property_type}>
          <option value="">{dashboardView ? 'Any property type' : 'Any type'}</option>
          {PROPERTY_TYPE_OPTIONS.map((propertyType) => <option key={propertyType} value={propertyType}>{propertyType}</option>)}
        </select>
      </label>
      <label className="reference-home__field" htmlFor="home-bedrooms">
        <span>{!dashboardView && <svg aria-hidden="true" className="reference-home__field-icon" viewBox="0 0 24 24"><path d="M3 19v-9m18 9v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2m0 2h18M7 11V7a2 2 0 0 1 2-2h3v6m0-4h5a2 2 0 0 1 2 2v2"/></svg>}Bedrooms</span>
        <select id="home-bedrooms" onChange={(event) => setFilters((current) => ({ ...current, bedrooms: event.target.value }))} value={filters.bedrooms}>
          <option value="">Any number</option>
          {BEDROOM_COUNTS.map((bedroomCount) => <option key={bedroomCount} value={bedroomCount}>{bedroomCount}</option>)}
        </select>
      </label>
      <button className="button button--primary" type="submit">
        {!dashboardView && <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>}
        {dashboardView ? 'Search homes' : 'Search'}
      </button>
    </form>
  )
  const popularAreaButtons = (
    <>
      {!dashboardView && <button aria-pressed={!appliedFilters.location} className="reference-home__chip" onClick={() => setArea('')} type="button">All</button>}
      {(dashboardView ? POPULAR_AREAS : PUBLIC_POPULAR_AREAS).map((area) => (
        <button aria-pressed={appliedFilters.location === area} className="reference-home__chip" key={area} onClick={() => setArea(area)} type="button">{area}</button>
      ))}
    </>
  )

  return (
    <div className={`home-page reference-home${dashboardView ? ' reference-home--dashboard' : ' reference-home--public'}`}>
      <div className="reference-home__layout">
        <div className="reference-home__main" id="top">
          <section className="reference-home__hero" aria-labelledby="reference-home-title">
            {!dashboardView && <p className="reference-home__location-badge"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>Dhaka, Bangladesh</p>}
            <h1 id="reference-home-title">Find a rental home in Dhaka</h1>
            <p className="reference-home__subtitle">{dashboardView ? 'Search by area and rent, look at photos and details, then shortlist, compare and message owners once you have an account.' : 'Find better. Compare smarter. Visit less.'}</p>
            {dashboardView && <>{searchForm}{searchError && <p className="reference-home__search-error" role="alert">{searchError}</p>}<div className="reference-home__chips" role="group" aria-label="Popular areas">{popularAreaButtons}</div></>}
          </section>

          {!dashboardView && <>{searchForm}{searchError && <p className="reference-home__search-error" role="alert">{searchError}</p>}<div className="reference-home__chips-row"><span className="reference-home__chips-label"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M13.7 2.5c.5 3.3-1 4.7-2.1 5.6C11.3 5.5 9.9 4 8.4 2.8c.2 3.9-1 5.7-2.5 7.6A7.3 7.3 0 1 0 19 15.2c0-4-2.1-7.7-5.3-12.7Z"/></svg>Popular Areas:</span><div className="reference-home__chips" role="group" aria-label="Popular areas">{popularAreaButtons}</div></div></>}

          <section className="reference-home__listings" aria-labelledby="home-results-title">
            <div className="reference-home__listing-layout">
              <div className="reference-home__listing-results">
                <div className="reference-home__results-bar">
                  <h2 id="home-results-title">{hasSearch ? 'Search results' : dashboardView ? 'Homes to browse' : 'Available Homes'}</h2>
                  <label className="reference-home__sort" htmlFor="home-sort">
                    <span>{dashboardView ? 'Sort by' : 'Sort by:'}</span>
                    <select id="home-sort" onChange={(event) => { setSort(event.target.value); setPage(1) }} value={sort}>
                      <option value="newest">Newest first</option>
                      <option value="rent_asc">Rent: low to high</option>
                      <option value="rent_desc">Rent: high to low</option>
                    </select>
                  </label>
                </div>
                {!dashboardView && <div className="reference-home__results-meta">
                  {!loading && !error && <p className="reference-home__result-count" aria-live="polite">{results?.count || 0} {(results?.count || 0) === 1 ? 'home' : 'homes'} found · page {page} of {pageCount}</p>}

                </div>}
            {loading && <div aria-live="polite" className="reference-home__grid" role="status">{[0, 1, 2, 3].map((item) => <div className="reference-home__skeleton" key={item} />)}</div>}
            {!loading && error && (
              <div className="reference-home__error" role="alert">
                <h3>We couldn’t load homes</h3>
                <p>Check your connection and try again. Your search is kept.</p>
                <button className="button button--primary" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button>
              </div>
            )}
            {!loading && !error && listings.length === 0 && (
              <div className="reference-home__empty">
                <h3>No homes match this search</h3>
                <p>Try a wider rent limit, a different bedroom count, or another area.</p>
                <button className="button button--quiet" onClick={() => {
                  const cleared = { ...EMPTY_SEARCH_FILTERS }
                  setFilters(cleared)
                  setAppliedFilters(cleared)
                  setSearchError('')
                  setPage(1)
                }} type="button">Clear search</button>
              </div>
            )}
            {!loading && !error && listings.length > 0 && (
              <>
                {dashboardView && <p className="reference-home__result-count" aria-live="polite">{results.count} {results.count === 1 ? 'home' : 'homes'} found · page {page} of {pageCount}</p>}
                <div className="reference-home__grid">
                  {listings.map((listing) => <HomeListingCard key={listing.id} listing={listing} publicHome={!dashboardView} />)}
                </div>
                {pageCount > 1 && (
                  <nav className="reference-home__pagination" aria-label="Listing pages">
                    {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                      <button aria-current={page === pageNumber ? 'page' : undefined} key={pageNumber} onClick={() => setPage(pageNumber)} type="button">{pageNumber}</button>
                    ))}
                  </nav>
                )}
              </>
            )}
              </div>
              {!dashboardView && <aside aria-label="About BasaChai">
                <section className="reference-home__promo reference-home__promo--why">
                  <h2>Why Choose BasaChai?</h2>
                  <ul>
                    <li>Find better homes<br/>in Dhaka</li>
                    <li>Compare easily</li>
                    <li>Visit less</li>
                  </ul>
                  <svg aria-hidden="true" className="reference-home__promo-art" viewBox="0 0 360 100">
                    <path d="M0 98V75l18-12 16 10 16-20 18 16 18-24 20 20 18-13 20 17 17-26 20 18 17-15 20 17 22-22 20 17 20-23 22 19 17-13 20 13v34Z" fill="#bde8cb" opacity=".62"/>
                    <path d="M238 98V64l27-22 27 22v34m-43 0V70h32v28m-22-16h12m-5-16v60m18-22 22-20 20 5-7 20-35 17m20-31c-1-10 5-17 17-22" fill="none" stroke="#1aa274" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5"/>
                  </svg>
                </section>
                <section className="reference-home__promo reference-home__promo--owner">
                  <h2>List Your Property</h2>
                  <p>Reach genuine seekers<br/>across Dhaka.</p>
                  <Link to="/register">Add Listing <span aria-hidden="true">{'\u2192'}</span></Link>
                  <svg aria-hidden="true" className="reference-home__promo-art" viewBox="0 0 360 100">
                    <path d="M205 99V63l18-12 17 12v36m-35-25h35m-18-12v37m50 0V31l24-14 24 14v68m-45-54h42m-42 15h42m-42 15h42m-25-44v68m43 0V51l17-11 18 11v48m-31-28h31m-16-20v48" fill="none" stroke="#d8f5e2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3"/>
                    <path d="M180 99h180" stroke="#8de0b7" strokeWidth="4"/>
                  </svg>
                </section>
              </aside>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
