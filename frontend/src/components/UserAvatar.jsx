import PropertyImage from './PropertyImage.jsx'
import { resolveApiUrl } from '../api.js'
import './UserAvatar.css'

function initials(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((part) => part[0].toUpperCase()).join('') || 'B'
}

export default function UserAvatar({ user, size = 'small', authenticated = false, className = '' }) {
  const name = user?.full_name || 'BasaChai user'
  const fallback = initials(user?.full_name)
  const classes = `user-avatar user-avatar--${size}${className ? ` ${className}` : ''}`

  return (
    <PropertyImage
      alt={`Profile picture of ${name}`}
      authenticated={authenticated}
      className={`${classes} user-avatar--photo`}
      fallbackAriaLabel={`Default avatar for ${name}`}
      fallbackClassName={`${classes} user-avatar--fallback`}
      fallbackLabel={fallback}
      loadingLabel={fallback}
      src={resolveApiUrl(user?.profile_picture_url)}
    />
  )
}
