import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'

export default function RequireRole({ role, roles }) {
  const { status, user, sessionExpired } = useAuth()
  const location = useLocation()
  const requiredRoles = roles || [role]

  if (status === 'checking') {
    return <div className="state-panel" role="status">Checking your session…</div>
  }

  if (status !== 'authenticated') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}`, sessionExpired }}
      />
    )
  }

  if (!requiredRoles.some((requiredRole) => user?.roles?.includes(requiredRole))) {
    const fallback = user?.roles?.includes('HOME_SEEKER')
      ? '/seeker'
      : user?.roles?.includes('PROPERTY_OWNER')
        ? '/owner'
        : '/'
    return <Navigate to={fallback} replace />
  }

  return <Outlet />
}
