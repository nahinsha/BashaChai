import { Outlet } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import WorkspaceSidebar from './WorkspaceSidebar.jsx'
import { useAuth } from '../context/useAuth.js'

const groups = [
  { label: 'Main', links: [{ to: '/moderation', label: 'Dashboard', icon: 'home', end: true }] },
  { label: 'Management', links: [
    { to: '/moderation/users', label: 'Users', icon: 'users' },
    { to: '/moderation/listings', label: 'Property Listings', icon: 'listing' },
    { to: '/moderation/reports', label: 'Reports', icon: 'report' },
    { to: '/moderation/viewing-requests', label: 'Viewing Requests', icon: 'viewing' },
  ] },
  { label: 'Oversight', links: [
    { to: '/moderation/feedback', label: 'Feedback & Reviews', icon: 'feedback' },
  ] },
  { label: 'Other', links: [
    { to: '/moderation/settings', label: 'Settings', icon: 'settings' },
    { label: 'Logout', icon: 'logout', action: true },
  ] },
]

export default function AdminLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const logout = async () => {
    try { await signOut() } catch { /* Local authentication is cleared by the shared logout helper. */ }
    navigate('/', { replace: true })
  }
  return (
    <div className="authenticated-workspace">
      <WorkspaceSidebar ariaLabel="Admin navigation" label="Admin workspace" user={user} groups={groups} onLogout={logout} />
      <div className="authenticated-workspace__content">
        <Outlet />
      </div>
    </div>
  )
}
