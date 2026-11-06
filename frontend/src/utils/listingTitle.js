export function getListingDisplayTitle(listing) {
  const title = typeof listing?.title === 'string' ? listing.title : ''
  if (title.trim()) return title

  const location = typeof listing?.location === 'string' ? listing.location.trim() : ''
  return location ? `Home in ${location}` : 'Rental Home'
}
