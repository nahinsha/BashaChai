import { useState } from 'react'
import UserAvatar from './UserAvatar.jsx'
import './ProfileShowcase.css'

const contactMethodLabels = {
  PHONE_CALL: 'Phone call',
  IN_APP_MESSAGE: 'In-app message',
}

const contactTimeLabels = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
}

function memberSinceLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function ProfileIcon({ name }) {
  if (name === 'home') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 11 9-7 9 7m-16-1v10h14V10m-9 10v-6h4v6"/></svg>
  if (name === 'calendar') return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
  if (name === 'profession') return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V5h6v3m-11 5h16m-10 0v2h4v-2"/></svg>
  if (name === 'contact') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5h14v11H9l-4 3z"/></svg>
  if (name === 'time') return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
  if (name === 'phone') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3h3l2 5-2 1.5a15 15 0 0 0 4.5 4.5L16 12l5 2v3c0 1.1-.9 2-2 2C10.7 19 5 13.3 5 5c0-1.1.9-2 2-2Z"/></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8m-4-4 4 4-4 4"/></svg>
}

function Skyline() {
  return (
    <svg aria-hidden="true" className="profile-showcase__skyline" viewBox="0 0 220 90" fill="none">
      <path d="M8 90V47h25v43m8 0V24h27v66m7 0V39h25v51m8 0V8h31v82m8 0V34h25v56m8 0V18h27v72" stroke="currentColor" strokeWidth="2"/>
      <path d="M48 36h17m-17 9h17m-17 9h17m45-31h16m-16 9h16m-16 9h16m-16 9h16m38 3h15m-15 9h15" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function values(value, labels) {
  if (!Array.isArray(value)) return []
  return value.map((item) => labels[item] || item)
}

export default function ProfileShowcase({
  profile,
  roleLabel,
  about,
  profession,
  age,
  phoneNumber,
  contactMethods,
  contactTimes,
  details = [],
  authenticatedAvatar = false,
  className = '',
  titleId,
  children,
}) {
  const [copied, setCopied] = useState(false)
  const joined = memberSinceLabel(profile.date_joined)
  const methods = values(contactMethods, contactMethodLabels)
  const times = values(contactTimes, contactTimeLabels)
  const visibleDetails = details.filter((item) => item.value)
  const hasAbout = Boolean(profession || age || about || visibleDetails.length)

  const copyPhoneNumber = async () => {
    if (!phoneNumber) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(phoneNumber)
      } else {
        const field = document.createElement('textarea')
        field.value = phoneNumber
        field.setAttribute('readonly', '')
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        const copied = document.execCommand('copy')
        field.remove()
        if (!copied) return
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className={`profile-showcase ${className}`.trim()}>
      <header className="profile-showcase__banner">
        <span className="profile-showcase__banner-label"><ProfileIcon name="home"/>{roleLabel}</span>
        <Skyline/>
      </header>
      <div className="profile-showcase__identity">
        <UserAvatar authenticated={authenticatedAvatar} className="profile-showcase__avatar" user={profile}/>
        <div className="profile-showcase__identity-copy">
          <h1 id={titleId}>{profile.full_name || roleLabel}</h1>
          <div className="profile-showcase__meta">
            <span className="profile-showcase__role"><ProfileIcon name="home"/>{roleLabel}</span>
            {joined && <span><ProfileIcon name="calendar"/>Member since {joined}</span>}
          </div>
        </div>
      </div>

      {hasAbout && (
        <section className="profile-showcase__about" aria-label="About">
          <h2>About</h2>
          {profession && <div className="profile-showcase__row"><span className="profile-showcase__icon"><ProfileIcon name="profession"/></span><div><span className="profile-showcase__label">Occupation</span><strong>{profession}</strong></div></div>}
          {age && <div className="profile-showcase__row"><span className="profile-showcase__icon"><ProfileIcon name="time"/></span><div><span className="profile-showcase__label">Age</span><strong>{age}</strong></div></div>}
          {about && <p className="profile-showcase__bio">{about}</p>}
          {visibleDetails.map((item) => <div className="profile-showcase__row" key={item.label}><span className="profile-showcase__icon"><ProfileIcon name={item.icon || 'detail'}/></span><div><span className="profile-showcase__label">{item.label}</span><strong>{item.value}</strong></div></div>)}
          {methods.length > 0 && <div className="profile-showcase__row"><span className="profile-showcase__icon"><ProfileIcon name="contact"/></span><div><span className="profile-showcase__label">Prefers to be contacted by</span><div className="profile-showcase__chips">{methods.map((method) => <span className="profile-showcase__chip" key={method}><ProfileIcon name={method === 'Phone call' ? 'phone' : 'contact'}/>{method}</span>)}</div></div></div>}
          {times.length > 0 && <div className="profile-showcase__row"><span className="profile-showcase__icon"><ProfileIcon name="time"/></span><div><span className="profile-showcase__label">Best time to reach</span><div className="profile-showcase__chips">{times.map((time) => <span className="profile-showcase__chip" key={time}><ProfileIcon name="time"/>{time}</span>)}</div></div></div>}
        </section>
      )}

      {phoneNumber && (
        <section className="profile-showcase__phone" aria-label="Phone number">
          <span className="profile-showcase__icon"><ProfileIcon name="phone"/></span>
          <div className="profile-showcase__phone-copy"><span className="profile-showcase__label">Phone</span><strong>{phoneNumber}</strong></div>
          <a className="profile-showcase__action" href={`tel:${phoneNumber}`}><ProfileIcon name="phone"/>Call</a>
          <button className="profile-showcase__action" onClick={copyPhoneNumber} type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>{copied ? 'Copied' : 'Copy number'}</button>
        </section>
      )}
      {children}
    </article>
  )
}
