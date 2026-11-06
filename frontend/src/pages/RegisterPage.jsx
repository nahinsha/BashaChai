import { useState } from 'react'
import { Link } from 'react-router-dom'
import { registerAccount } from '../api.js'
import './PublicPages.css'

const availableRoles = [
  { value: 'HOME_SEEKER', label: 'Home Seeker', description: 'Find and save homes, request viewings.' },
  { value: 'PROPERTY_OWNER', label: 'Property Owner', description: 'List homes and manage requests.' },
]

function errorMessage(value) {
  if (Array.isArray(value)) return value.map(errorMessage).join(' ')
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return Object.values(value).map(errorMessage).join(' ')
  return ''
}

function BrandMark() {
  return <svg aria-hidden="true" viewBox="0 0 40 40"><path d="M5 19 20 6l15 13M9 17v17h22V17M16 34V24h8v10" /></svg>
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 26 26"><circle cx="13" cy="13" r="13" fill="currentColor"/><path d="m7.5 13.5 4 4 7-8" fill="none" stroke="#073b2a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6"/></svg>
}

function CityIllustration() {
  return (
    <svg aria-hidden="true" className="register-hero__art" preserveAspectRatio="xMidYEnd slice" viewBox="0 0 440 210">
      <defs>
        <linearGradient id="register-art-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0b5a3f" stopOpacity="0"/><stop offset="1" stopColor="#0f6e4c"/></linearGradient>
        <pattern height="12" id="register-art-windows" patternUnits="userSpaceOnUse" width="10"><rect fill="#bfe9d3" height="6" opacity=".55" width="5" x="2" y="3"/></pattern>
      </defs>
      <rect fill="url(#register-art-gradient)" height="210" width="440"/>
      <g fill="#116b4b"><rect height="90" width="46" x="20" y="100"/><rect height="120" width="40" x="74" y="70"/><rect height="106" width="48" x="330" y="84"/><rect height="80" width="44" x="386" y="110"/></g>
      <g fill="#0c5b40"><rect height="140" width="56" x="120" y="50"/><rect height="150" width="60" x="262" y="40"/><rect height="98" width="70" x="184" y="92"/></g>
      <g fill="url(#register-art-windows)"><rect height="90" width="46" x="20" y="100"/><rect height="120" width="40" x="74" y="70"/><rect height="140" width="56" x="120" y="50"/><rect height="150" width="60" x="262" y="40"/><rect height="106" width="48" x="330" y="84"/><rect height="98" width="70" x="184" y="92"/></g>
      <g fill="#064a33"><circle cx="8" cy="176" r="22"/><circle cx="52" cy="184" r="20"/><circle cx="410" cy="178" r="24"/><circle cx="370" cy="188" r="18"/></g>
      <rect fill="#05382a" height="20" width="440" y="190"/>
    </svg>
  )
}

function Skyline() {
  return (
    <svg aria-hidden="true" className="register-panel__skyline" fill="none" viewBox="0 0 300 120">
      <g fill="#dcefe5"><path d="M20 120V80h22v40M48 120V50h26v70M80 120V30h22v90M108 120V60h26v60M140 120V20h24v100M170 120V70h28v50M204 120V45h22v75M232 120V85h26v35M264 120V60h22v60"/><path d="M52 62h18M52 74h18M52 86h18M84 42h14M84 56h14M84 70h14M144 32h16M144 46h16M144 60h16M144 74h16" opacity=".55"/></g>
    </svg>
  )
}

function FieldIcon({ type }) {
  if (type === 'name') return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6 8-6s7 1.5 8 6"/></svg>
  if (type === 'email') return <svg aria-hidden="true" viewBox="0 0 24 24"><rect height="14" rx="2.5" width="18" x="3" y="5"/><path d="m4 7 8 6 8-6"/></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect height="9" rx="2.5" width="14" x="5" y="11"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
}

function RoleIcon({ owner }) {
  return owner
    ? <svg aria-hidden="true" className="register-role-choice__icon register-role-choice__icon--owner" viewBox="0 0 24 24"><path d="M3.5 11 12 4l8.5 7M6 10v10h12V10M10 20v-5h4v5"/></svg>
    : <svg aria-hidden="true" className="register-role-choice__icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.5"/><path d="M3.5 21c.8-5 4-7 8.5-7s7.7 2 8.5 7z"/></svg>
}

function RegisterShell({ children }) {
  return (
    <section className="register-page--reference" aria-label="Create a BasaChai account">
      <div className="register-layout">
        <section aria-label="About BasaChai" className="register-hero">
          <Link aria-label="BasaChai home" className="register-brand" to="/"><BrandMark/>BasaChai</Link>
          <div className="register-hero__copy">
            <p className="register-hero__tag" lang="bn">ভালো বাসা খুঁজুন,<strong>বুদ্ধিমানের মতো!</strong><span aria-hidden="true"/></p>
            <h2 className="register-hero__headline">Find Better.<br/>Compare Smarter.<br/>Visit Less.</h2>
            <p className="register-hero__subcopy">Find your ideal home with BasaChai, with less hassle.</p>
            <ul className="register-hero__points">
              <li><CheckIcon/>Compare properties side by side</li>
              <li><CheckIcon/>Save your favourite homes</li>
              <li><CheckIcon/>Connect directly with property owners</li>
            </ul>
          </div>
          <CityIllustration/>
        </section>
        <section className="register-panel">
          <Skyline/>
          {children}
        </section>
      </div>
    </section>
  )
}

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', full_name: '', roles: [] })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const setValue = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setFormError('')
  }

  const toggleRole = (role) => (event) => {
    setForm((current) => ({
      ...current,
      roles: event.target.checked
        ? [...current.roles, role]
        : current.roles.filter((selected) => selected !== role),
    }))
    setFieldErrors((current) => ({ ...current, roles: undefined }))
    setFormError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    setFieldErrors({})
    setFormError('')

    if (form.roles.length === 0) {
      setFieldErrors({ roles: 'Choose at least one account type.' })
      return
    }

    setSubmitting(true)
    try {
      await registerAccount({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        roles: form.roles,
      })
      setRegistered(true)
    } catch (error) {
      const returnedErrors = Object.fromEntries(
        Object.entries(error.fields || {}).map(([field, value]) => [field, errorMessage(value)]),
      )
      setFieldErrors(returnedErrors)
      setFormError(error.message || 'We could not create your account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (registered) {
    return (
      <RegisterShell>
        <div className="register-panel__content">
          <p className="register-eyebrow">All set</p>
          <h1 id="register-title">Account created</h1>
          <div className="register-success" role="status">
            <span className="register-success__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 13 4 4 10-10"/></svg></span>
            <p>Welcome, {form.full_name.trim()}. Your account has been created. You can now sign in to continue.</p>
            <Link className="register-submit" to="/login">Go to sign in</Link>
          </div>
        </div>
      </RegisterShell>
    )
  }

  const renderFieldError = (field, id) => fieldErrors[field] && (
    <span className="register-field-error" id={id}>{fieldErrors[field]}</span>
  )

  return (
    <RegisterShell>
      <div className="register-panel__content">
        <p className="register-eyebrow">Get started</p>
        <h1 id="register-title">Create your account</h1>
        <p className="register-panel__intro">Choose how you want to use BasaChai.</p>
        {formError && <p className="register-form-error" role="alert">{formError}</p>}

        <form className="register-form" onSubmit={submit} noValidate>
          <label className="register-field" htmlFor="register-full-name">
            <span>Full name</span>
            <span className={`register-input${fieldErrors.full_name ? ' is-invalid' : ''}`}>
              <FieldIcon type="name"/>
              <input autoComplete="name" aria-describedby={fieldErrors.full_name ? 'register-name-error' : undefined} aria-invalid={Boolean(fieldErrors.full_name)} id="register-full-name" maxLength={150} name="full_name" onChange={setValue('full_name')} placeholder="Your name" required value={form.full_name}/>
            </span>
            {renderFieldError('full_name', 'register-name-error')}
          </label>

          <label className="register-field" htmlFor="register-email">
            <span>Email</span>
            <span className={`register-input${fieldErrors.email ? ' is-invalid' : ''}`}>
              <FieldIcon type="email"/>
              <input autoComplete="email" aria-describedby={fieldErrors.email ? 'register-email-error' : undefined} aria-invalid={Boolean(fieldErrors.email)} id="register-email" maxLength={254} name="email" onChange={setValue('email')} placeholder="you@example.com" required type="email" value={form.email}/>
            </span>
            {renderFieldError('email', 'register-email-error')}
          </label>

          <label className="register-field" htmlFor="register-password">
            <span>Password</span>
            <span className={`register-input${fieldErrors.password ? ' is-invalid' : ''}`}>
              <FieldIcon type="password"/>
              <input autoComplete="new-password" aria-describedby={fieldErrors.password ? 'register-password-error' : 'register-password-hint'} aria-invalid={Boolean(fieldErrors.password)} id="register-password" name="password" onChange={setValue('password')} placeholder="Create a password" required type={showPassword ? 'text' : 'password'} value={form.password}/>
              <button aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="register-show-password" onClick={() => setShowPassword((shown) => !shown)} type="button">{showPassword ? 'Hide' : 'Show'}</button>
            </span>
            <span className="register-field-hint" id="register-password-hint">Use at least 8 characters.</span>
            {renderFieldError('password', 'register-password-error')}
          </label>

          <fieldset className="register-role-types" aria-describedby={fieldErrors.roles ? 'register-roles-error' : undefined}>
            <legend>Account type</legend>
            <div className="register-role-types__options">
              {availableRoles.map(({ value, label, description }) => (
                <label className="register-role-choice" key={value}>
                  <input checked={form.roles.includes(value)} name="roles" onChange={toggleRole(value)} type="checkbox" value={value}/>
                  <span className="register-role-choice__card">
                    <RoleIcon owner={value === 'PROPERTY_OWNER'}/>
                    <span className="register-role-choice__copy"><strong>{label}</strong><span>{description}</span></span>
                    <i aria-hidden="true" className="register-role-choice__indicator"/>
                  </span>
                </label>
              ))}
            </div>
            {renderFieldError('roles', 'register-roles-error')}
          </fieldset>

          <button className="register-submit" disabled={submitting} type="submit">
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21c.7-4 3.5-6 7-6m9-7v6m-3-3h6"/></svg>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
          <p className="register-signin">Already have an account? <Link to="/login">Sign in</Link></p>
        </form>
      </div>
    </RegisterShell>
  )
}
