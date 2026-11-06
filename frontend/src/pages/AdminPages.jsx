import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/useAuth.js'
import './AdminPages.css'

function AdminHeading({ title, copy, className = '' }) {
  return <header className={`owner-page-heading admin-page-heading ${className}`}><div><p className="eyebrow">Admin / Moderator</p><h1>{title}</h1>{copy && <p>{copy}</p>}</div></header>
}

function useAdminData(path) {
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ key: '', data: null, error: null })
  const requestKey = `${path}:${retry}`
  useEffect(() => {
    let active = true
    apiRequest(path, { auth: true })
      .then((data) => { if (active) setState({ key: requestKey, data, error: null }) })
      .catch((error) => { if (active) setState({ key: requestKey, data: null, error }) })
    return () => { active = false }
  }, [path, requestKey])
  const reload = () => setRetry((value) => value + 1)
  return { data: state.key === requestKey ? state.data : null, error: state.key === requestKey ? state.error : null, loading: state.key !== requestKey, reload }
}

function DashboardIcon({ name }) {
  const paths = {
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5" /></>,
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-6h6v6" /></>,
    flag: <><path d="M5 21V4m0 1h13l-3 5 3 5H5" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    file: <><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v6h5" /></>,
    building: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2M10 21v-3h4v3" /></>,
    message: <><path d="M4 5h16v12H8l-4 3z" /><path d="M8 9h8m-8 4h5" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function DashboardTodayMetrics({ summary }) {
  const items = [
    { label: 'New Users Today', value: summary.new_users_today, copy: 'Registered today', icon: 'users' },
    { label: 'New Listings Today', value: summary.new_listings_today, copy: 'Created today', icon: 'home' },
    { label: 'Viewing Requests Today', value: summary.viewing_requests_today, copy: 'Submitted today', icon: 'eye', tone: 'warning' },
    { label: 'Feedback Received Today', value: summary.feedback_today, copy: 'Submitted today', icon: 'message', tone: 'teal' },
  ]
  return <section className="admin-dashboard-section" aria-labelledby="admin-glance-title">
    <h2 id="admin-glance-title">Today at a glance</h2>
    <div className="admin-dashboard-metrics">{items.map((item) => <article className={`admin-dashboard-metric${item.tone ? ` admin-dashboard-metric--${item.tone}` : ''}`} key={item.label}><span className="admin-dashboard-icon"><DashboardIcon name={item.icon} /></span><div><span className="admin-dashboard-metric__label">{item.label}</span><strong>{item.value ?? '—'}</strong><span className="admin-dashboard-metric__copy">{item.copy}</span></div></article>)}</div>
  </section>
}

function DashboardPlatformMetrics({ summary }) {
  const items = [
    { label: 'Total Users', value: summary.total_users, icon: 'users', tone: 'bright' },
    { label: 'Total Properties', value: summary.total_listings, icon: 'building', tone: 'teal' },
    { label: 'Published Listings', value: summary.published_listings, icon: 'check', tone: 'dark' },
    { label: 'Available Properties', value: summary.available_listings, icon: 'home', tone: 'dark' },
    { label: 'Total Viewing Requests', value: summary.total_viewing_requests, icon: 'eye', tone: 'warning' },
    { label: 'Total Conversations', value: summary.total_conversations, icon: 'message', tone: 'muted' },
  ]
  return <section className="admin-dashboard-section" aria-labelledby="admin-platform-overview-title">
    <h2 id="admin-platform-overview-title">Platform Overview</h2>
    <div className="admin-platform-metrics">{items.map((item) => <article className={`admin-platform-metric admin-platform-metric--${item.tone}`} key={item.label}><span className="admin-dashboard-icon"><DashboardIcon name={item.icon} /></span><div><span>{item.label}</span><strong>{item.value ?? '—'}</strong></div></article>)}</div>
  </section>
}

function NeedsAttention({ summary }) {
  const items = [
    { label: 'Pending Reports', value: summary.pending_reports ?? 0, copy: 'Reports waiting for a moderator to review.', action: 'Review reports', to: '/moderation/reports', icon: 'flag' },
    { label: 'Listings to Reconfirm', value: summary.listings_needing_reconfirmation ?? 0, copy: summary.listings_needing_reconfirmation ? 'Availability needs an update.' : 'Availability is up to date on all listings.', action: 'Open listings', to: '/moderation/listings', icon: 'refresh', tone: '' },
    { label: 'Pending Feedback', value: summary.pending_feedback ?? 0, copy: 'Feedback waiting for an admin to review.', action: 'Open Feedback & Reviews', to: '/moderation/feedback', icon: 'message' },
  ]
  const attentionCount = items.filter((item) => item.value > 0).reduce((total, item) => total + item.value, 0)
  return <section className="admin-dashboard-section" aria-labelledby="admin-needs-attention-title">
    <div className="admin-section-heading"><h2 id="admin-needs-attention-title">Needs Attention</h2><span className={`admin-attention-total${attentionCount ? ' admin-attention-total--active' : ''}`}><i />{attentionCount} {attentionCount === 1 ? 'item' : 'items'} need attention</span></div>
    <div className="admin-needs-attention">{items.map((item) => <article className={`admin-attention-card${item.value ? ' admin-attention-card--active' : ''}`} key={item.label}><div className="admin-attention-card__top"><span className={`admin-dashboard-icon${item.value ? ' admin-dashboard-icon--warning' : ''}`}><DashboardIcon name={item.icon} /></span><span className={`admin-attention-status${item.value ? ' admin-attention-status--action' : ''}`}>{item.value ? 'Needs action' : 'All clear'}</span></div><div><span className="admin-attention-card__label">{item.label}</span><strong>{item.value}</strong><p>{item.copy}</p></div><Link className="admin-attention-action" to={item.to}>{item.action}<span aria-hidden="true">→</span></Link></article>)}</div>
  </section>
}

function BreakdownChart({ title, total, entries }) {
  const chartTotal = entries.reduce((sum, entry) => sum + entry.value, 0)
  return <article className="admin-breakdown-card"><h3>{title}</h3><p>{chartTotal} {total}</p><div className="admin-breakdown-bar" role="img" aria-label={`${title}: ${entries.map(({ label, value }) => `${label} ${value}`).join(', ')}`}>
    {entries.map((entry) => <span className={`admin-breakdown-segment admin-breakdown-segment--${entry.tone}`} key={entry.label} style={{ width: `${chartTotal ? entry.value / chartTotal * 100 : 0}%` }} />)}
  </div><ul>{entries.map((entry) => <li key={entry.label}><span className={`admin-breakdown-dot admin-breakdown-dot--${entry.tone}`} /><span>{entry.label}</span><strong>{entry.value}</strong></li>)}</ul></article>
}

function PlatformInsights({ summary }) {
  return <section className="admin-dashboard-section" aria-labelledby="admin-insights-title"><h2 id="admin-insights-title">Platform Insights</h2><div className="admin-insights-grid">
    <DonutBreakdown title="Users by Role" total={summary.total_users} entries={[
      { label: 'Home Seekers', value: summary.home_seekers ?? 0, tone: 'bright' },
      { label: 'Property Owners', value: summary.property_owners ?? 0, tone: 'dark' },
      { label: 'Admin / Other', value: summary.other_roles ?? 0, tone: 'soft' },
    ]} />
    <DonutBreakdown title="Listings by Status" total={summary.total_properties_all_statuses} entries={[
      { label: 'Published', value: summary.published_listings ?? 0, tone: 'dark' },
      { label: 'Draft / Unpublished', value: (summary.draft_listings ?? 0) + (summary.unpublished_listings ?? 0), tone: 'orange' },
      { label: 'Removed', value: summary.removed_listings ?? 0, tone: 'soft' },
    ]} />
    <DonutBreakdown title="Viewing Requests by Status" total={summary.total_viewing_requests} entries={[
      { label: 'Pending', value: summary.pending_viewing_requests ?? 0, tone: 'orange' },
      { label: 'Accepted', value: summary.accepted_viewing_requests ?? 0, tone: 'bright' },
      { label: 'Rejected', value: summary.rejected_viewing_requests ?? 0, tone: 'red' },
      { label: 'Cancelled', value: summary.cancelled_viewing_requests ?? 0, tone: 'soft' },
    ]} />
  </div></section>
}

function DonutBreakdown({ title, total = 0, entries }) {
  const sum = entries.reduce((current, item) => current + item.value, 0)
  let cursor = 0
  const stops = entries.map((item) => {
    const start = cursor
    cursor += sum ? item.value / sum * 100 : 0
    return `var(--admin-chart-${item.tone}) ${start}% ${cursor}%`
  })
  const background = sum ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(var(--admin-chart-empty) 0 100%)'
  return <article className="admin-insight-card"><h3>{title}</h3><div className="admin-donut-layout"><div className="admin-donut" role="img" aria-label={`${title}: ${entries.map((item) => `${item.label} ${item.value}`).join(', ')}`} style={{ background }}><div><strong>{total ?? sum}</strong><span>total</span></div></div><ul>{entries.map((item) => <li key={item.label}><i className={`admin-insight-dot admin-insight-dot--${item.tone}`} /><span>{item.label}</span><strong>{item.value}</strong></li>)}</ul></div></article>
}

function ViewingActivity({ summary, range, onRangeChange, startDate, endDate, setStartDate, setEndDate }) {
  const activity = summary.viewing_activity
  const totals = [
    { label: 'Total Requests', value: activity.requests, icon: 'list', tone: 'bright' },
    { label: 'Accepted', value: activity.accepted, icon: 'check', tone: 'dark' },
    { label: 'Rejected', value: activity.rejected, icon: 'flag', tone: 'red' },
    { label: 'Pending', value: activity.pending, icon: 'calendar', tone: 'orange' },
  ]
  const maxValue = Math.max(1, ...activity.days.flatMap((day) => [day.submitted, day.accepted, day.rejected]))
  const chartW = 1000
  const chartH = 260
  const plot = { x: 54, y: 22, w: 924, h: 176 }
  const step = plot.w / Math.max(activity.days.length, 1)
  const barWidth = Math.max(3, Math.min(15, step * .19))
  const tickStep = Math.max(1, Math.ceil(maxValue / 4))
  const ticks = []
  for (let value = 0; value <= maxValue; value += tickStep) ticks.push(value)
  if (ticks[ticks.length - 1] !== maxValue) ticks.push(maxValue)
  const labelEvery = Math.max(1, Math.ceil(activity.days.length / 10))
  return <section className="admin-dashboard-section" aria-labelledby="admin-viewing-activity-title">
    <h2 id="admin-viewing-activity-title">Viewing Activity</h2>
    <div className="admin-viewing-activity-card">
      <div className="admin-activity-toolbar">
        <div className="admin-activity-range" role="group" aria-label="Viewing activity date range">
          {[['today', 'Today'], ['7d', 'Last 7 Days'], ['30d', 'Last 30 Days'], ['custom', 'Custom range']].map(([value, label]) => <button aria-pressed={range === value} className={range === value ? 'is-active' : ''} key={value} onClick={() => onRangeChange(value)} type="button">{label}</button>)}
        </div>
        {range === 'custom' ? <div className="admin-activity-custom-dates"><label>From <input aria-label="Start date" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label><label>To <input aria-label="End date" onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label></div> : <p className="admin-activity-date-range"><DashboardIcon name="calendar" />{formatDateOnly(activity.start_date)} to {formatDateOnly(activity.end_date)}</p>}
      </div>
      <div className="admin-activity-totals">{totals.map((item) => <article className="admin-activity-total" key={item.label}><span className={`admin-dashboard-icon admin-dashboard-icon--${item.tone}`}><DashboardIcon name={item.icon} /></span><div><span>{item.label}</span><strong>{item.value}</strong></div></article>)}</div>
      <div className="admin-activity-chart-heading"><h3>Daily viewing activity</h3><ul aria-label="Chart legend"><li><i className="admin-insight-dot admin-insight-dot--dark" />Submitted</li><li><i className="admin-insight-dot admin-insight-dot--bright" />Accepted</li><li><i className="admin-insight-dot admin-insight-dot--red" />Rejected</li></ul></div>
      <div className="admin-activity-chart-scroll"><svg className="admin-activity-chart" viewBox={`0 0 ${chartW} ${chartH}`} role="img" aria-label={`Viewing requests from ${formatDateOnly(activity.start_date)} to ${formatDateOnly(activity.end_date)}. ${activity.days.map((day) => `${formatDateOnly(day.date)}: ${day.submitted} submitted, ${day.accepted} accepted, ${day.rejected} rejected`).join('. ')}`}>
        {ticks.map((value) => {
          const y = plot.y + plot.h - value / maxValue * plot.h
          return <g key={value}><line x1={plot.x} x2={plot.x + plot.w} y1={y} y2={y} /><text x={plot.x - 12} y={y + 5}>{value}</text></g>
        })}
        {activity.days.map((day, index) => {
          const x = plot.x + step * (index + .5)
          const values = [{ value: day.submitted, color: 'var(--color-primary-dark)' }, { value: day.accepted, color: '#65c995' }, { value: day.rejected, color: '#df2929' }]
          return <g key={day.date}>
            {values.map((item, itemIndex) => {
              const height = item.value / maxValue * plot.h
              return <rect key={itemIndex} x={x + (itemIndex - 1) * (barWidth + 2) - barWidth / 2} y={plot.y + plot.h - height} width={barWidth} height={height} rx="3" fill={item.color} />
            })}
            {(index % labelEvery === 0 || index === activity.days.length - 1) && <text className="admin-activity-chart__date" x={x} y={plot.y + plot.h + 31}>{shortDate(day.date)}</text>}
          </g>
        })}
      </svg></div>
      <p className="admin-activity-caption">Submitted, accepted and rejected are counted on the date each event happened.</p>
    </div>
  </section>
}

function RecentActivity({ items }) {
  return <section className="admin-dashboard-section" aria-labelledby="admin-recent-activity-title"><h2 id="admin-recent-activity-title">Recent Activity</h2><div className="admin-recent-activity-card">
    {items.length ? <ul>{items.map((item) => <li key={item.id}><span className={`admin-dashboard-icon admin-recent-icon--${item.icon}`}><DashboardIcon name={item.icon} /></span><div><strong>{item.title}</strong><span>{item.description}</span></div><time dateTime={item.created_at}>{dateTimeLabel(item.created_at)}</time></li>)}</ul> : <p className="admin-recent-empty">No activity to show yet.</p>}
  </div></section>
}

export function AdminDashboardPage() {
  const { user } = useAuth()
  const [range, setRange] = useState('7d')
  const today = todayInDhaka()
  const [startDate, setStartDate] = useState(() => dateDaysBefore(6))
  const [endDate, setEndDate] = useState(today)
  const params = new URLSearchParams({ range })
  if (range === 'custom') {
    params.set('start_date', startDate)
    params.set('end_date', endDate)
  }
  const { data, error, loading, reload } = useAdminData(`/admin/overview/?${params}`)
  const name = user?.full_name?.trim().split(/\s+/)[0] || 'Admin'
  return <section className="admin-page admin-page--dashboard"><div className="admin-dashboard-title-row"><AdminHeading className="admin-dashboard-heading" title="Dashboard" copy={`Welcome back, ${name}. Here is how BasaChai is doing.`} /><div className="admin-dashboard-header-actions">{data?.generated_at && <span>Updated {dateTimeLabel(data.generated_at)}</span>}<button className="admin-dashboard-refresh" onClick={reload} type="button"><DashboardIcon name="refresh" /> Refresh</button></div></div>
    {loading && <p role="status">Loading platform summary…</p>}
    {error && <div className="admin-state" role="alert"><p>{error.message || 'Platform summary could not be loaded.'}</p><button className="button button--primary" onClick={reload} type="button">Try again</button></div>}
    {data && <>
      <DashboardTodayMetrics summary={data} />
      <DashboardPlatformMetrics summary={data} />
      <NeedsAttention summary={data} />
      <ViewingActivity summary={data} range={range} onRangeChange={setRange} startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} />
      <PlatformInsights summary={data} />
      <RecentActivity items={data.recent_activity || []} />
    </>}
  </section>
}

export function AdminUsersPage() {
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const query = new URLSearchParams({ page: String(page) })
  if (filter) query.set('role', filter)
  const state = useAdminData(`/admin/users/?${query.toString()}`)
  const updateStatus = async (user) => {
    setBusyId(user.id); setError(''); setNotice('')
    try {
      await apiRequest(`/admin/users/${user.id}/`, { method: 'PATCH', body: { is_active: !user.is_active }, auth: true })
      setNotice(`Account ${user.is_active ? 'deactivated' : 'reactivated'}.`)
      state.reload()
    } catch (issue) { setError(issue.message || 'Account status could not be changed.') }
    finally { setBusyId(null) }
  }
  return <section className="admin-page"><AdminHeading title="Users" copy="View Home Seeker and Property Owner accounts and manage account access." />
    <label className="admin-filter">Role <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1) }}><option value="">All public roles</option><option value="HOME_SEEKER">Home Seeker</option><option value="PROPERTY_OWNER">Property Owner</option></select></label>
    {error && <p className="admin-inline-error" role="alert">{error}</p>}{notice && <p className="admin-inline-notice" role="status">{notice}</p>}
    <AdminTableState loading={state.loading} error={state.error} retry={state.reload} empty={!state.loading && !state.error && !state.data?.results?.length} emptyText="No matching user accounts." />
    {state.data?.results?.length > 0 && <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead><tbody>{state.data.results.map((user) => <tr key={user.id}><td>{user.full_name}</td><td>{user.email}</td><td>{user.roles.filter((role) => role !== 'ADMIN_MODERATOR').map(roleLabel).join(', ') || 'Admin / Moderator'}</td><td>{dateLabel(user.date_joined)}</td><td>{user.is_active ? 'Active' : 'Inactive'}</td><td><button className="button button--quiet" disabled={busyId === user.id || user.id === state.data.current_user_id} onClick={() => updateStatus(user)} type="button">{user.is_active ? 'Deactivate' : 'Reactivate'}</button></td></tr>)}</tbody></table></div><AdminPagination page={page} data={state.data} setPage={setPage} /></>}
  </section>
}

export function AdminListingsPage() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const query = new URLSearchParams({ page: String(page) })
  if (status) query.set('status', status)
  const state = useAdminData(`/admin/listings/?${query}`)
  return <section className="admin-page"><AdminHeading title="Property Listings" copy="Review listing status and open reported listings in the moderation queue." />
    <label className="admin-filter">Listing status <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option>{['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'REMOVED'].map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
    <AdminTableState loading={state.loading} error={state.error} retry={state.reload} empty={!state.loading && !state.error && !state.data?.results?.length} emptyText="No listings match this status." />
    {state.data?.results?.length > 0 && <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Listing</th><th>Owner</th><th>Location</th><th>Rent</th><th>Status</th><th>Added</th></tr></thead><tbody>{state.data.results.map((item) => <tr key={item.id}><td>{item.title || `Listing ${item.id}`}</td><td>{item.owner.full_name}</td><td>{item.location || '—'}</td><td>৳{Number(item.monthly_rent).toLocaleString()}</td><td>{statusLabel(item.lifecycle_status)}</td><td>{dateLabel(item.created_at)}</td></tr>)}</tbody></table></div><AdminPagination page={page} data={state.data} setPage={setPage} /><p className="admin-page-note">Moderation actions for reported listings are available in <Link to="/moderation/reports">Reports</Link>.</p></>}
  </section>
}

export function AdminViewingRequestsPage() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selectedDate, setSelectedDate] = useState(() => todayInDhaka())
  const query = new URLSearchParams({ page: String(page) })
  if (status) query.set('status', status)
  query.set('date', selectedDate)
  const state = useAdminData(`/admin/viewing-requests/?${query}`)
  const statistics = state.data?.statistics
  const summaryCards = [
    { label: 'Today’s requests', value: statistics?.today_requests ?? 0, tone: 'bright' },
    { label: 'Accepted today', value: statistics?.accepted_today ?? 0, tone: 'dark' },
    { label: 'Rejected today', value: statistics?.rejected_today ?? 0, tone: 'warning' },
    { label: 'Currently pending', value: statistics?.currently_pending ?? 0, tone: 'soft' },
  ]
  return <section className="admin-page admin-page--viewing-monitor"><AdminHeading title="Viewing Requests" copy="Monitor request activity and status trends." />
    <div className="admin-monitor-toolbar">
      <label className="admin-date-filter" htmlFor="admin-viewing-date">Statistics date</label>
      <input id="admin-viewing-date" className="admin-date-input" type="date" required value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setPage(1) }} />
      <span className="admin-page-note">Daily totals use request and status update timestamps.</span>
    </div>
    {state.loading && <p className="admin-state" role="status">Loading viewing request statistics…</p>}
    {state.error && <div className="admin-state" role="alert"><p>{state.error.message || 'Viewing request statistics could not be loaded.'}</p><button className="button button--primary" onClick={state.reload} type="button">Try again</button></div>}
    {statistics && <>
      <section className="admin-dashboard-section admin-monitor-summary" aria-label={`Viewing request summary for ${formatDateOnly(selectedDate)}`}>
        <div className="admin-monitor-cards">{summaryCards.map((item) => <article className={`admin-monitor-card admin-monitor-card--${item.tone}`} key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}</div>
      </section>
      <section className="admin-dashboard-section admin-monitor-trend" aria-labelledby="admin-viewing-trend-title">
        <div className="admin-monitor-section-heading"><div><h2 id="admin-viewing-trend-title">Last 7 Days</h2><p>Requests created each day through {formatDateOnly(selectedDate)}.</p></div><strong>{statistics.last_7_days.reduce((sum, item) => sum + item.count, 0)} total</strong></div>
        <div className="admin-daily-chart" role="img" aria-label={`Daily viewing requests: ${statistics.last_7_days.map((item) => `${formatDateOnly(item.date)}, ${item.count}`).join('; ')}`}>
          {statistics.last_7_days.map((item) => {
            const maxCount = Math.max(1, ...statistics.last_7_days.map((day) => day.count))
            const height = item.count ? Math.max(8, item.count / maxCount * 100) : 0
            return <div className="admin-daily-chart__day" key={item.date} title={`${formatDateOnly(item.date)}: ${item.count} requests`}><strong>{item.count}</strong><div className="admin-daily-chart__track"><span style={{ height: `${height}%` }} /></div><span>{new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${item.date}T12:00:00Z`))}</span><small>{item.date.slice(5)}</small></div>
          })}
        </div>
      </section>
    </>}
    <section className="admin-dashboard-section admin-monitor-records" aria-labelledby="admin-viewing-records-title">
      <div className="admin-monitor-section-heading"><div><h2 id="admin-viewing-records-title">Request records</h2><p>Read only request history.</p></div></div>
      <label className="admin-filter">Request status <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option>{['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'].map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
      <AdminTableState loading={false} error={null} retry={state.reload} empty={!state.loading && !state.error && !state.data?.results?.length} emptyText="No viewing requests match this status." />
      {state.data?.results?.length > 0 && <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Listing</th><th>Home Seeker</th><th>Owner</th><th>Preferred time</th><th>Status</th></tr></thead><tbody>{state.data.results.map((item) => <tr key={item.id}><td>{item.listing.title || `Listing ${item.listing.id}`}</td><td>{item.seeker.full_name}</td><td>{item.owner.full_name}</td><td>{dateLabel(item.preferred_at)}</td><td>{statusLabel(item.status)}</td></tr>)}</tbody></table></div><AdminPagination page={page} data={state.data} setPage={setPage} /></>}
    </section>
  </section>
}

export function AdminSettingsPage() {
  const { user, updateUser } = useAuth()
  const [name, setName] = useState(user?.full_name || '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setMessage(''); setError('')
    try { const updated = await apiRequest('/me/', { method: 'PATCH', body: { full_name: name }, auth: true }); updateUser(updated); setMessage('Admin profile updated.') }
    catch (issue) { setError(issue.message || 'Profile settings could not be saved.') }
    finally { setSaving(false) }
  }
  return <section className="admin-page"><AdminHeading title="Settings" copy="Manage your admin account profile." />
    <form className="admin-settings-card" onSubmit={save}><label>Full name<input maxLength="150" onChange={(event) => setName(event.target.value)} required value={name} /></label><label>Email<input readOnly value={user?.email || ''} /></label>{error && <p className="admin-inline-error" role="alert">{error}</p>}{message && <p className="admin-inline-notice" role="status">{message}</p>}<button className="button button--primary" disabled={saving || !name.trim() || name.trim() === user?.full_name} type="submit">{saving ? 'Saving…' : 'Save profile'}</button><p>Password changes use BasaChai’s existing <Link to="/forgot-password">password recovery</Link> flow.</p></form>
  </section>
}

function AdminTableState({ loading, error, retry, empty, emptyText }) {
  if (loading) return <p className="admin-state" role="status">Loading…</p>
  if (error) return <div className="admin-state" role="alert"><p>{error.message || 'Data could not be loaded.'}</p><button className="button button--primary" onClick={retry} type="button">Try again</button></div>
  return empty ? <p className="admin-state">{emptyText}</p> : null
}

function AdminPagination({ page, data, setPage }) {
  const pages = Math.max(1, Math.ceil((data?.count || 0) / (data?.page_size || 20)))
  return <nav aria-label="Pages" className="admin-pagination"><button className="button button--quiet" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button><span>Page {page} of {pages} · {data.count} records</span><button className="button button--quiet" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} type="button">Next</button></nav>
}

function roleLabel(value) { return value === 'HOME_SEEKER' ? 'Home Seeker' : value === 'PROPERTY_OWNER' ? 'Property Owner' : 'Admin / Moderator' }
function statusLabel(value) { return value ? value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : '—' }
function dateLabel(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—' }
function todayInDhaka() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
function formatDateOnly(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) }
function dateDaysBefore(days) { const value = new Date(`${todayInDhaka()}T12:00:00Z`); value.setUTCDate(value.getUTCDate() - days); return value.toISOString().slice(0, 10) }
function dateTimeLabel(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' }).format(new Date(value)) : '—' }
function shortDate(value) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) }
