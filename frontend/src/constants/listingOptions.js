export const PROPERTY_TYPE_OPTIONS = [
  'Flat / Apartment',
  'Duplex',
  'Sublet',
  'Mess / Shared Accommodation',
  'Office',
  'Shop/Commercial Space',
]

export const BEDROOM_COUNTS = Array.from({ length: 11 }, (_, count) => String(count))

export const LISTING_SEARCH_FILTER_KEYS = [
  'location',
  'rent_min',
  'rent_max',
  'property_type',
  'bedrooms',
]
