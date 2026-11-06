import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/useAuth.js'
import UserAvatar from '../components/UserAvatar.jsx'
import ProfileShowcase from '../components/ProfileShowcase.jsx'
import './ProfileManagementPage.css'

const PUBLIC_ROLES = [
  { value: 'HOME_SEEKER', label: 'Home Seeker' },
  { value: 'PROPERTY_OWNER', label: 'Property Owner' },
]

const PROFILE_PREFERENCES_KEY = 'basachai.profile-preferences'
const DEFAULT_PREFERENCES = {
  areas: ['Mirpur', 'Dhanmondi'],
  minBudget: '',
  maxBudget: '',
  bedrooms: '2',
  newMessages: true,
  viewingUpdates: true,
  matchingHomes: true,
  seekerCancelledViewing: true,
  weeklyListingSummary: false,
}

function ownerProfileValues(profile = {}) {
  return {
    age: profile.age == null ? '' : String(profile.age),
    profession: profile.profession || '',
    aboutMe: profile.about_me || '',
    phoneNumber: profile.phone_number || '',
    showPhonePublicly: Boolean(profile.show_phone_number_publicly),
    showAboutMePublicly: Boolean(profile.show_owner_about_me_publicly),
    showProfessionPublicly: Boolean(profile.show_owner_profession_publicly),
    showContactPreferencesPublicly: Boolean(profile.show_owner_contact_preferences_publicly),
    preferredContactMethods: selectionValues(profile.preferred_contact_methods),
    preferredContactTimes: selectionValues(profile.preferred_contact_times),
  }
}

function seekerProfileValues(profile = {}) {
  return {
    age: profile.seeker_age == null ? '' : String(profile.seeker_age),
    profession: profile.seeker_profession || '',
    aboutMe: profile.seeker_about_me || '',
    phoneNumber: profile.seeker_phone_number || '',
    presentAddress: profile.seeker_present_address || '',
    familyMembers: profile.seeker_family_members || '',
    permanentAddress: profile.seeker_permanent_address || '',
    showAgePublicly: Boolean(profile.show_seeker_age_publicly),
    showProfessionPublicly: Boolean(profile.show_seeker_profession_publicly),
    showAboutMePublicly: Boolean(profile.show_seeker_about_me_publicly),
    showPhoneNumberPublicly: Boolean(profile.show_seeker_phone_number_publicly),
    showPresentAddressPublicly: Boolean(profile.show_seeker_present_address_publicly),
    showFamilyMembersPublicly: Boolean(profile.show_seeker_family_members_publicly),
    showPermanentAddressPublicly: Boolean(profile.show_seeker_permanent_address_publicly),
  }
}

function selectionValues(value) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function sameSelections(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value))
}

function toggleSelection(values, value) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

function loadPreferences(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null')
    return saved && typeof saved === 'object'
      ? { ...DEFAULT_PREFERENCES, ...saved }
      : DEFAULT_PREFERENCES
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function fieldError(error, field) {
  const value = error.fields?.[field]
  return Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : ''
}

export default function ProfileManagementPage() {
  const { updateUser, user: currentUser } = useAuth()
  const [retry, setRetry] = useState(0)
  const [request, setRequest] = useState({ key: '', profile: null, error: null })
  const [fullName, setFullName] = useState(null)
  const [ownerFields, setOwnerFields] = useState(ownerProfileValues)
  const [seekerFields, setSeekerFields] = useState(seekerProfileValues)
  const [roleToAdd, setRoleToAdd] = useState('')
  const [saving, setSaving] = useState(false)
  const [pictureFile, setPictureFile] = useState(null)
  const [pictureBusy, setPictureBusy] = useState(false)
  const [pictureError, setPictureError] = useState('')
  const [pictureNotice, setPictureNotice] = useState('')
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const preferencesKey = `${PROFILE_PREFERENCES_KEY}.${currentUser?.id || 'current'}`
  const [preferences, setPreferences] = useState(() => loadPreferences(preferencesKey))
  const requestKey = String(retry)

  useEffect(() => {
    let active = true
    apiRequest('/me/', { auth: true })
      .then((profile) => {
        if (active) {
          setRequest({ key: requestKey, profile, error: null })
          setOwnerFields(ownerProfileValues(profile))
          setSeekerFields(seekerProfileValues(profile))
        }
      })
      .catch((error) => { if (active) setRequest({ key: requestKey, profile: null, error }) })
    return () => { active = false }
  }, [requestKey])

  const loading = request.key !== requestKey
  const profile = loading ? null : request.profile
  const loadError = loading ? null : request.error
  const assignedRoles = profile?.roles || []
  const isOwner = assignedRoles.includes('PROPERTY_OWNER')
  const isSeeker = assignedRoles.includes('HOME_SEEKER')
  const rolesToAdd = PUBLIC_ROLES.filter((role) => !assignedRoles.includes(role.value))
  const ownerFieldsChanged = Boolean(profile && isOwner && (
    ownerFields.age !== (profile.age == null ? '' : String(profile.age))
    || ownerFields.profession !== (profile.profession || '')
    || ownerFields.aboutMe !== (profile.about_me || '')
    || ownerFields.phoneNumber !== (profile.phone_number || '')
    || ownerFields.showPhonePublicly !== Boolean(profile.show_phone_number_publicly)
    || ownerFields.showAboutMePublicly !== Boolean(profile.show_owner_about_me_publicly)
    || ownerFields.showProfessionPublicly !== Boolean(profile.show_owner_profession_publicly)
    || ownerFields.showContactPreferencesPublicly !== Boolean(profile.show_owner_contact_preferences_publicly)
    || !sameSelections(ownerFields.preferredContactMethods, selectionValues(profile.preferred_contact_methods))
    || !sameSelections(ownerFields.preferredContactTimes, selectionValues(profile.preferred_contact_times))
  ))
  const seekerFieldsChanged = Boolean(profile && isSeeker && (
    seekerFields.age !== (profile.seeker_age == null ? '' : String(profile.seeker_age))
    || seekerFields.profession !== (profile.seeker_profession || '')
    || seekerFields.aboutMe !== (profile.seeker_about_me || '')
    || seekerFields.phoneNumber !== (profile.seeker_phone_number || '')
    || seekerFields.presentAddress !== (profile.seeker_present_address || '')
    || seekerFields.familyMembers !== (profile.seeker_family_members || '')
    || seekerFields.permanentAddress !== (profile.seeker_permanent_address || '')
    || seekerFields.showAgePublicly !== Boolean(profile.show_seeker_age_publicly)
    || seekerFields.showProfessionPublicly !== Boolean(profile.show_seeker_profession_publicly)
    || seekerFields.showAboutMePublicly !== Boolean(profile.show_seeker_about_me_publicly)
    || seekerFields.showPhoneNumberPublicly !== Boolean(profile.show_seeker_phone_number_publicly)
    || seekerFields.showPresentAddressPublicly !== Boolean(profile.show_seeker_present_address_publicly)
    || seekerFields.showFamilyMembersPublicly !== Boolean(profile.show_seeker_family_members_publicly)
    || seekerFields.showPermanentAddressPublicly !== Boolean(profile.show_seeker_permanent_address_publicly)
  ))
  const profileChanged = Boolean(profile && (
    String(fullName ?? profile.full_name).trim() !== profile.full_name || roleToAdd || ownerFieldsChanged || seekerFieldsChanged
  ))
  const seekerStrengthSteps = [
    Boolean(profile?.profile_picture_url),
    Boolean(profile?.full_name),
    Boolean(profile?.email),
    Boolean(preferences.minBudget && preferences.maxBudget),
    Boolean(preferences.areas.length && preferences.bedrooms),
  ]
  const ownerStrengthSteps = [
    Boolean(profile?.profile_picture_url),
    Boolean(profile?.full_name),
    Boolean(profile?.email),
    Boolean(ownerFields.phoneNumber),
    Boolean(ownerFields.aboutMe),
  ]
  const profileStrengthSteps = isOwner ? ownerStrengthSteps : seekerStrengthSteps
  const profileStrength = Math.round(profileStrengthSteps.filter(Boolean).length / profileStrengthSteps.length * 100)

  const updatePreferences = (changes) => {
    setPreferences((current) => {
      const updated = { ...current, ...changes }
      try {
        localStorage.setItem(preferencesKey, JSON.stringify(updated))
      } catch {
        // Keep the current session usable when browser storage is unavailable.
      }
      return updated
    })
  }

  const discardProfileChanges = () => {
    setFullName(profile?.full_name ?? '')
    setRoleToAdd('')
    setOwnerFields(ownerProfileValues(profile))
    setSeekerFields(seekerProfileValues(profile))
    setSaveError('')
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    if (!profile || saving) return
    const nextName = String(fullName ?? profile.full_name).trim()
    if (!nextName) {
      setSaveError('Enter your name to continue.')
      return
    }

    const changes = {}
    if (nextName !== profile.full_name) changes.full_name = nextName
    if (roleToAdd) changes.add_role = roleToAdd
    if (isOwner) {
      const normalizedAge = ownerFields.age === '' ? null : Number(ownerFields.age)
      if (normalizedAge !== (profile.age ?? null)) changes.age = normalizedAge
      if (ownerFields.profession !== (profile.profession || '')) changes.profession = ownerFields.profession
      if (ownerFields.aboutMe !== (profile.about_me || '')) changes.about_me = ownerFields.aboutMe
      if (ownerFields.phoneNumber !== (profile.phone_number || '')) changes.phone_number = ownerFields.phoneNumber
      if (ownerFields.showPhonePublicly !== Boolean(profile.show_phone_number_publicly)) {
        changes.show_phone_number_publicly = ownerFields.showPhonePublicly
      }
      if (ownerFields.showAboutMePublicly !== Boolean(profile.show_owner_about_me_publicly)) {
        changes.show_owner_about_me_publicly = ownerFields.showAboutMePublicly
      }
      if (ownerFields.showProfessionPublicly !== Boolean(profile.show_owner_profession_publicly)) {
        changes.show_owner_profession_publicly = ownerFields.showProfessionPublicly
      }
      if (ownerFields.showContactPreferencesPublicly !== Boolean(profile.show_owner_contact_preferences_publicly)) {
        changes.show_owner_contact_preferences_publicly = ownerFields.showContactPreferencesPublicly
      }
      // Include both optional selections on every owner profile save. This also
      // sends an empty value when the owner clears a previously selected option.
      changes.preferred_contact_methods = ownerFields.preferredContactMethods
      changes.preferred_contact_times = ownerFields.preferredContactTimes
    }
    if (isSeeker) {
      const normalizedSeekerAge = seekerFields.age === '' ? null : Number(seekerFields.age)
      if (normalizedSeekerAge !== (profile.seeker_age ?? null)) changes.seeker_age = normalizedSeekerAge
      if (seekerFields.profession !== (profile.seeker_profession || '')) changes.seeker_profession = seekerFields.profession
      if (seekerFields.aboutMe !== (profile.seeker_about_me || '')) changes.seeker_about_me = seekerFields.aboutMe
      if (seekerFields.phoneNumber !== (profile.seeker_phone_number || '')) changes.seeker_phone_number = seekerFields.phoneNumber
      if (seekerFields.presentAddress !== (profile.seeker_present_address || '')) changes.seeker_present_address = seekerFields.presentAddress
      if (seekerFields.familyMembers !== (profile.seeker_family_members || '')) changes.seeker_family_members = seekerFields.familyMembers
      if (seekerFields.permanentAddress !== (profile.seeker_permanent_address || '')) changes.seeker_permanent_address = seekerFields.permanentAddress
      if (seekerFields.showAgePublicly !== Boolean(profile.show_seeker_age_publicly)) {
        changes.show_seeker_age_publicly = seekerFields.showAgePublicly
      }
      if (seekerFields.showProfessionPublicly !== Boolean(profile.show_seeker_profession_publicly)) {
        changes.show_seeker_profession_publicly = seekerFields.showProfessionPublicly
      }
      if (seekerFields.showAboutMePublicly !== Boolean(profile.show_seeker_about_me_publicly)) {
        changes.show_seeker_about_me_publicly = seekerFields.showAboutMePublicly
      }
      if (seekerFields.showPhoneNumberPublicly !== Boolean(profile.show_seeker_phone_number_publicly)) {
        changes.show_seeker_phone_number_publicly = seekerFields.showPhoneNumberPublicly
      }
      if (seekerFields.showPresentAddressPublicly !== Boolean(profile.show_seeker_present_address_publicly)) {
        changes.show_seeker_present_address_publicly = seekerFields.showPresentAddressPublicly
      }
      if (seekerFields.showFamilyMembersPublicly !== Boolean(profile.show_seeker_family_members_publicly)) {
        changes.show_seeker_family_members_publicly = seekerFields.showFamilyMembersPublicly
      }
      if (seekerFields.showPermanentAddressPublicly !== Boolean(profile.show_seeker_permanent_address_publicly)) {
        changes.show_seeker_permanent_address_publicly = seekerFields.showPermanentAddressPublicly
      }
    }
    if (Object.keys(changes).length === 0) {
      setSaveError('Make a change before saving.')
      return
    }

    setSaving(true)
    setSaveError('')
    setNotice('')
    try {
      const updatedProfile = await apiRequest('/me/', {
        method: 'PATCH',
        body: changes,
        auth: true,
      })
      setRequest({ key: requestKey, profile: updatedProfile, error: null })
      setFullName(updatedProfile.full_name)
      setOwnerFields(ownerProfileValues(updatedProfile))
      setSeekerFields(seekerProfileValues(updatedProfile))
      setRoleToAdd('')
      updateUser(updatedProfile)
      setNotice('Your profile has been updated.')
    } catch (error) {
      setSaveError(
        fieldError(error, 'full_name')
        || fieldError(error, 'add_role')
        || error.message
        || 'Your profile could not be updated. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  const updatePictureProfile = (updatedProfile) => {
    setRequest({ key: requestKey, profile: updatedProfile, error: null })
    updateUser(updatedProfile)
  }

  const uploadProfilePicture = async () => {
    if (!pictureFile || pictureBusy) return
    setPictureBusy(true)
    setPictureError('')
    setPictureNotice('')
    const body = new FormData()
    body.append('image', pictureFile)
    try {
      const updatedProfile = await apiRequest('/me/profile-picture/', {
        method: 'POST',
        body,
        auth: true,
      })
      updatePictureProfile(updatedProfile)
      setPictureFile(null)
      setPictureNotice('Your profile picture has been updated.')
    } catch (error) {
      setPictureError(fieldError(error, 'image') || error.message || 'Your profile picture could not be uploaded.')
    } finally {
      setPictureBusy(false)
    }
  }

  const removeProfilePicture = async () => {
    if (pictureBusy) return
    setPictureBusy(true)
    setPictureError('')
    setPictureNotice('')
    try {
      const updatedProfile = await apiRequest('/me/profile-picture/', {
        method: 'DELETE',
        auth: true,
      })
      updatePictureProfile(updatedProfile)
      setPictureFile(null)
      setPictureNotice('Your profile picture has been removed.')
    } catch (error) {
      setPictureError(error.message || 'Your profile picture could not be removed.')
    } finally {
      setPictureBusy(false)
    }
  }

  return (
    <section className={`profile-page${isOwner ? ' profile-page--owner' : ''}`} aria-label="Profile management">
      {loading && <div className="state-panel" role="status">Loading your profile...</div>}
      {!loading && loadError && (
        <div className="state-panel state-panel--error" role="alert">
          <h2>Your profile could not be loaded</h2>
          <p>{loadError.message || 'Please check your connection and try again.'}</p>
          <button className="button button--primary profile-save-button" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button>
        </div>
      )}
      {!loading && !loadError && profile && (
        <form className="profile-editor" onSubmit={saveProfile}>
          <div className="profile-columns">
            <div className="profile-column profile-column--main">
              <section className="profile-summary" aria-label="Your profile summary">
                <UserAvatar authenticated className="profile-avatar" size="large" user={profile} />
                <div className="profile-summary__identity">
                  <h2>{profile.full_name}</h2>
                  <div className="profile-summary__meta">
                    {isOwner
                      ? <span className="profile-role">Property Owner</span>
                      : assignedRoles.map((role) => (
                        <span className="profile-role" key={role}>
                          {PUBLIC_ROLES.find((item) => item.value === role)?.label || role}
                        </span>
                      ))}
                    <span>{profile.email}</span>
                  </div>
                </div>
                <div className="profile-picture-control__actions">
                  <label className="profile-button profile-button--outline" htmlFor="profile-picture-file">
                    {pictureBusy ? 'Uploading…' : 'Upload new'}
                    <input
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      disabled={pictureBusy}
                      id="profile-picture-file"
                      onChange={(event) => {
                        setPictureError('')
                        setPictureNotice('')
                        setPictureFile(event.target.files?.[0] || null)
                      }}
                      type="file"
                    />
                  </label>
                  {pictureFile && <button className="profile-button profile-button--outline" disabled={pictureBusy} onClick={uploadProfilePicture} type="button">Save image</button>}
                  {profile.profile_picture_url && <button className="profile-button profile-button--remove" disabled={pictureBusy} onClick={removeProfilePicture} type="button">Remove</button>}
                </div>
                <p className="profile-summary__hint">{isOwner ? 'A clear face photo builds trust with seekers. JPG, PNG or WebP, up to 5 MB. Shared by all your roles.' : 'JPG, PNG or WebP, up to 5 MB. Shared by your Home Seeker and Property Owner roles.'}</p>
                {pictureNotice && <p className="profile-message profile-message--success" role="status">{pictureNotice}</p>}
                {pictureError && <p className="profile-message profile-message--error" role="alert">{pictureError}</p>}
              </section>

              <section className="profile-panel profile-details" aria-labelledby="profile-details-title">
                <h2 id="profile-details-title">{isOwner ? 'Owner details' : 'Personal details'}</h2>
                <label className="profile-field" htmlFor="profile-full-name">
                  <span>Full name</span>
                  <input autoComplete="name" id="profile-full-name" maxLength={150} onChange={(event) => setFullName(event.target.value)} required value={fullName ?? profile.full_name} />
                </label>
                <div className="profile-field">
                  <span>Sign-in email</span>
                  <p className="profile-readonly-value"><span>{profile.email}</span><span aria-hidden="true">⌑</span></p>
                  <small>Your private account email. It can’t be changed here.</small>
                </div>
                {isOwner && (
                  <>
                    <label className="profile-field" htmlFor="owner-phone-number">
                      <span>Contact phone <em>Optional</em></span>
                      <input autoComplete="tel" id="owner-phone-number" maxLength={30} onChange={(event) => setOwnerFields((current) => ({ ...current, phoneNumber: event.target.value }))} placeholder="+880 1XXX-XXXXXX" type="tel" value={ownerFields.phoneNumber} />
                      <small>Seekers can see it on your public owner profile only when you enable public visibility.</small>
                    </label>
                    <label className="profile-phone-public" htmlFor="owner-phone-public">
                      <span><strong>Show my phone number publicly</strong><small>Allow property seekers to see your phone number on your public profile.</small></span>
                      <input checked={ownerFields.showPhonePublicly} id="owner-phone-public" onChange={(event) => setOwnerFields((current) => ({ ...current, showPhonePublicly: event.target.checked }))} type="checkbox" />
                    </label>
                    <div className="profile-details__row">
                      <label className="profile-field" htmlFor="owner-age">
                        <span>Age <em>Optional</em></span>
                        <input autoComplete="off" id="owner-age" max="120" min="0" onChange={(event) => setOwnerFields((current) => ({ ...current, age: event.target.value }))} type="number" value={ownerFields.age} />
                      </label>
                      <label className="profile-field" htmlFor="owner-profession">
                        <span>Profession <em>Optional</em></span>
                        <input autoComplete="organization-title" id="owner-profession" maxLength={120} onChange={(event) => setOwnerFields((current) => ({ ...current, profession: event.target.value }))} placeholder="e.g. Architect" value={ownerFields.profession} />
                      </label>
                    </div>
                    <label className="profile-field" htmlFor="owner-about-me">
                      <span>About you <em>Optional</em></span>
                      <textarea id="owner-about-me" maxLength={280} onChange={(event) => setOwnerFields((current) => ({ ...current, aboutMe: event.target.value }))} placeholder="Tell seekers a little about yourself and how you look after your homes." rows={5} value={ownerFields.aboutMe} />
                      <small className="profile-character-count">{ownerFields.aboutMe.length} / 280</small>
                    </label>
                    <div className="profile-visibility-options" aria-label="Owner profile visibility">
                      <label className="profile-phone-public" htmlFor="owner-about-public">
                        <span><strong>Show About Me publicly</strong><small>Include your bio on your public owner profile.</small></span>
                        <input checked={ownerFields.showAboutMePublicly} id="owner-about-public" onChange={(event) => setOwnerFields((current) => ({ ...current, showAboutMePublicly: event.target.checked }))} type="checkbox" />
                      </label>
                      <label className="profile-phone-public" htmlFor="owner-profession-public">
                        <span><strong>Show Profession publicly</strong><small>Include your profession on your public owner profile.</small></span>
                        <input checked={ownerFields.showProfessionPublicly} id="owner-profession-public" onChange={(event) => setOwnerFields((current) => ({ ...current, showProfessionPublicly: event.target.checked }))} type="checkbox" />
                      </label>
                    </div>
                  </>
                )}
              </section>

              {isOwner && (
                <section className="profile-panel profile-contact-preferences" aria-labelledby="profile-contact-preferences-title">
                  <h2 id="profile-contact-preferences-title">How should seekers reach you?</h2>
                  <p>This sets the expectation before a viewing request.</p>
                  <fieldset>
                    <legend>Preferred contact <em>Optional</em></legend>
                    <div aria-label="Preferred contact" className="profile-choice-row profile-choice-row--contact" role="group">
                      {[
                        ['IN_APP_MESSAGE', 'In-app message'],
                        ['PHONE_CALL', 'Phone call'],
                      ].map(([value, label]) => <button aria-pressed={ownerFields.preferredContactMethods.includes(value)} className="profile-choice" key={value} onClick={() => setOwnerFields((current) => ({ ...current, preferredContactMethods: toggleSelection(current.preferredContactMethods, value) }))} type="button">{label}</button>)}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Best time to reach you <em>Optional</em></legend>
                    <div aria-label="Best time to reach you" className="profile-choice-row" role="group">
                      {[
                        ['MORNING', 'Morning'],
                        ['AFTERNOON', 'Afternoon'],
                        ['EVENING', 'Evening'],
                      ].map(([value, label]) => <button aria-pressed={ownerFields.preferredContactTimes.includes(value)} className="profile-choice" key={value} onClick={() => setOwnerFields((current) => ({ ...current, preferredContactTimes: toggleSelection(current.preferredContactTimes, value) }))} type="button">{label}</button>)}
                    </div>
                  </fieldset>
                  <label className="profile-phone-public" htmlFor="owner-contact-preferences-public">
                    <span><strong>Show contact preferences publicly</strong><small>Let seekers see your selected contact methods and times.</small></span>
                    <input checked={ownerFields.showContactPreferencesPublicly} id="owner-contact-preferences-public" onChange={(event) => setOwnerFields((current) => ({ ...current, showContactPreferencesPublicly: event.target.checked }))} type="checkbox" />
                  </label>
                </section>
              )}

              {isSeeker && (
                <section className="profile-panel profile-seeker-details" aria-labelledby="profile-seeker-details-title">
                  <h2 id="profile-seeker-details-title">Home Seeker profile</h2>
                  <p>Choose what property owners can see when you contact them or request a viewing.</p>

                  <div className="profile-details__row">
                    <label className="profile-field" htmlFor="seeker-age">
                      <span>Age <em>Optional</em></span>
                      <input
                        autoComplete="off"
                        id="seeker-age"
                        max="120"
                        min="0"
                        onChange={(event) => setSeekerFields((current) => ({ ...current, age: event.target.value }))}
                        placeholder="e.g. 28"
                        type="number"
                        value={seekerFields.age}
                      />
                    </label>
                    <label className="profile-field" htmlFor="seeker-profession">
                      <span>Profession <em>Optional</em></span>
                      <input
                        autoComplete="organization-title"
                        id="seeker-profession"
                        maxLength={120}
                        onChange={(event) => setSeekerFields((current) => ({ ...current, profession: event.target.value }))}
                        placeholder="e.g. Software Engineer"
                        value={seekerFields.profession}
                      />
                    </label>
                  </div>

                  <label className="profile-field" htmlFor="seeker-about-me">
                    <span>About Me <em>Optional</em></span>
                    <textarea
                      id="seeker-about-me"
                      maxLength={280}
                      onChange={(event) => setSeekerFields((current) => ({ ...current, aboutMe: event.target.value }))}
                      placeholder="Tell property owners a little about yourself, what you do, or what kind of home you are looking for."
                      rows={4}
                      value={seekerFields.aboutMe}
                    />
                    <small className="profile-character-count">{seekerFields.aboutMe.length} / 280</small>
                  </label>

                  <div className="profile-details__row">
                    <label className="profile-field" htmlFor="seeker-phone-number">
                      <span>Phone number <em>Optional</em></span>
                      <input
                        autoComplete="tel"
                        id="seeker-phone-number"
                        maxLength={30}
                        onChange={(event) => setSeekerFields((current) => ({ ...current, phoneNumber: event.target.value }))}
                        placeholder="+880 1XXX-XXXXXX"
                        type="tel"
                        value={seekerFields.phoneNumber}
                      />
                      <small>Private by default. Shared only if public visibility is enabled.</small>
                    </label>
                    <label className="profile-field" htmlFor="seeker-present-address">
                      <span>Present address <em>Optional</em></span>
                      <input
                        autoComplete="street-address"
                        id="seeker-present-address"
                        maxLength={255}
                        onChange={(event) => setSeekerFields((current) => ({ ...current, presentAddress: event.target.value }))}
                        placeholder="e.g. Mirpur, Dhaka"
                        value={seekerFields.presentAddress}
                      />
                      <small>Private by default. Shared only if public visibility is enabled.</small>
                    </label>
                  </div>

                  <div className="profile-details__row">
                    <label className="profile-field" htmlFor="seeker-family-members">
                      <span>Family members <em>Optional</em></span>
                      <input
                        autoComplete="off"
                        id="seeker-family-members"
                        maxLength={255}
                        onChange={(event) => setSeekerFields((current) => ({ ...current, familyMembers: event.target.value }))}
                        placeholder="e.g. 2 adults and 1 child"
                        value={seekerFields.familyMembers}
                      />
                      <small>Private by default. Choose below if you want to share this on your seeker profile.</small>
                    </label>
                    <label className="profile-field" htmlFor="seeker-permanent-address">
                      <span>Permanent address <em>Optional</em></span>
                      <input
                        autoComplete="off"
                        id="seeker-permanent-address"
                        maxLength={255}
                        onChange={(event) => setSeekerFields((current) => ({ ...current, permanentAddress: event.target.value }))}
                        placeholder="Your permanent address"
                        value={seekerFields.permanentAddress}
                      />
                      <small>Private by default. Choose below if you want to share this on your seeker profile.</small>
                    </label>
                  </div>

                  <div className="profile-visibility-options" aria-label="Home Seeker profile visibility">
                    <label className="profile-phone-public" htmlFor="seeker-age-public">
                      <span><strong>Show Age publicly</strong><small>Allow property owners to see your age.</small></span>
                      <input
                        checked={seekerFields.showAgePublicly}
                        id="seeker-age-public"
                        onChange={(event) => setSeekerFields((current) => ({ ...current, showAgePublicly: event.target.checked }))}
                        type="checkbox"
                      />
                    </label>
                    <label className="profile-phone-public" htmlFor="seeker-profession-public">
                      <span><strong>Show Profession publicly</strong><small>Allow property owners to see your profession.</small></span>
                      <input
                        checked={seekerFields.showProfessionPublicly}
                        id="seeker-profession-public"
                        onChange={(event) => setSeekerFields((current) => ({ ...current, showProfessionPublicly: event.target.checked }))}
                        type="checkbox"
                      />
                    </label>
                    <label className="profile-phone-public" htmlFor="seeker-about-public">
                      <span><strong>Show About Me publicly</strong><small>Allow property owners to read your bio.</small></span>
                      <input
                        checked={seekerFields.showAboutMePublicly}
                        id="seeker-about-public"
                        onChange={(event) => setSeekerFields((current) => ({ ...current, showAboutMePublicly: event.target.checked }))}
                        type="checkbox"
                      />
                    </label>
                    <label className="profile-phone-public" htmlFor="seeker-phone-public">
                      <span><strong>Show my phone number publicly</strong><small>Allow property owners to see your phone number (Private by default).</small></span>
                      <input
                        checked={seekerFields.showPhoneNumberPublicly}
                        id="seeker-phone-public"
                        onChange={(event) => setSeekerFields((current) => ({ ...current, showPhoneNumberPublicly: event.target.checked }))}
                        type="checkbox"
                      />
                    </label>
                    <label className="profile-phone-public" htmlFor="seeker-present-address-public">
                      <span><strong>Show Present Address publicly</strong><small>Allow property owners to see your current address (Private by default).</small></span>
                      <input
                        checked={seekerFields.showPresentAddressPublicly}
                        id="seeker-present-address-public"
                        onChange={(event) => setSeekerFields((current) => ({ ...current, showPresentAddressPublicly: event.target.checked }))}
                        type="checkbox"
                      />
                    </label>
                    <label className="profile-phone-public" htmlFor="seeker-family-members-public">
                      <span><strong>Show Family Members publicly</strong><small>Allow property owners to see your household details on your seeker profile.</small></span>
                      <input
                        checked={seekerFields.showFamilyMembersPublicly}
                        id="seeker-family-members-public"
                        onChange={(event) => setSeekerFields((current) => ({ ...current, showFamilyMembersPublicly: event.target.checked }))}
                        type="checkbox"
                      />
                    </label>
                    <label className="profile-phone-public" htmlFor="seeker-permanent-address-public">
                      <span><strong>Show Permanent Address publicly</strong><small>Allow property owners to see your permanent address on your seeker profile.</small></span>
                      <input
                        checked={seekerFields.showPermanentAddressPublicly}
                        id="seeker-permanent-address-public"
                        onChange={(event) => setSeekerFields((current) => ({ ...current, showPermanentAddressPublicly: event.target.checked }))}
                        type="checkbox"
                      />
                    </label>
                  </div>
                </section>
              )}

              <section className="profile-panel profile-roles" aria-labelledby="profile-roles-title">
                <h2 id="profile-roles-title">Your roles</h2>
                <p>One account, as many roles as you need. Switch any time from the top of the sidebar.</p>
                <div className="profile-roles__grid">
                  {assignedRoles.map((role) => (
                    <div className="profile-role-card profile-role-card--active" key={role}>
                      <strong>{PUBLIC_ROLES.find((item) => item.value === role)?.label || role}</strong>
                      <span className="profile-role-card__status">✓ Active</span>
                      <small>{role === 'HOME_SEEKER' ? 'Browse, save and compare homes, and request viewings.' : 'List homes and manage viewing requests from seekers.'}</small>
                    </div>
                  ))}
                  {rolesToAdd.length > 0 && (
                    <div className="profile-role-card profile-role-card--add">
                      <strong>{rolesToAdd[0].label}</strong>
                      <small>{rolesToAdd[0].value === 'PROPERTY_OWNER' ? 'List homes and manage viewing requests from seekers.' : 'Browse, save and compare homes, and request viewings.'}</small>
                      <select aria-label="Add another role" onChange={(event) => setRoleToAdd(event.target.value)} value={roleToAdd}>
                        <option value="">＋ Add this role</option>
                        {rolesToAdd.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <aside className="profile-column profile-column--side">
              <section className="profile-panel profile-strength" aria-labelledby="profile-strength-title">
                <div className="profile-strength__top">
                  <div className="profile-strength__meter" aria-label={`Profile strength ${profileStrength} percent`} style={{ '--profile-strength': `${profileStrength}%` }}><span>{profileStrength}%</span></div>
                  <div><h2 id="profile-strength-title">Profile strength</h2><p>{profileStrengthSteps.filter(Boolean).length} of 5 steps done</p></div>
                </div>
                <ul>
                  <li className={profileStrengthSteps[0] ? 'is-complete' : ''}>Add a profile picture</li>
                  <li className={profileStrengthSteps[1] ? 'is-complete' : ''}>Add your full name</li>
                  <li className={profileStrengthSteps[2] ? 'is-complete' : ''}>Confirm sign-in email</li>
                  <li className={profileStrengthSteps[3] ? 'is-complete' : ''}>{isOwner ? 'Add a contact phone' : 'Set a monthly budget'}</li>
                  <li className={profileStrengthSteps[4] ? 'is-complete' : ''}>{isOwner ? 'Write your short bio' : 'Set search preferences'}</li>
                </ul>
              </section>

              {isOwner && (
                <section className="profile-panel profile-owner-preview" aria-labelledby="profile-owner-preview-title">
                  <h2 id="profile-owner-preview-title">How seekers see you</h2>
                  <ProfileShowcase
                    about={ownerFields.showAboutMePublicly ? ownerFields.aboutMe : ''}
                    authenticatedAvatar
                    contactMethods={ownerFields.showContactPreferencesPublicly ? ownerFields.preferredContactMethods : []}
                    contactTimes={ownerFields.showContactPreferencesPublicly ? ownerFields.preferredContactTimes : []}
                    phoneNumber={ownerFields.showPhonePublicly ? ownerFields.phoneNumber : ''}
                    profession={ownerFields.showProfessionPublicly ? ownerFields.profession : ''}
                    profile={{ ...profile, full_name: fullName ?? profile.full_name }}
                    roleLabel="Property Owner"
                  />
                  <p>This is a preview of the owner card on your listings.</p>
                </section>
              )}

              {isSeeker && (
                <section className="profile-panel profile-owner-preview" aria-labelledby="profile-seeker-preview-title">
                  <h2 id="profile-seeker-preview-title">How owners see you</h2>
                  <ProfileShowcase
                    about={seekerFields.showAboutMePublicly ? seekerFields.aboutMe : ''}
                    age={seekerFields.showAgePublicly && seekerFields.age ? `${seekerFields.age} years old` : ''}
                    authenticatedAvatar
                    details={[
                      { label: 'Present address', value: seekerFields.showPresentAddressPublicly ? seekerFields.presentAddress : '' },
                      { label: 'Family members', value: seekerFields.showFamilyMembersPublicly ? seekerFields.familyMembers : '' },
                      { label: 'Permanent address', value: seekerFields.showPermanentAddressPublicly ? seekerFields.permanentAddress : '' },
                    ]}
                    phoneNumber={seekerFields.showPhoneNumberPublicly ? seekerFields.phoneNumber : ''}
                    profession={seekerFields.showProfessionPublicly ? seekerFields.profession : ''}
                    profile={{ ...profile, full_name: fullName ?? profile.full_name }}
                    roleLabel="Home Seeker"
                  />
                  <p>This is a live preview of what property owners see when you contact them or request a viewing.</p>
                </section>
              )}

              {isOwner && (
                <section className="profile-panel profile-quick-actions" aria-labelledby="profile-quick-actions-title">
                  <h2 id="profile-quick-actions-title">Quick actions</h2>
                  <Link className="profile-quick-action profile-quick-action--primary" to="/owner/listings/new">＋ Add a new listing</Link>
                  <Link className="profile-quick-action" to="/owner/viewing-requests">Viewing requests</Link>
                  <Link className="profile-quick-action" to="/owner/messages">Messages</Link>
                </section>
              )}

              {isSeeker && (
                <section className="profile-panel profile-preferences" aria-labelledby="profile-preferences-title">
                  <h2 id="profile-preferences-title">Search preferences</h2>
                  <p>We use these to suggest homes that fit.</p>
                  <fieldset>
                    <legend>Preferred areas</legend>
                    <div className="profile-chips">
                      {['Mirpur', 'Dhanmondi'].map((area) => (
                        <button aria-pressed={preferences.areas.includes(area)} className="profile-chip" key={area} onClick={() => updatePreferences({ areas: preferences.areas.includes(area) ? preferences.areas.filter((item) => item !== area) : [...preferences.areas, area] })} type="button">{area}</button>
                      ))}
                      <button className="profile-chip profile-chip--add" onClick={() => updatePreferences({ areas: preferences.areas.includes('Gulshan') ? preferences.areas : [...preferences.areas, 'Gulshan'] })} type="button">＋ Add area</button>
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Monthly budget</legend>
                    <div className="profile-budget">
                      <label><span className="sr-only">Minimum monthly budget</span><input inputMode="numeric" onChange={(event) => updatePreferences({ minBudget: event.target.value })} placeholder="Min ৳" value={preferences.minBudget} /></label>
                      <label><span className="sr-only">Maximum monthly budget</span><input inputMode="numeric" onChange={(event) => updatePreferences({ maxBudget: event.target.value })} placeholder="Max ৳" value={preferences.maxBudget} /></label>
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Bedrooms</legend>
                    <div className="profile-bedroom-options">
                      {['1', '2', '3', '4+'].map((number) => <button aria-pressed={preferences.bedrooms === number} className="profile-bedroom" key={number} onClick={() => updatePreferences({ bedrooms: number })} type="button">{number}</button>)}
                    </div>
                  </fieldset>
                </section>
              )}

              <section className="profile-panel profile-notifications" aria-labelledby="profile-notifications-title">
                <h2 id="profile-notifications-title">Notifications</h2>
                {(isOwner
                  ? [
                      ['viewingUpdates', 'New viewing requests'],
                      ['seekerCancelledViewing', 'Seeker cancelled a viewing'],
                      ['newMessages', 'New messages'],
                      ['weeklyListingSummary', 'Weekly listing summary'],
                    ]
                  : [
                      ['newMessages', 'New messages'],
                      ['viewingUpdates', 'Viewing request updates'],
                      ['matchingHomes', 'New homes matching my preferences'],
                    ]
                ).map(([key, label]) => (
                  <label className="profile-notification" key={key}>
                    <span>{label}</span>
                    <input checked={preferences[key]} onChange={(event) => updatePreferences({ [key]: event.target.checked })} type="checkbox" />
                  </label>
                ))}
              </section>
            </aside>
          </div>

          {notice && <p className="profile-message profile-message--success" role="status">{notice}</p>}
          {saveError && <p className="profile-message profile-message--error" role="alert">{saveError}</p>}
          <div className="profile-save-bar">
            <span>{profileChanged ? 'You have unsaved changes' : 'Your profile is up to date'}</span>
            <div>
              <button className="profile-button profile-button--discard" disabled={!profileChanged || saving} onClick={discardProfileChanges} type="button">Discard</button>
              <button className="profile-button profile-button--save" disabled={!profileChanged || saving} type="submit">{saving ? 'Saving…' : 'Save profile'}</button>
            </div>
          </div>
        </form>
      )}
    </section>
  )
}
