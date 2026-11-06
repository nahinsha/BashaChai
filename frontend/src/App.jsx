import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import RequireRole from './components/RequireRole.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { useAuth } from './context/useAuth.js'
import AdminLayout from './layouts/AdminLayout.jsx'
import OwnerLayout from './layouts/OwnerLayout.jsx'
import HomeSeekerLayout from './layouts/HomeSeekerLayout.jsx'
import HomePage from './pages/HomePage.jsx'
import ListingDetailsPage from './pages/ListingDetailsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ListingsPage from './pages/ListingsPage.jsx'
import OwnerDashboardPage from './pages/OwnerDashboardPage.jsx'
import OwnerListingsPage from './pages/OwnerListingsPage.jsx'
import CreateListingPage from './pages/CreateListingPage.jsx'
import EditListingPage from './pages/EditListingPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import HomeSeekerDashboardPage from './pages/HomeSeekerDashboardPage.jsx'
import ShortlistPage from './pages/ShortlistPage.jsx'
import { ConversationPage, ConversationListPage } from './pages/MessagingPages.jsx'
import ViewingRequestsPage from './pages/ViewingRequestsPage.jsx'
import ModerationReportsPage, { OwnerModerationFeedback } from './pages/ModerationPages.jsx'
import { AdminDashboardPage, AdminListingsPage, AdminSettingsPage, AdminUsersPage, AdminViewingRequestsPage } from './pages/AdminPages.jsx'
import { AdminPlatformFeedbackPage, MemberPlatformFeedbackPage } from './pages/PlatformFeedbackPages.jsx'
import ProfileManagementPage from './pages/ProfileManagementPage.jsx'
import PublicOwnerProfilePage from './pages/PublicOwnerProfilePage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import ComparePage from './pages/ComparePage.jsx'
import { ComparisonProvider } from './context/ComparisonContext.jsx'
import { useComparison } from './context/useComparison.js'
import WorkspaceSidebar from './layouts/WorkspaceSidebar.jsx'
import './App.css'

function AppLayout() {
  const { status, user, signOut } = useAuth()
  const { clearSelection } = useComparison()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(() => window.matchMedia('(min-width: 42.001rem)').matches)
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false)
  const roleSwitcherRef = useRef(null)
  const roles = user?.roles || []
  const hasHomeSeekerRole = roles.includes('HOME_SEEKER')
  const hasPropertyOwnerRole = roles.includes('PROPERTY_OWNER')
  const hasBothWorkspaceRoles = hasHomeSeekerRole && hasPropertyOwnerRole
  const isPublicHome = status !== 'authenticated' && location.pathname === '/'
  const isPublicListingDetails = status !== 'authenticated' && /^\/listings\/[^/]+\/?$/.test(location.pathname)
  const routeWorkspace = location.pathname.startsWith('/owner') && hasPropertyOwnerRole
    ? 'owner'
    : location.pathname.startsWith('/seeker') && hasHomeSeekerRole ? 'seeker' : null
  const rememberedWorkspace = window.sessionStorage.getItem('basachai.active-workspace')
  const activeWorkspace = routeWorkspace
    || (rememberedWorkspace === 'owner' && hasPropertyOwnerRole ? 'owner' : null)
    || (hasHomeSeekerRole ? 'seeker' : 'owner')
  const homeNavTarget = '/'
  const showWorkspaceSidebar = status === 'authenticated'
    && (hasHomeSeekerRole || hasPropertyOwnerRole)
    && !['/login', '/register', '/forgot-password', '/reset-password'].includes(location.pathname)
    && !location.pathname.startsWith('/moderation')

  useEffect(() => {
    if (routeWorkspace) window.sessionStorage.setItem('basachai.active-workspace', routeWorkspace)
  }, [routeWorkspace])

  useEffect(() => {
    if (!roleSwitcherOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!roleSwitcherRef.current?.contains(event.target)) setRoleSwitcherOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setRoleSwitcherOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [roleSwitcherOpen])

  const switchWorkspace = (workspace) => {
    setRoleSwitcherOpen(false)
    window.sessionStorage.setItem('basachai.active-workspace', workspace)
    navigate(workspace === 'owner' ? '/owner' : '/seeker', { replace: true })
  }

  const handleSignOut = async () => {
    clearSelection()
    try {
      await signOut()
    } catch {
      // The local session is cleared by the shared logout helper even if revocation fails.
    }
    navigate('/', { replace: true })
  }

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 42.001rem)')
    const syncNavigation = (event) => setMobileNavOpen(event.matches)
    desktop.addEventListener('change', syncNavigation)
    return () => desktop.removeEventListener('change', syncNavigation)
  }, [])

  return (
    <div className="app-frame">
      <header className={`app-header${status === 'authenticated' ? ' app-header--authenticated' : ''}${isPublicHome ? ' app-header--public-home' : ''}${isPublicListingDetails ? ' app-header--public-listing-details' : ''}`}>
        <div className="app-header__inner">
          <Link className="brand" to="/" aria-label="BasaChai home">
            <span className="brand__mark" aria-hidden="true">
              {status === 'authenticated' ? (
                <svg height="34" viewBox="0 0 36 36" width="34">
                  <path d="M4 16.5 18 5l14 11.5M8 15v16h20V15M14 31v-9h8v9M13 15h.01M23 15h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
                </svg>
              ) : isPublicHome || isPublicListingDetails ? (
                <svg height="44" viewBox="0 0 40 40" width="44"><path d="m4 18 16-13 16 13M9 16v19h22V16M16 35V23h8v12" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /></svg>
              ) : 'B'}
            </span>
            <span>BasaChai</span>
          </Link>

          <nav
            aria-label="Main navigation"
            className="primary-nav"
            hidden={!mobileNavOpen && !isPublicListingDetails}
            id="main-navigation"
            onClick={() => {
              if (!window.matchMedia('(min-width: 42.001rem)').matches) setMobileNavOpen(false)
            }}
          >
            <NavLink end to={homeNavTarget}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>
              Home
            </NavLink>
            {status === 'authenticated' && hasBothWorkspaceRoles && (
              <div className="role-switcher" ref={roleSwitcherRef}>
                <button
                  aria-expanded={roleSwitcherOpen}
                  aria-haspopup="menu"
                  aria-label={`Switch role. Current role: ${activeWorkspace === 'owner' ? 'Property Owner' : 'Home Seeker'}`}
                  className="role-switcher__toggle"
                  onClick={(event) => {
                    event.stopPropagation()
                    setRoleSwitcherOpen((open) => !open)
                  }}
                  type="button"
                >
                  {activeWorkspace === 'owner' ? 'Property Owner' : 'Home Seeker'}
                  <svg aria-hidden="true" className="role-switcher__chevron" viewBox="0 0 16 16"><path d="m3 6 5 5 5-5" /></svg>
                </button>
                {roleSwitcherOpen && (
                  <div className="role-switcher__menu" role="menu" aria-label="Switch workspace">
                    <button aria-checked={activeWorkspace === 'seeker'} onClick={() => switchWorkspace('seeker')} role="menuitemradio" type="button">Home Seeker</button>
                    <button aria-checked={activeWorkspace === 'owner'} onClick={() => switchWorkspace('owner')} role="menuitemradio" type="button">Property Owner</button>
                  </div>
                )}
              </div>
            )}
          </nav>

          <button
            aria-label={mobileNavOpen ? 'Close main navigation' : 'Open main navigation'}
            aria-controls="main-navigation"
            aria-expanded={mobileNavOpen}
            className="button button--quiet mobile-nav-toggle"
            onClick={() => setMobileNavOpen((open) => !open)}
            type="button"
          >
            <svg aria-hidden="true" height="18" viewBox="0 0 20 20" width="18">
              <path d="M3 5h14M3 10h14M3 15h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            </svg>
          </button>

          <div className="header-actions">
            {status === 'authenticated' ? (
              <button className="button button--quiet authenticated-sign-out" onClick={handleSignOut} type="button">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg>
                Sign out
              </button>
            ) : (
              <>
                <NavLink className="button button--quiet" to="/login">Sign in</NavLink>
                <NavLink className="button button--primary" to="/register">Create account</NavLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="app-main" id="main-content">
        {showWorkspaceSidebar ? (
          <div className="authenticated-workspace">
            <WorkspaceSidebar user={user} workspace={activeWorkspace} />
            <div className="authenticated-workspace__content"><Outlet /></div>
          </div>
        ) : <Outlet />}
      </main>

      <footer className="app-footer">
        <div className="app-footer__inner">BasaChai</div>
      </footer>
    </div>
  )
}

function RoutePlaceholder({ title, eyebrow = 'BasaChai' }) {
  return (
    <section className="placeholder-card" aria-labelledby="placeholder-title">
      <p className="eyebrow">{eyebrow}</p>
      <h1 id="placeholder-title">{title}</h1>
      <p className="placeholder-card__copy">
        This area is not part of the public browsing experience yet.
      </p>
    </section>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ComparisonProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage publicView />} />
            <Route path="listings" element={<ListingsPage />} />
            <Route path="listings/:listingId" element={<ListingDetailsPage />} />
            <Route path="owners/:ownerId" element={<PublicOwnerProfilePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route path="register" element={<RegisterPage />} />

            <Route element={<RequireRole roles={['HOME_SEEKER', 'PROPERTY_OWNER']} />}>
              <Route path="profile" element={<ProfileManagementPage />} />
            </Route>

            <Route element={<RequireRole role="HOME_SEEKER" />}>
              <Route path="seeker" element={<HomeSeekerLayout />}>
                <Route index element={<HomeSeekerDashboardPage />} />
                <Route path="saved-listings" element={<ShortlistPage />} />
                <Route path="compare" element={<ComparePage />} />
                <Route path="messages" element={<ConversationListPage workspace="seeker" />} />
                <Route path="messages/:conversationId" element={<ConversationPage backPath="/seeker/messages" />} />
                <Route path="viewing-requests" element={<ViewingRequestsPage workspace="seeker" />} />
                <Route path="feedback" element={<MemberPlatformFeedbackPage />} />
              </Route>
            </Route>

            <Route element={<RequireRole role="PROPERTY_OWNER" />}>
              <Route path="owner" element={<OwnerLayout />}>
                <Route index element={<OwnerDashboardPage />} />
                <Route path="listings" element={<OwnerListingsPage />} />
                <Route path="listings/new" element={<CreateListingPage />} />
                <Route path="listings/:listingId/edit" element={<EditListingPage />} />
                <Route path="viewing-requests" element={<ViewingRequestsPage workspace="owner" />} />
                <Route path="messages" element={<ConversationListPage workspace="owner" />} />
                <Route path="messages/:conversationId" element={<ConversationPage backPath="/owner/messages" />} />
                <Route path="profile" element={<Navigate replace to="/profile" />} />
                <Route path="moderation-feedback" element={<OwnerModerationFeedback />} />
                <Route path="feedback" element={<MemberPlatformFeedbackPage />} />
              </Route>
            </Route>

            <Route element={<RequireRole role="ADMIN_MODERATOR" />}>
              <Route path="moderation" element={<AdminLayout />}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="reports" element={<ModerationReportsPage />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="listings" element={<AdminListingsPage />} />
                <Route path="viewing-requests" element={<AdminViewingRequestsPage />} />
                <Route path="feedback" element={<AdminPlatformFeedbackPage />} />
                <Route path="overview" element={<Navigate replace to="/moderation" />} />
                <Route path="settings" element={<AdminSettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<RoutePlaceholder title="Page not found" eyebrow="404" />} />
          </Route>
        </Routes>
        </ComparisonProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
