import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import PropertyImage from '../components/PropertyImage.jsx'
import './ModerationPages.css'

const REPORT_STATUSES = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
}

const QUEUE_FILTERS = [
  { value: '', label: 'Open reports' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REJECTED', label: 'Rejected' },
]

function dateTimeLabel(value) {
  if (!value) return 'Not provided'
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Not provided'
    : new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function rentLabel(value) {
  return value == null ? 'Rent not provided' : `৳${Number(value).toLocaleString('en-BD')} / month`
}

function errorText(error) {
  if (error.status === 409) return 'This report or listing has changed. Reload the details and try again.'
  if (error.status === 403) return 'You do not have permission to manage this report.'
  if (error.status === 404) return 'This report is no longer available.'
  return error.message || 'The moderation request could not be completed. Please try again.'
}

function ListingImage({ image }) {
  return (
    <div className="moderation-photo">
      <PropertyImage
        alt={`Listing photo ${image.slot}`}
        authenticated
        fallbackAriaLabel={`Photo ${image.slot} preview unavailable`}
        fallbackClassName="moderation-photo__missing"
        fallbackLabel="Photo unavailable"
        loadingLabel={`Loading photo ${image.slot}…`}
        src={image.url}
      />
      <span>Photo {image.slot}</span>
    </div>
  )
}

function ListingReview({ report, loading, error, retry, onAction, action, actionError, notice, onFeedback }) {
  const [feedbackReason, setFeedbackReason] = useState('')
  const listing = report?.listing
  const canSetOutcome = report?.status === 'UNDER_REVIEW'
  const canUnpublish = ['UNDER_REVIEW', 'RESOLVED'].includes(report?.status)
    && listing?.lifecycle_status === 'PUBLISHED'
    && !listing?.has_active_moderation_hold

  const submitFeedback = (event) => {
    event.preventDefault()
    if (!feedbackReason.trim()) return
    onFeedback(feedbackReason.trim(), () => setFeedbackReason(''))
  }

  if (!report && !loading && !error) {
    return (
      <div className="state-panel moderation-detail-prompt">
        <h2>Select a report</h2>
        <p>Choose a report to review its listing details, photos, and current status.</p>
      </div>
    )
  }
  if (loading) return <div className="state-panel" role="status">Loading report details...</div>
  if (error) {
    return (
      <div className="state-panel state-panel--error" role="alert">
        <h2>Report details could not be loaded</h2>
        <p>{error}</p>
        <button className="button button--primary" onClick={retry} type="button">Try again</button>
      </div>
    )
  }
  if (!listing) return null

  return (
    <article className="moderation-review-card">
      <header className="moderation-review-card__heading">
        <div>
          <p className="eyebrow">Report {report.id}</p>
          <h2>{listing.title || `Listing ${listing.id}`}</h2>
          <p>{listing.location || 'Location not provided'}</p>
        </div>
        <span className={`moderation-status moderation-status--${String(report.status).toLowerCase()}`}>
          {REPORT_STATUSES[report.status] || 'Status unavailable'}
        </span>
      </header>

      {notice && <p className="moderation-notice" role="status">{notice}</p>}
      {actionError && (
        <div className="moderation-error" role="alert">
          <p>{actionError}</p>
          <button className="button button--quiet" disabled={Boolean(action)} onClick={retry} type="button">Reload details</button>
        </div>
      )}

      <div className="moderation-review-card__body">
        <div className="moderation-review-card__content">
      <section className="moderation-review-section moderation-report-reason-card" aria-labelledby="moderation-report-reason">
        <h3 id="moderation-report-reason">Report reason</h3>
        <p className="moderation-report-reason">{report.reason}</p>
        <p className="moderation-meta">Submitted {dateTimeLabel(report.created_at)}</p>
      </section>

      <section className="moderation-review-section" aria-labelledby="moderation-listing-details">
        <h3 id="moderation-listing-details">Listing details</h3>
        <dl className="moderation-listing-facts">
          <div><dt>Rent</dt><dd>{rentLabel(listing.monthly_rent)}</dd></div>
          <div><dt>Property type</dt><dd>{listing.property_type || 'Not provided'}</dd></div>
          <div><dt>Bedrooms</dt><dd>{listing.bedrooms ?? 'Not provided'}</dd></div>
          <div><dt>Bathrooms</dt><dd>{listing.bathrooms ?? 'Not provided'}</dd></div>
          <div><dt>Listing status</dt><dd>{listing.lifecycle_status || 'Unknown'}</dd></div>
          <div><dt>Availability</dt><dd>{listing.availability?.status || 'Unknown'}</dd></div>
          <div><dt>Created</dt><dd>{dateTimeLabel(listing.created_at)}</dd></div>
          <div><dt>Last updated</dt><dd>{dateTimeLabel(listing.updated_at)}</dd></div>
        </dl>
        <p className="moderation-listing-description">{listing.description || 'No description provided.'}</p>
        {listing.amenities?.length > 0 && (
          <ul className="moderation-amenities">{listing.amenities.map((amenity, index) => <li key={`${amenity}-${index}`}>{amenity}</li>)}</ul>
        )}
      </section>

      <section className="moderation-review-section" aria-labelledby="moderation-listing-photos">
        <h3 id="moderation-listing-photos">Listing photos</h3>
        {listing.images?.length
          ? <div className="moderation-photo-grid">{listing.images.map((image) => <ListingImage image={image} key={image.id} />)}</div>
          : <p className="moderation-meta">No listing photos are available.</p>}
      </section>
        </div>
        <aside className="moderation-review-card__sidebar">

      {report.reviewed_by && (
        <p className="moderation-reviewed-by"><span aria-hidden="true">✓</span>Reviewed by {report.reviewed_by.full_name || 'Admin / Moderator'}{report.reviewed_at ? ` on ${dateTimeLabel(report.reviewed_at)}` : ''}</p>
      )}

      {report.feedback?.length > 0 && (
        <section className="moderation-review-section" aria-labelledby="moderation-feedback-recorded">
          <h3 id="moderation-feedback-recorded">Owner feedback</h3>
          {report.feedback.map((item) => (
            <article className="moderation-feedback-item" key={item.id}>
              <p>{item.reason}</p>
              <time dateTime={item.created_at}>{dateTimeLabel(item.created_at)}</time>
            </article>
          ))}
        </section>
      )}

      <section className="moderation-actions" aria-label="Moderation actions">
        <h3>{canSetOutcome ? 'Decide on this report' : 'Review this report'}</h3>
        {report.status === 'SUBMITTED' && (
          <button className="button button--primary moderation-action-primary" disabled={Boolean(action)} onClick={() => onAction('mark-reviewed')} type="button">
            {action === 'mark-reviewed' ? 'Starting review...' : 'Start review'}
          </button>
        )}

        {canSetOutcome && (
          <>
            <button className="button button--primary moderation-action-primary" disabled={Boolean(action)} onClick={() => onAction('outcome', { status: 'RESOLVED' })} type="button">
              {action === 'resolve' ? 'Resolving...' : 'Resolve report'}
            </button>
            <button className="button button--quiet moderation-action-reject" disabled={Boolean(action)} onClick={() => onAction('outcome', { status: 'REJECTED' })} type="button">
              {action === 'reject' ? 'Rejecting...' : 'Reject report'}
            </button>
          </>
        )}

        {canSetOutcome && (
          <form className="moderation-feedback-form" onSubmit={submitFeedback}>
            <label htmlFor={`owner-feedback-${report.id}`}>Send correction feedback to the owner</label>
            <textarea
              id={`owner-feedback-${report.id}`}
              maxLength={2000}
              onChange={(event) => setFeedbackReason(event.target.value)}
              placeholder="Explain what the owner should correct."
              required
              value={feedbackReason}
            />
            <button className="button button--quiet" disabled={Boolean(action) || !feedbackReason.trim()} type="submit">
              {action === 'feedback' ? 'Sending feedback...' : 'Send feedback and resolve'}
            </button>
          </form>
        )}

        {canUnpublish && (
          <div className="moderation-hold-action">
            <p>Unpublishing is a separate action. It changes the listing to Unpublished and places a moderation hold.</p>
            <button className="button button--quiet moderation-action-reject" disabled={Boolean(action)} onClick={() => onAction('unpublish')} type="button">
              {action === 'unpublish' ? 'Unpublishing...' : 'Unpublish listing'}
            </button>
          </div>
        )}

        {listing.has_active_moderation_hold && (
          <div className="moderation-hold-action">
            <p>This listing has an active moderation hold. Releasing it does not republish the listing.</p>
            <button className="button button--quiet" disabled={Boolean(action)} onClick={() => onAction('release-hold')} type="button">
              {action === 'release-hold' ? 'Releasing hold...' : 'Release moderation hold'}
            </button>
          </div>
        )}
      </section>
        </aside>
      </div>
    </article>
  )
}

export default function ModerationReportsPage() {
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [queueRetry, setQueueRetry] = useState(0)
  const [queue, setQueue] = useState({ key: '', data: null, error: null })
  const [selectedId, setSelectedId] = useState(null)
  const [detailRetry, setDetailRetry] = useState(0)
  const [detail, setDetail] = useState({ key: '', report: null, error: null })
  const [action, setAction] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  const queueQuery = filter
    ? `status=${encodeURIComponent(filter)}&page=${page}`
    : `page=${page}`
  const queueKey = `${filter}:${page}:${queueRetry}`
  const queueLoading = queue.key !== queueKey
  const queueError = queueLoading ? null : queue.error
  const queueData = queueLoading ? null : queue.data
  const reports = queueData?.results || []
  const activeSelectedId = selectedId || reports[0]?.id || null
  const detailKey = `${activeSelectedId || ''}:${detailRetry}`

  useEffect(() => {
    let active = true
    apiRequest(`/moderation/reports/?${queueQuery}`, { auth: true })
      .then((data) => { if (active) setQueue({ key: queueKey, data, error: null }) })
      .catch((error) => { if (active) setQueue({ key: queueKey, data: null, error }) })
    return () => { active = false }
  }, [queueKey, queueQuery])

  useEffect(() => {
    if (!activeSelectedId) return undefined
    let active = true
    apiRequest(`/moderation/reports/${encodeURIComponent(activeSelectedId)}/`, { auth: true })
      .then((report) => { if (active) setDetail({ key: detailKey, report, error: null }) })
      .catch((error) => { if (active) setDetail({ key: detailKey, report: null, error }) })
    return () => { active = false }
  }, [activeSelectedId, detailRetry, detailKey])

  const detailLoading = Boolean(activeSelectedId) && detail.key !== detailKey
  const detailError = detail.key === detailKey ? detail.error : null
  const selectedReport = detail.key === detailKey ? detail.report : null

  const reloadQueue = () => {
    setQueue({ key: '', data: null, error: null })
    setQueueRetry((value) => value + 1)
  }

  const changeFilter = (nextFilter) => {
    setFilter(nextFilter)
    setPage(1)
    setSelectedId(null)
    setNotice('')
    setActionError('')
  }

  const performAction = async (type, body, feedbackReason, clearFeedback) => {
    if (!activeSelectedId || action) return
    const actionKey = type === 'outcome'
      ? body?.status === 'RESOLVED' ? 'resolve' : 'reject'
      : type
    setAction(actionKey)
    setActionError('')
    setNotice('')
    let path
    let requestBody = body || {}
    if (type === 'mark-reviewed') path = `/moderation/reports/${activeSelectedId}/mark-reviewed/`
    else if (type === 'outcome') path = `/moderation/reports/${activeSelectedId}/outcome/`
    else if (type === 'feedback') {
      path = `/moderation/reports/${activeSelectedId}/feedback/`
      requestBody = { reason: feedbackReason }
    } else if (type === 'unpublish') path = `/moderation/reports/${activeSelectedId}/unpublish/`
    else if (type === 'release-hold') path = `/moderation/listings/${selectedReport?.listing?.id}/release-hold/`
    else return

    try {
      const response = await apiRequest(path, { method: 'POST', body: requestBody, auth: true })
      const latestReport = type === 'release-hold'
        ? {
          ...selectedReport,
          active_hold: null,
          listing: { ...selectedReport.listing, ...response },
        }
        : type === 'feedback'
          ? {
            ...selectedReport,
            status: 'RESOLVED',
            feedback: [...(selectedReport.feedback || []), {
              id: response.id,
              reason: response.reason,
              created_at: response.created_at,
            }],
          }
          : response
      setDetail({ key: detailKey, report: latestReport, error: null })
      if (type === 'feedback') clearFeedback?.()
      const successMessages = {
        'mark-reviewed': 'Report moved to Under review.',
        outcome: `Report ${REPORT_STATUSES[body.status].toLowerCase()}.`,
        feedback: 'Feedback sent. The report is resolved.',
        unpublish: 'Listing unpublished and moderation hold placed.',
        'release-hold': 'Moderation hold released. The listing remains unpublished.',
      }
      setNotice(successMessages[type])
      setPage(1)
      setQueue({ key: '', data: null, error: null })
      setQueueRetry((value) => value + 1)
    } catch (error) {
      setActionError(errorText(error))
    } finally {
      setAction('')
    }
  }

  const act = (type, body) => performAction(type, body)

  return (
    <section className="moderation-page" aria-labelledby="moderation-page-title">
      <div className="moderation-page__title-row">
      <header className="owner-page-heading moderation-page__heading">
        <div>
          <p className="eyebrow">Admin / Moderator</p>
          <h1 id="moderation-page-title">Listing reports</h1>
          <p>Review reports, check listing details, and take the actions defined for each report status.</p>
        </div>
      </header>
      <button aria-label="Refresh reports" className="moderation-page__refresh button button--quiet" disabled={queueLoading} onClick={reloadQueue} type="button"><span aria-hidden="true">⟳</span> Refresh</button>
      </div>

      <div className="moderation-workspace">
        <section className="moderation-queue" aria-labelledby="moderation-queue-title">
          <div className="moderation-queue__heading">
            <div>
              <h2 id="moderation-queue-title">Reports</h2>
              {!queueLoading && !queueError && <p>{queueData?.count || 0} {queueData?.count === 1 ? 'report' : 'reports'}</p>}
            </div>
          </div>

          <div className="moderation-filters" aria-label="Filter reports">
            {QUEUE_FILTERS.map((item) => (
              <button
                aria-pressed={filter === item.value}
                className="moderation-filter"
                key={item.value || 'open'}
                onClick={() => changeFilter(item.value)}
                type="button"
              >{item.label}{item.value === '' && filter === '' && !queueLoading && <span className="moderation-filter__count">{queueData?.count || 0}</span>}</button>
            ))}
          </div>

          {queueLoading && <div className="moderation-queue-state" role="status">Loading reports...</div>}
          {!queueLoading && queueError && (
            <div className="moderation-queue-state moderation-queue-state--error" role="alert">
              <p>{queueError.message || 'Reports could not be loaded.'}</p>
              <button className="button button--primary" onClick={reloadQueue} type="button">Try again</button>
            </div>
          )}
          {!queueLoading && !queueError && reports.length === 0 && (
            <div className="moderation-queue-state">
              <h3>No reports here</h3>
              <p>{filter ? 'Try another report status.' : 'New listing reports will appear here.'}</p>
            </div>
          )}
          {!queueLoading && !queueError && reports.length > 0 && (
            <div className="moderation-report-list">
              {reports.map((report) => (
                <button
                  aria-pressed={String(activeSelectedId) === String(report.id)}
                  className="moderation-report-row"
                  key={report.id}
                  onClick={() => { setSelectedId(report.id); setActionError(''); setNotice('') }}
                  type="button"
                >
                  <span className="moderation-report-row__title">{report.listing?.title || `Listing ${report.listing?.id ?? ''}`}</span>
                  <span className={`moderation-status moderation-status--${String(report.status).toLowerCase()}`}>{REPORT_STATUSES[report.status] || 'Unknown'}</span>
                  <span className="moderation-report-row__reason">{report.reason}</span>
                  <time dateTime={report.created_at}>{dateTimeLabel(report.created_at)}</time>
                </button>
              ))}
            </div>
          )}

          {!queueLoading && !queueError && queueData?.count > 20 && (
            <nav className="moderation-pagination" aria-label="Report pages">
              <button className="button button--quiet" disabled={!queueData.previous} onClick={() => { setPage((value) => Math.max(1, value - 1)); setSelectedId(null) }} type="button">Previous</button>
              <span>Page {page}</span>
              <button className="button button--quiet" disabled={!queueData.next} onClick={() => { setPage((value) => value + 1); setSelectedId(null) }} type="button">Next</button>
            </nav>
          )}
        </section>

        <div className="moderation-review">
          {detailError && !detailLoading
            ? <ListingReview report={null} error={errorText(detailError)} loading={false} retry={() => setDetailRetry((value) => value + 1)} />
            : <ListingReview
              action={action}
              actionError={actionError}
              loading={detailLoading}
              notice={notice}
              onAction={act}
              onFeedback={(reason, clearFeedback) => performAction('feedback', null, reason, clearFeedback)}
              report={selectedReport}
              retry={() => setDetailRetry((value) => value + 1)}
            />}
        </div>
      </div>
    </section>
  )
}

export function OwnerModerationFeedback({ preview = false, previewLinkLabel = 'View all' }) {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [request, setRequest] = useState({ key: '', data: null, error: null })
  const currentPage = preview ? 1 : page
  const requestKey = `${currentPage}:${retry}`

  useEffect(() => {
    let active = true
    apiRequest(`/owner/moderation-feedback/?page=${currentPage}`, { auth: true })
      .then((data) => { if (active) setRequest({ key: requestKey, data, error: null }) })
      .catch((error) => { if (active) setRequest({ key: requestKey, data: null, error }) })
    return () => { active = false }
  }, [currentPage, requestKey])

  const loading = request.key !== requestKey
  const data = loading ? null : request.data
  const error = loading ? null : request.error
  const feedback = data?.results || []
  const visibleFeedback = preview ? feedback.slice(0, 3) : feedback

  return (
    <section className={`owner-moderation-feedback${preview ? ' owner-moderation-feedback--preview' : ''}`} aria-labelledby={preview ? 'owner-feedback-preview-title' : 'owner-feedback-title'}>
      {preview ? (
        <header className="owner-moderation-feedback__heading">
          <div>
            <p className="eyebrow">Listing updates</p>
            <h2 id="owner-feedback-preview-title">Moderation feedback</h2>
          </div>
          <Link className="text-link" to="/owner/moderation-feedback">{previewLinkLabel}</Link>
        </header>
      ) : (
        <header className="owner-page-heading">
          <div>
            <p className="eyebrow">Property Owner</p>
            <h1 id="owner-feedback-title">Moderation feedback</h1>
            <p>Review correction notes about your listings.</p>
          </div>
        </header>
      )}

      {loading && <div className="state-panel" role="status">Loading moderation feedback...</div>}
      {!loading && error && (
        <div className="state-panel state-panel--error" role="alert">
          <h2>Feedback could not be loaded</h2>
          <p>{error.message || 'Please check your connection and try again.'}</p>
          <button className="button button--primary" onClick={() => setRetry((value) => value + 1)} type="button">Try again</button>
        </div>
      )}
      {!loading && !error && feedback.length === 0 && (
        <div className="state-panel owner-moderation-feedback__empty">
          <h2>No moderation feedback</h2>
          <p>Any correction notes for your listings will appear here.</p>
        </div>
      )}
      {!loading && !error && visibleFeedback.length > 0 && (
        <div className="owner-moderation-feedback__list">
          {visibleFeedback.map((item) => (
            <article className="owner-moderation-feedback__item" key={item.id}>
              <div>
                <h3>{item.listing?.title || `Listing ${item.listing?.id ?? ''}`}</h3>
                <p>{item.reason}</p>
              </div>
              <time dateTime={item.created_at}>{dateTimeLabel(item.created_at)}</time>
            </article>
          ))}
        </div>
      )}

      {!preview && !loading && !error && data?.count > 20 && (
        <nav className="owner-pagination" aria-label="Feedback pages">
          <button className="button button--quiet" disabled={!data.previous} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
          <span>Page {page}</span>
          <button className="button button--quiet" disabled={!data.next} onClick={() => setPage((value) => value + 1)} type="button">Next</button>
        </nav>
      )}
    </section>
  )
}
