import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { apiRequest } from '../api.js'
import UserAvatar from '../components/UserAvatar.jsx'
import sidebarIllustration from '../assets/dhaka-skyline.svg'
import './WorkspaceSidebar.css'

const NOTIFICATION_REFRESH_MS = 15000

async function loadAllPages(path) {
  const records = []
  let page = 1
  let hasNext = true
  while (hasNext) {
    const separator = path.includes('?') ? '&' : '?'
    const data = await apiRequest(`${path}${separator}page=${page}`, { auth: true })
    records.push(...(data.results || []))
    hasNext = Boolean(data.next)
    page += 1
  }
  return records
}

function readSeenSnapshot(key) {
  try {
    const saved = localStorage.getItem(key)
    if (saved === null) return null
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed.filter((activityKey) => typeof activityKey === 'string') : []
  } catch {
    return []
  }
}

function saveSeenSnapshot(key, activities) {
  try {
    localStorage.setItem(key, JSON.stringify(activities))
  } catch {
    // The in-memory indicator still works when browser storage is unavailable.
  }
}

function readLegacySeenAt(key) {
  try {
    return Number(localStorage.getItem(key)) || null
  } catch {
    return null
  }
}

function messageActivities(conversations, userId) {
  return conversations
    .filter((conversation) => (
      conversation.last_message
      && String(conversation.last_message.sender?.id) !== String(userId)
    ))
    .map((conversation) => {
      const message = conversation.last_message
      return {
        key: `conversation:${conversation.id}:message:${message.id ?? message.created_at}`,
        occurredAt: message.created_at,
      }
    })
    .sort((left, right) => left.key.localeCompare(right.key))
}

function viewingRequestActivities(viewingRequests, userId, workspace) {
  const activities = []
  viewingRequests.forEach((request) => {
    if (workspace === 'owner' && String(request.owner?.id) === String(userId)) {
      activities.push({
        key: `request:${request.id}:created:${request.created_at}`,
        occurredAt: request.created_at,
      })
      if (request.status === 'CANCELLED') {
        activities.push({
          key: `request:${request.id}:cancelled:${request.updated_at}`,
          occurredAt: request.updated_at,
        })
      }
      return
    }

    if (
      workspace === 'seeker'
      && String(request.seeker?.id) === String(userId)
      && ['ACCEPTED', 'REJECTED'].includes(request.status)
    ) {
      activities.push({
        key: `request:${request.id}:status:${request.status}:${request.updated_at}`,
        occurredAt: request.updated_at,
      })
    }
  })
  return activities.sort((left, right) => left.key.localeCompare(right.key))
}

function unreadActivityCount(currentActivities, seenActivities) {
  const seen = new Set(seenActivities)
  return currentActivities.reduce((count, activity) => count + (seen.has(activity.key) ? 0 : 1), 0)
}

function initialSeenSnapshot(activities, legacySeenAt) {
  if (!legacySeenAt) return activities.map((activity) => activity.key)
  return activities
    .filter((activity) => new Date(activity.occurredAt).getTime() <= legacySeenAt)
    .map((activity) => activity.key)
}

const seekerLinks = [
  { to: '/seeker', label: 'Dashboard', icon: 'home', end: true },
  { to: '/profile', label: 'My Profile', icon: 'user', end: true },
  { to: '/', label: 'Browse Listings', icon: 'search', end: true },
  { to: '/seeker/saved-listings', label: 'Saved Homes', icon: 'saved' },
  { to: '/seeker/compare', label: 'Compare Homes', icon: 'compare' },
  { to: '/seeker/messages', label: 'Messages', icon: 'message' },
  { to: '/seeker/viewing-requests', label: 'Viewing Requests', icon: 'viewing' },
  { to: '/seeker/feedback', label: 'Feedback & Reviews', icon: 'feedback' },
]

const ownerLinks = [
  { to: '/owner', label: 'Dashboard', icon: 'home', end: true },
  { to: '/profile', label: 'My Profile', icon: 'user', end: true },
  { to: '/', label: 'Browse Listings', icon: 'search', end: true },
  { to: '/owner/messages', label: 'Messages', icon: 'message' },
  { to: '/owner/viewing-requests', label: 'Viewing Requests', icon: 'viewing' },
  { to: '/owner/feedback', label: 'Feedback & Reviews', icon: 'feedback' },
]

function SidebarIcon({ name }) {
  const shapes = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></>,
    user: <><circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    saved: <><path d="M6 3h12v18l-6-4-6 4z"/></>,
    compare: <><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/><path d="M5.5 8h2m-2 4h2m-2 4h2m9-8h2m-2 4h2m-2 4h2"/></>,
    message: <><path d="M4 5h16v12H9l-5 4z"/></>,
    viewing: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/><path d="M5 4 3 6m16-2 2 2"/></>,
    owner: <><path d="m2 7 5 4 5-7 5 7 5-4-2 12H4L2 7zM4 22h16"/></>,
    listing: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 21v-7h6v7"/></>,
    add: <><path d="M12 5v14M5 12h14"/></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/></>,
    report: <><path d="M12 3 2.8 20h18.4L12 3z"/><path d="M12 9v4m0 3h.01"/></>,
    feedback: <><path d="M4 4h16v13H9l-5 4z"/><path d="M8 9h8m-8 4h5"/></>,
    overview: <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.7-1.4-2.4 1.4-1.1a8 8 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1 0 1.9z"/></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3m11-9h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
  }

  return <svg aria-hidden="true" className="workspace-sidebar__icon" viewBox="0 0 24 24">{shapes[name]}</svg>
}

function SidebarLink({ to, label, icon, end = false, notificationCount = 0, notificationLabel, onClick }) {
  return (
    <NavLink
      aria-label={notificationCount ? `${label}, ${notificationCount} ${notificationLabel}` : undefined}
      className="workspace-sidebar__link"
      end={end}
      onClick={onClick}
      to={to}
    >
      <SidebarIcon name={icon} />
      <span>{label}</span>
      {notificationCount > 0 && (
        <span aria-hidden="true" className="workspace-sidebar__badge">
          {notificationCount > 99 ? '99+' : notificationCount}
        </span>
      )}
    </NavLink>
  )
}

export default function WorkspaceSidebar({ user, workspace = 'seeker', label, ariaLabel, groups, onLogout }) {
  const [ownerExpanded, setOwnerExpanded] = useState(true)
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)
  const [notificationState, setNotificationState] = useState({ userId: null, workspace: null, messages: [], requests: [] })
  const location = useLocation()
  const hasHomeSeekerRole = user?.roles?.includes('HOME_SEEKER')
  const hasPropertyOwnerRole = user?.roles?.includes('PROPERTY_OWNER')
  const homeLinks = workspace === 'owner' ? ownerLinks : seekerLinks
  const workspaceLabel = workspace === 'owner' ? 'Property Owner' : 'Home Seeker'
  const sidebarLabel = label || workspaceLabel
  const switchTo = workspace === 'owner' ? '/seeker' : '/owner'
  const switchLabel = workspace === 'owner' ? 'Home Seeker' : 'Property Owner'
  const ownerSectionAvailable = hasPropertyOwnerRole
  const isMessagesSection = location.pathname.startsWith(`/${workspace}/messages`)
  const isViewingRequestsSection = location.pathname === `/${workspace}/viewing-requests`
  const notificationKey = `basachai.sidebar-notifications.${user?.id}.${workspace}`
  const messagesSeenKey = `${notificationKey}.messages-seen`
  const requestsSeenKey = `${notificationKey}.requests-seen`
  const legacyMessagesSeenKey = `${notificationKey}.messages-seen-at`
  const legacyRequestsSeenKey = `${notificationKey}.requests-seen-at`

  useEffect(() => {
    if (groups) return undefined
    if (!user?.id) return undefined
    let active = true
    let refreshing = false

    const refreshNotifications = async () => {
      if (refreshing) return
      refreshing = true
      try {
        const [conversations, viewingRequests] = await Promise.all([
          loadAllPages(`/conversations/?role=${workspace}`),
          loadAllPages('/viewing-requests/'),
        ])

        if (!active) return
        const messages = messageActivities(conversations, user.id)
        const requests = viewingRequestActivities(viewingRequests, user.id, workspace)
        let seenMessages = readSeenSnapshot(messagesSeenKey)
        let seenRequests = readSeenSnapshot(requestsSeenKey)

        // Migrate the previous timestamp cursor so activity since the last view remains unread.
        if (seenMessages === null) {
          seenMessages = initialSeenSnapshot(messages, readLegacySeenAt(legacyMessagesSeenKey))
        }
        if (seenRequests === null) {
          seenRequests = initialSeenSnapshot(requests, readLegacySeenAt(legacyRequestsSeenKey))
        }
        if (isMessagesSection) seenMessages = messages.map((activity) => activity.key)
        if (isViewingRequestsSection) seenRequests = requests.map((activity) => activity.key)
        saveSeenSnapshot(messagesSeenKey, seenMessages)
        saveSeenSnapshot(requestsSeenKey, seenRequests)
        setNotificationState({
          userId: user.id,
          workspace,
          messages,
          requests,
        })
      } catch {
        // Keep the last known indicators if a background refresh fails.
      } finally {
        refreshing = false
      }
    }

    refreshNotifications()
    const intervalId = window.setInterval(refreshNotifications, NOTIFICATION_REFRESH_MS)
    window.addEventListener('focus', refreshNotifications)
    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshNotifications)
    }
  }, [groups, isMessagesSection, isViewingRequestsSection, legacyMessagesSeenKey, legacyRequestsSeenKey, messagesSeenKey, requestsSeenKey, user?.id, workspace])

  const notificationStateMatches = notificationState.userId === user?.id && notificationState.workspace === workspace
  const persistedMessages = readSeenSnapshot(messagesSeenKey) || []
  const persistedRequests = readSeenSnapshot(requestsSeenKey) || []
  const messageCount = notificationStateMatches
    && !isMessagesSection
    ? unreadActivityCount(notificationState.messages, persistedMessages)
    : 0
  const requestCount = notificationStateMatches
    && !isViewingRequestsSection
    ? unreadActivityCount(notificationState.requests, persistedRequests)
    : 0
  const linksWithNotifications = homeLinks.map((item) => {
    if (item.icon === 'message') return { ...item, notificationCount: messageCount, notificationLabel: 'new messages' }
    if (item.icon === 'viewing') return { ...item, notificationCount: requestCount, notificationLabel: 'new viewing requests' }
    return item
  })

  if (groups) {
    return (
      <aside className="workspace-sidebar" aria-label={ariaLabel || `${sidebarLabel} workspace`}>
        <Link className="workspace-sidebar__brand" to="/" aria-label="BasaChai home"><svg aria-hidden="true" viewBox="0 0 40 40"><path d="m4 18 16-13 16 13M9 16v19h22V16" /></svg><span>BasaChai</span></Link>
        <div className="workspace-sidebar__account-wrap">
          <div className="workspace-sidebar__account" aria-label={`${user?.full_name || 'Admin'} account`}>
            <UserAvatar authenticated className="workspace-sidebar__avatar" size="small" user={user} />
            <span className="workspace-sidebar__identity"><strong>{user?.full_name || 'Admin'}</strong><span>{sidebarLabel}</span></span>
          </div>
        </div>
        <nav aria-label={ariaLabel || `${sidebarLabel} navigation`} className="workspace-sidebar__nav workspace-sidebar__nav--grouped">
          {groups.map((group) => (
            <section className="workspace-sidebar__group" key={group.label}>
              <h2>{group.label}</h2>
              {group.links.map((item) => item.action
                ? <button className="workspace-sidebar__link" key={item.label} onClick={onLogout} type="button"><SidebarIcon name={item.icon} /><span>{item.label}</span></button>
                : <SidebarLink key={item.to} {...item} />)}
            </section>
          ))}
        </nav>
        <div className="workspace-sidebar__bottom"><img alt="" className="workspace-sidebar__illustration" src={sidebarIllustration} /><p>BasaChai Admin workspace.</p></div>
      </aside>
    )
  }

  return (
    <aside className="workspace-sidebar" aria-label={`${workspaceLabel} workspace`}>
      <div className="workspace-sidebar__account-wrap">
        <button
          aria-expanded={roleMenuOpen}
          className="workspace-sidebar__account"
          onClick={() => setRoleMenuOpen((open) => !open)}
          type="button"
        >
          <UserAvatar authenticated className="workspace-sidebar__avatar" size="small" user={user} />
          <span className="workspace-sidebar__identity">
            <strong>{user?.full_name || 'BasaChai member'}</strong>
            <span>{workspaceLabel}</span>
          </span>
          <svg aria-hidden="true" className="workspace-sidebar__account-chevron" viewBox="0 0 16 16"><path d="m3 6 5 5 5-5"/></svg>
        </button>
        {roleMenuOpen && (
          <div className="workspace-sidebar__role-menu">
            <Link onClick={() => setRoleMenuOpen(false)} to="/profile">My Profile</Link>
            {hasHomeSeekerRole && hasPropertyOwnerRole && (
              <Link onClick={() => setRoleMenuOpen(false)} to={switchTo}>Switch to {switchLabel}</Link>
            )}
          </div>
        )}
      </div>

      <nav aria-label={`${workspaceLabel} navigation`} className="workspace-sidebar__nav">
        {linksWithNotifications.map((item) => <SidebarLink key={item.to} {...item} />)}
        {ownerSectionAvailable && (
          <section className="workspace-sidebar__owner-section">
            <button
              aria-expanded={ownerExpanded}
              className="workspace-sidebar__owner-toggle"
              onClick={() => setOwnerExpanded((open) => !open)}
              type="button"
            >
              <SidebarIcon name="owner" />
              <span>Property Owner</span>
              <svg aria-hidden="true" className="workspace-sidebar__owner-chevron" viewBox="0 0 16 16"><path d="m3 6 5 5 5-5"/></svg>
            </button>
            {ownerExpanded && (
              <div className="workspace-sidebar__owner-links">
                <SidebarLink icon="listing" label="My Listings" to="/owner/listings" />
                <SidebarLink icon="add" label="Add Listing" to="/owner/listings/new" />
                <SidebarLink icon="shield" label="Moderation Feedback" to="/owner/moderation-feedback" />
              </div>
            )}
          </section>
        )}
      </nav>

      <div className="workspace-sidebar__bottom">
        <img alt="" className="workspace-sidebar__illustration" src={sidebarIllustration} />
        <p>Browsing as {user?.full_name || 'a BasaChai member'}.</p>
      </div>
    </aside>
  )
}
