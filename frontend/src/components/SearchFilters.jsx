
import { BEDROOM_COUNTS, PROPERTY_TYPE_OPTIONS } from '../constants/listingOptions.js'

const AVAILABILITY_OPTIONS = [
  ['AVAILABLE', 'Available'],
  ['UNAVAILABLE', 'Unavailable'],
  ['NEEDS_RECONFIRMATION', 'Needs Reconfirmation'],
]

export default function SearchFilters({
  idPrefix,
  value,
  onChange,
  onSubmit,
  onClear,
  includeAvailability = false,
}) {
  const setField = (field) => (event) => {
    onChange((current) => ({ ...current, [field]: event.target.value }))
  }

  return (
    <form className="search-form" onSubmit={onSubmit}>
      <div className="search-form__grid">
        <label className="form-field form-field--location" htmlFor={`${idPrefix}-location`}>
          <span>Location</span>
          <input
            autoComplete="off"
            id={`${idPrefix}-location`}
            name="location"
            onChange={setField('location')}
            placeholder="Area or neighbourhood"
            type="search"
            value={value.location}
          />
        </label>

        <div className="form-field form-field--rent">
          <span>Monthly Rent (BDT)</span>
          <div className="rent-range">
            <label className="visually-hidden" htmlFor={`${idPrefix}-rent-min`}>
              Minimum monthly rent
            </label>
            <input
              id={`${idPrefix}-rent-min`}
              min="0"
              name="rent_min"
              onChange={setField('rent_min')}
              placeholder="Minimum"
              step="any"
              type="number"
              value={value.rent_min}
            />
            <span className="rent-range__separator" aria-hidden="true">to</span>
            <label className="visually-hidden" htmlFor={`${idPrefix}-rent-max`}>
              Maximum monthly rent
            </label>
            <input
              id={`${idPrefix}-rent-max`}
              min="0"
              name="rent_max"
              onChange={setField('rent_max')}
              placeholder="Maximum"
              step="any"
              type="number"
              value={value.rent_max}
            />
          </div>
        </div>

        <label className="form-field" htmlFor={`${idPrefix}-property-type`}>
          <span>Property Type</span>
          <select
            id={`${idPrefix}-property-type`}
            name="property_type"
            onChange={setField('property_type')}
            value={value.property_type}
          >
            <option value="">Any property type</option>
            {PROPERTY_TYPE_OPTIONS.map((propertyType) => (
              <option key={propertyType} value={propertyType}>{propertyType}</option>
            ))}
          </select>
        </label>

        <label className="form-field" htmlFor={`${idPrefix}-bedrooms`}>
          <span>Bedrooms</span>
          <select
            id={`${idPrefix}-bedrooms`}
            name="bedrooms"
            onChange={setField('bedrooms')}
            value={value.bedrooms}
          >
            <option value="">Any number</option>
            {BEDROOM_COUNTS.map((bedroomCount) => (
              <option key={bedroomCount} value={bedroomCount}>{bedroomCount}</option>
            ))}
          </select>
        </label>

        {includeAvailability && (
          <label className="form-field" htmlFor={`${idPrefix}-availability`}>
            <span>Availability</span>
            <select
              id={`${idPrefix}-availability`}
              name="availability"
              onChange={setField('availability')}
              value={value.availability}
            >
              <option value="">Any availability</option>
              {AVAILABILITY_OPTIONS.map(([status, label]) => (
                <option key={status} value={status}>{label}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="search-form__actions">
        {onClear && (
          <button className="button button--quiet" onClick={onClear} type="button">
            Clear filters
          </button>
        )}
        <button className="button button--primary" type="submit">Search homes</button>
      </div>
    </form>
  )
}
