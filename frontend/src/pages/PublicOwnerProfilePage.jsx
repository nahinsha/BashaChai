import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import ProfileShowcase from '../components/ProfileShowcase.jsx'
import { PublicListingCard } from './ListingsPage.jsx'
import './PublicOwnerProfilePage.css'

function selectionValues(value) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

export default function PublicOwnerProfilePage() {
  const { ownerId } = useParams()
  const [retry, setRetry] = useState(0)
  const [listingRetry, setListingRetry] = useState(0)
  const [pageState, setPageState] = useState({ ownerId: '', page: 1 })
  const [request, setRequest] = useState({ key: '', profile: null, error: null })
  const [listingRequest, setListingRequest] = useState({ key: '', listings: null, error: null })
  const requestKey = `${ownerId}:${retry}`
  const profile = request.key === requestKey ? request.profile : null
  const error = request.key === requestKey ? request.error : null
  const preferredContactMethods = selectionValues(profile?.preferred_contact_methods)
  const preferredContactTimes = selectionValues(profile?.preferred_contact_times)
  const page = pageState.ownerId === ownerId ? pageState.page : 1
  const listingKey = `${profile?.id || ''}:${page}:${listingRetry}`

  useEffect(() => {
    let active = true
    apiRequest(`/owners/${encodeURIComponent(ownerId)}/`)
      .then((data) => { if (active) setRequest({ key: requestKey, profile: data, error: null }) })
      .catch((requestError) => { if (active) setRequest({ key: requestKey, profile: null, error: requestError }) })
    return () => { active = false }
  }, [ownerId, requestKey])

  useEffect(() => {
    if (!profile) return undefined
    let active = true
    const query = new URLSearchParams({ owner_id: String(profile.id), page: String(page) })
    apiRequest(`/listings/?${query.toString()}`)
      .then((listings) => { if (active) setListingRequest({ key: listingKey, listings, error: null }) })
      .catch((listingError) => { if (active) setListingRequest({ key: listingKey, listings: null, error: listingError }) })
    return () => { active = false }
  }, [profile, page, listingKey])

  const loading = request.key !== requestKey
  const listingsLoading = Boolean(profile) && listingRequest.key !== listingKey
  const listings = listingsLoading ? null : listingRequest.listings
  const listingsError = listingsLoading ? null : listingRequest.error

  return (
    <section className="public-owner-page" aria-labelledby="public-owner-page-title">
      <Link className="text-link public-owner-page__back" to="/listings">Back to homes</Link>

      {loading && <div className="state-panel" role="status">Loading owner profile...</div>}
      {!loading && error && (
        <div className="state-panel state-panel--error" role="alert">
          <h1>{error.status === 404 ? 'Owner profile not found' : 'Owner profile could not be loaded'}</h1>
          <p>{error.status === 404
            ? 'This profile is unavailable or is not a Property Owner profile.'
            : error.message || 'Please check your connection and try again.'}</p>
          {error.status !== 404 && <button className="button button--primary public-owner-page__button" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button>}
          <Link className="button button--quiet" to="/listings">Back to homes</Link>
        </div>
      )}
      {!loading && !error && profile && (
        <>
          <ProfileShowcase
            about={profile.about_me}
            className="public-owner-card"
            contactMethods={preferredContactMethods}
            contactTimes={preferredContactTimes}
            phoneNumber={profile.phone_number}
            profession={profile.profession}
            profile={profile}
            roleLabel="Property Owner"
            titleId="public-owner-page-title"
          >
            <a className="button button--primary public-owner-page__button" href="#owner-homes">See this owner's homes</a>
          </ProfileShowcase>

          <section className="public-owner-homes" id="owner-homes" aria-labelledby="owner-homes-title">
            <header className="public-owner-homes__heading">
              <p className="eyebrow">Public listings</p>
              <h2 id="owner-homes-title">Homes shared by this owner</h2>
            </header>

            {listingsLoading && <div className="state-panel" role="status">Loading this owner's homes...</div>}
            {!listingsLoading && listingsError && (
              <div className="state-panel state-panel--error" role="alert">
                <h3>These homes could not be loaded</h3>
                <p>{listingsError.message || 'Please check your connection and try again.'}</p>
                <button className="button button--primary" onClick={() => setListingRetry((value) => value + 1)} type="button">Try again</button>
              </div>
            )}
            {!listingsLoading && !listingsError && listings?.results?.length === 0 && (
              <div className="state-panel">
                <h3>No public homes yet</h3>
                <p>This owner has not shared any publicly available homes.</p>
              </div>
            )}
            {!listingsLoading && !listingsError && listings?.results?.length > 0 && (
              <>
                <div className="listing-grid">
                  {listings.results.map((listing) => <PublicListingCard key={listing.id} listing={listing} />)}
                </div>
                {listings.count > 10 && (
                  <nav className="pagination" aria-label="Owner listing pages">
                    <button className="button button--quiet" disabled={!listings.previous} onClick={() => setPageState({ ownerId, page: Math.max(1, page - 1) })} type="button">Previous</button>
                    <span>Page {page}</span>
                    <button className="button button--quiet" disabled={!listings.next} onClick={() => setPageState({ ownerId, page: page + 1 })} type="button">Next</button>
                  </nav>
                )}
              </>
            )}
          </section>
        </>
      )}
    </section>
  )
}
