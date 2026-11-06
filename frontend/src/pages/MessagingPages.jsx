import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { apiRequest, fetchAuthenticatedFile } from '../api.js'
import { useAuth } from '../context/useAuth.js'
import UserAvatar from '../components/UserAvatar.jsx'
import SeekerProfileModal from '../components/SeekerProfileModal.jsx'
import './MessagingPages.css'

const PAGE_SIZE = 20
const MESSAGE_REFRESH_MS = 20000
const MAX_ATTACHMENT_FILES = 5
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
const ATTACHMENT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx'])

const LIFECYCLE_LABELS = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  UNPUBLISHED: 'Unpublished',
  REMOVED: 'Removed',
}

function dateTimeLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? ''
    : new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function messageTimeLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('en-BD', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function messageDateLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('en-BD', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function mergeMessages(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]))
  incoming.forEach((message) => byId.set(message.id, message))
  return [...byId.values()].sort((left, right) => {
    const timeDifference = new Date(left.created_at).valueOf() - new Date(right.created_at).valueOf()
    return timeDifference || left.id - right.id
  })
}

function ErrorPanel({ title, message, onRetry }) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && <button className="button button--primary" onClick={onRetry} type="button">Try again</button>}
    </div>
  )
}

function MessageAttachmentView({ attachment }) {
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(Boolean(attachment.is_image))
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!attachment.is_image) return undefined
    let active = true
    let objectUrl
    fetchAuthenticatedFile(attachment.download_url)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setImageUrl(objectUrl)
      })
      .catch(() => { if (active) setError('Image preview unavailable.') })
      .finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment.download_url, attachment.is_image])

  const downloadAttachment = async () => {
    setDownloading(true)
    setError('')
    try {
      const blob = await fetchAuthenticatedFile(`${attachment.download_url}?download=1`)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = attachment.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      setError('This attachment could not be downloaded. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  if (attachment.is_image) {
    return (
      <div className="message-attachment message-attachment--image">
        {imageUrl
          ? <img alt={attachment.filename} className="message-attachment__image" src={imageUrl} />
          : <span className="message-attachment__state" role="status">{loading ? 'Loading image…' : error}</span>}
        <button className="message-attachment__download" disabled={downloading} onClick={downloadAttachment} type="button">
          {downloading ? 'Downloading…' : 'Download image'}
        </button>
      </div>
    )
  }

  return (
    <div className="message-attachment message-attachment--document">
      <span aria-hidden="true" className="message-attachment__file-icon">▤</span>
      <span className="message-attachment__filename" title={attachment.filename}>{attachment.filename}</span>
      <button className="message-attachment__download" disabled={downloading} onClick={downloadAttachment} type="button">
        {downloading ? 'Downloading…' : 'Download'}
      </button>
      {error && <span className="message-attachment__error" role="alert">{error}</span>}
    </div>
  )
}

export function ConversationListPage({ workspace }) {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [request, setRequest] = useState({ key: '', data: null, error: null })
  const isSeeker = workspace === 'seeker'
  const basePath = isSeeker ? '/seeker/messages' : '/owner/messages'
  const roleParam = isSeeker ? 'seeker' : 'owner'
  const requestKey = `${workspace}:${page}:${retry}`

  useEffect(() => {
    let active = true
    apiRequest(`/conversations/?role=${roleParam}&page=${page}`, { auth: true })
      .then((data) => { if (active) setRequest({ key: requestKey, data, error: null }) })
      .catch((error) => { if (active) setRequest({ key: requestKey, data: null, error }) })
    return () => { active = false }
  }, [page, requestKey, roleParam])

  const loading = request.key !== requestKey
  const data = loading ? null : request.data
  const error = loading ? null : request.error
  const conversations = data?.results || []

  return (
    <section className="messaging-page" aria-labelledby="messages-title">
      <header className="owner-page-heading">
        <div>
          <p className="eyebrow">{isSeeker ? 'Home Seeker' : 'Property Owner'}</p>
          <h1 id="messages-title">Messages</h1>
          <p>Conversations stay connected to the home they are about.</p>
        </div>
        {isSeeker && <Link className="button button--primary" to="/listings">Browse homes</Link>}
      </header>

      {loading && <div className="state-panel" role="status">Loading your conversations…</div>}
      {!loading && error && <ErrorPanel title="Your messages couldn’t be loaded" message={error.message || 'Please check your connection and try again.'} onRetry={() => setRetry((value) => value + 1)} />}
      {!loading && !error && conversations.length === 0 && (
        <div className="state-panel messaging-empty-state">
          <h2>No conversations yet</h2>
          <p>{isSeeker ? 'Open a home’s details and choose Message owner to start a conversation.' : 'When a Home Seeker messages you about one of your homes, the conversation will appear here.'}</p>
          {isSeeker && <Link className="button button--quiet" to="/listings">Browse homes</Link>}
        </div>
      )}
      {!loading && !error && conversations.length > 0 && (
        <div className="conversation-list">
          {conversations.map((conversation) => {
            const listing = conversation.listing
            const otherPerson = isSeeker ? conversation.owner : conversation.seeker
            const lastMessage = conversation.last_message
            const statusLabel = LIFECYCLE_LABELS[listing.lifecycle_status] || 'Listing status unavailable'
            return (
              <Link className="conversation-card" key={conversation.id} to={`${basePath}/${conversation.id}`}>
                <div className="conversation-card__heading">
                  <div className="conversation-card__person">
                    <UserAvatar authenticated size="small" user={otherPerson} />
                    <div>
                      <p className="eyebrow">{isSeeker ? 'Property owner' : 'Home Seeker'}</p>
                      <h2>{otherPerson?.full_name || 'BasaChai user'}</h2>
                    </div>
                  </div>
                  <span className={`owner-status owner-status--lifecycle owner-status--${String(listing.lifecycle_status || '').toLowerCase()}`}>{statusLabel}</span>
                </div>
                <p className="conversation-card__listing">{listing.title || `Home ${listing.id}`}</p>
                <p className="conversation-card__preview">
                  {lastMessage
                    ? `${lastMessage.sender?.full_name || 'Message'}: ${lastMessage.body || (lastMessage.attachments?.length ? `${lastMessage.attachments.length} attachment${lastMessage.attachments.length === 1 ? '' : 's'}` : '')}`
                    : 'No messages yet. Open to send the first message.'}
                </p>
                {lastMessage && <time dateTime={lastMessage.created_at}>{dateTimeLabel(lastMessage.created_at)}</time>}
                {!conversation.can_send_message && <span className="conversation-card__closed">New messages are closed for this home.</span>}
              </Link>
            )
          })}
        </div>
      )}

      {!loading && !error && data?.count > PAGE_SIZE && (
        <nav className="owner-pagination" aria-label="Conversation pages">
          <button className="button button--quiet" disabled={!data.previous} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
          <span>Page {page}</span>
          <button className="button button--quiet" disabled={!data.next} onClick={() => setPage((value) => value + 1)} type="button">Next</button>
        </nav>
      )}
    </section>
  )
}

export function ConversationPage({ backPath }) {
  const { conversationId } = useParams()
  return <ConversationThread key={conversationId} backPath={backPath} conversationId={conversationId} />
}

function ConversationThread({ backPath, conversationId }) {
  const { user } = useAuth()
  const [conversation, setConversation] = useState(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [messages, setMessages] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [hasOlder, setHasOlder] = useState(false)
  const [olderPage, setOlderPage] = useState(2)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [relatedViewingRequest, setRelatedViewingRequest] = useState(null)
  const [showSeekerProfile, setShowSeekerProfile] = useState(false)
  const historyRef = useRef(null)
  const attachmentInputRef = useRef(null)
  const initialHistoryPositioned = useRef(false)

  const loadThread = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true)
    try {
      const [detail, history] = await Promise.all([
        apiRequest(`/conversations/${encodeURIComponent(conversationId)}/`, { auth: true }),
        apiRequest(`/conversations/${encodeURIComponent(conversationId)}/messages/?page=1`, { auth: true }),
      ])
      setConversation(detail)
      setMessages((current) => mergeMessages(current, [...history.results].reverse()))
      setHasOlder(Boolean(history.next))
      setOlderPage(2)
      setPageError('')
      setHistoryError('')
    } catch (error) {
      if (!silent && !conversation) setPageError(error.message || 'This conversation could not be loaded.')
      else if (!silent) setHistoryError(error.message || 'Messages could not be refreshed. Please try again.')
      else setHistoryError('Messages could not be refreshed. Try again in a moment.')
    } finally {
      if (!silent) {
        setHistoryLoading(false)
        setRefreshing(false)
      }
    }
  }, [conversation, conversationId])

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest(`/conversations/${encodeURIComponent(conversationId)}/`, { auth: true }),
      apiRequest(`/conversations/${encodeURIComponent(conversationId)}/messages/?page=1`, { auth: true }),
    ])
      .then(([detail, history]) => {
        if (!active) return
        setConversation(detail)
        setMessages((current) => mergeMessages(current, [...history.results].reverse()))
        setHasOlder(Boolean(history.next))
        setOlderPage(2)
      })
      .catch((error) => {
        if (active) setPageError(error.message || 'This conversation could not be loaded.')
      })
      .finally(() => {
        if (!active) return
        setPageLoading(false)
        setHistoryLoading(false)
      })
    return () => { active = false }
  }, [conversationId])

  useEffect(() => {
    const interval = window.setInterval(() => loadThread({ silent: true }), MESSAGE_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [loadThread])

  useEffect(() => {
    if (!conversation?.listing?.id || !conversation?.owner?.id || !conversation?.seeker?.id) return undefined
    let active = true
    const loadMatchingRequest = async () => {
      const matching = []
      let page = 1
      let hasNext = true
      while (active && hasNext) {
        const data = await apiRequest(`/viewing-requests/?page=${page}`, { auth: true })
        matching.push(...(data.results || []).filter((request) => (
          String(request.listing?.id) === String(conversation.listing.id)
          && String(request.seeker?.id) === String(conversation.seeker.id)
          && String(request.owner?.id) === String(conversation.owner.id)
        )))
        hasNext = Boolean(data.next)
        page += 1
      }
      if (!active) return
      matching.sort((left, right) => new Date(right.created_at || right.preferred_at) - new Date(left.created_at || left.preferred_at))
      setRelatedViewingRequest(matching[0] || null)
    }
    loadMatchingRequest().catch(() => { if (active) setRelatedViewingRequest(null) })
    return () => { active = false }
  }, [conversation?.listing?.id, conversation?.owner?.id, conversation?.seeker?.id])

  useEffect(() => {
    const historyElement = historyRef.current
    if (historyLoading || !historyElement) return
    const distanceFromBottom = historyElement.scrollHeight - historyElement.scrollTop - historyElement.clientHeight
    if (!initialHistoryPositioned.current || distanceFromBottom < 80) {
      historyElement.scrollTop = historyElement.scrollHeight
      initialHistoryPositioned.current = true
    }
  }, [historyLoading, messages.length, relatedViewingRequest])

  const loadOlderMessages = async () => {
    setLoadingOlder(true)
    setHistoryError('')
    try {
      const data = await apiRequest(`/conversations/${encodeURIComponent(conversationId)}/messages/?page=${olderPage}`, { auth: true })
      setMessages((current) => mergeMessages(current, [...data.results].reverse()))
      setHasOlder(Boolean(data.next))
      setOlderPage((value) => value + 1)
    } catch (error) {
      setHistoryError(error.message || 'Older messages could not be loaded.')
    } finally {
      setLoadingOlder(false)
    }
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    if ((!draft.trim() && !attachments.length) || sending || !conversation?.can_send_message) return
    setSending(true)
    setSendError('')
    try {
      const payload = new FormData()
      payload.append('body', draft)
      attachments.forEach((file) => payload.append('attachments', file))
      const message = await apiRequest(`/conversations/${encodeURIComponent(conversationId)}/messages/`, {
        method: 'POST',
        body: payload,
        auth: true,
      })
      setMessages((current) => mergeMessages(current, [message]))
      setDraft('')
      setAttachments([])
    } catch (error) {
      if (error.code === 'messaging_closed') {
        setConversation((current) => current ? { ...current, can_send_message: false } : current)
        setSendError('New messages are closed for this home. You can still read the conversation history.')
      } else if (error.status === 429 || error.code === 'throttled') {
        setSendError(error.message || 'You have sent several messages. Please wait a little before sending another.')
      } else if (error.status === 400) {
        setSendError(error.message || 'Messages must contain text and be no longer than 2,000 characters.')
      } else {
        setSendError(error.message || 'Your message could not be sent. Please try again.')
      }
    } finally {
      setSending(false)
    }
  }

  const selectAttachments = (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selectedFiles.length) return

    if (attachments.length + selectedFiles.length > MAX_ATTACHMENT_FILES) {
      setSendError(`Attach up to ${MAX_ATTACHMENT_FILES} files to one message.`)
      return
    }
    const invalidFile = selectedFiles.find((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase()
      return !ATTACHMENT_EXTENSIONS.has(extension) || file.size > MAX_ATTACHMENT_SIZE || file.size === 0
    })
    if (invalidFile) {
      setSendError(`${invalidFile.name} is not supported. Choose JPG, JPEG, PNG, WebP, PDF, DOC, or DOCX files up to 10 MB.`)
      return
    }
    setSendError('')
    setAttachments((current) => [...current, ...selectedFiles])
  }

  if (pageLoading) {
    return <section className="messaging-page"><div className="state-panel" role="status">Loading conversation…</div></section>
  }
  if (pageError) {
    return (
      <section className="messaging-page">
        <Link className="text-link" to={backPath}>← Back to messages</Link>
        <ErrorPanel title="This conversation couldn’t be loaded" message={pageError} onRetry={() => loadThread()} />
      </section>
    )
  }
  if (!conversation) return null

  const isMySeekerConversation = String(conversation.seeker?.id) === String(user?.id)
  const isSeekerWorkspace = backPath.startsWith('/seeker')
  const wrongWorkspace = isSeekerWorkspace ? !isMySeekerConversation : isMySeekerConversation

  if (wrongWorkspace) {
    const targetWorkspace = isSeekerWorkspace ? '/owner' : '/seeker'
    const targetRole = isSeekerWorkspace ? 'PROPERTY_OWNER' : 'HOME_SEEKER'
    if (user?.roles?.includes(targetRole)) {
      return <Navigate replace to={`${targetWorkspace}/messages/${conversationId}`} />
    }
  }

  const otherPerson = isSeekerWorkspace ? conversation.owner : conversation.seeker
  const otherRole = isSeekerWorkspace ? 'Property Owner' : 'Home Seeker'
  const listingStatus = LIFECYCLE_LABELS[conversation.listing?.lifecycle_status] || 'Listing status unavailable'
  const viewingStatus = { PENDING: 'Pending', ACCEPTED: 'Accepted', REJECTED: 'Rejected', CANCELLED: 'Cancelled' }
  const viewingRequestsPath = isSeekerWorkspace ? '/seeker/viewing-requests' : '/owner/viewing-requests'

  return (
    <section className="messaging-page conversation-page" aria-labelledby="conversation-title">
      <header className="conversation-header">
        <Link className="conversation-header__back" aria-label="Back to messages" to={backPath}>‹</Link>
        <div className="conversation-header__person">
          <UserAvatar authenticated size="large" user={otherPerson} />
          <div>
            <h1 id="conversation-title">{otherPerson?.full_name || 'BasaChai user'}</h1>
            <p><i aria-hidden="true" />{otherRole}</p>
          </div>
          {!isSeekerWorkspace && (
            <button
              className="button button--quiet conversation-header__profile-btn"
              onClick={() => setShowSeekerProfile(true)}
              type="button"
            >
              View profile
            </button>
          )}
        </div>
        <div className="conversation-header__actions">
          <button className="conversation-header__refresh" disabled={refreshing} onClick={() => loadThread()} type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2"/></svg>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          {conversation.listing?.lifecycle_status === 'PUBLISHED' && (
            <Link className="conversation-header__listing" to={`/listings/${conversation.listing.id}`}><span aria-hidden="true">⌂</span> View home</Link>
          )}
        </div>
      </header>

      <div className="conversation-history" aria-label="Message history" aria-live="polite" ref={historyRef}>
        <div className="conversation-context">
          <strong>{conversation.listing?.title || `Home ${conversation.listing?.id}`}</strong>
          <span>{listingStatus}</span>
        </div>
        {!conversation.can_send_message && (
          <p className="conversation-notice" role="status">This home is no longer public. You can still read your past messages, but new messages are closed.</p>
        )}
        {conversation.can_send_message && conversation.listing?.lifecycle_status === 'PUBLISHED' && (
          <p className="conversation-notice conversation-notice--open" role="status">Messages stay with this home. New messages appear when the conversation refreshes.</p>
        )}

        <div className="conversation-history__toolbar">
          {hasOlder
            ? <button className="button button--quiet" disabled={loadingOlder} onClick={loadOlderMessages} type="button">{loadingOlder ? 'Loading…' : 'Load older messages'}</button>
            : <span className="conversation-history__beginning">{messages.length ? 'Beginning of conversation' : ''}</span>}
          <button className="button button--quiet" disabled={refreshing} onClick={() => loadThread()} type="button">{refreshing ? 'Refreshing…' : 'Refresh messages'}</button>
        </div>

        {historyLoading && <p className="conversation-history__state" role="status">Loading messages…</p>}
        {!historyLoading && messages.length === 0 && (
          <p className="conversation-history__state">
            {conversation.can_send_message
              ? 'No messages yet. Send a message to start the conversation.'
              : 'There are no messages in this conversation yet.'}
          </p>
        )}
        {!historyLoading && messages.length > 0 && (
          <ol className="message-list">
            {messages.map((message, index) => {
              const isMine = String(message.sender?.id) === String(user?.id)
              const showDate = index === 0 || new Date(messages[index - 1].created_at).toDateString() !== new Date(message.created_at).toDateString()
              return (
                <Fragment key={message.id}>
                  {showDate && <li className="message-date-separator"><span>{messageDateLabel(message.created_at)}</span></li>}
                  <li className={`message-row${isMine ? ' message-row--mine' : ''}`}>
                    {!isMine && <UserAvatar authenticated size="small" user={message.sender} />}
                    <div className="message-row__content">
                      <div className={isMine ? 'message-bubble message-bubble--mine' : 'message-bubble'}>
                        {message.body && <p className="message-bubble__body">{message.body}</p>}
                        {message.attachments?.length > 0 && (
                          <div className="message-bubble__attachments">
                            {message.attachments.map((attachment) => (
                              <MessageAttachmentView attachment={attachment} key={attachment.id} />
                            ))}
                          </div>
                        )}
                      </div>
                      <time className="message-row__time" dateTime={message.created_at}>{messageTimeLabel(message.created_at)}</time>
                    </div>
                  </li>
                </Fragment>
              )
            })}
          </ol>
        )}
        {relatedViewingRequest && (
          <Link className="conversation-viewing-request" to={viewingRequestsPath}>
            <span className="conversation-viewing-request__icon" aria-hidden="true">▦</span>
            <span className="conversation-viewing-request__content">
              <strong>Viewing Request</strong>
              <span>{dateTimeLabel(relatedViewingRequest.preferred_at)}</span>
              <span className={`conversation-viewing-request__status conversation-viewing-request__status--${String(relatedViewingRequest.status).toLowerCase()}`}>
                {viewingStatus[relatedViewingRequest.status] || 'Status unavailable'}
              </span>
            </span>
          </Link>
        )}
        {historyError && <p className="conversation-inline-error" role="alert">{historyError}</p>}
      </div>

      {conversation.can_send_message ? (
        <form className="message-composer" onSubmit={sendMessage}>
          <label htmlFor="message-body">Your message</label>
          <input
            accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
            className="message-composer__file-input"
            disabled={sending}
            multiple
            onChange={selectAttachments}
            ref={attachmentInputRef}
            type="file"
          />
          <button
            aria-label="Attach files"
            className="message-composer__attach"
            disabled={sending || attachments.length >= MAX_ATTACHMENT_FILES}
            onClick={() => attachmentInputRef.current?.click()}
            title="Attach images or documents"
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8.5 12.5 6.7-6.7a4 4 0 0 1 5.7 5.7L11 21.4a6 6 0 1 1-8.5-8.5l10-10" /></svg>
          </button>
          <textarea
            id="message-body"
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a message about this home…"
            rows={1}
            value={draft}
          />
          {attachments.length > 0 && (
            <div className="message-composer__attachments" aria-label="Selected attachments">
              {attachments.map((file, index) => (
                <span className="message-composer__file-chip" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
                  <span title={file.name}>{file.name}</span>
                  <button
                    aria-label={`Remove ${file.name}`}
                    disabled={sending}
                    onClick={() => setAttachments((current) => current.filter((_item, itemIndex) => itemIndex !== index))}
                    type="button"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          <div className="message-composer__footer">
            <span>{draft.length.toLocaleString('en-BD')} / 2,000</span>
            <button className="button button--primary" disabled={sending || (!draft.trim() && !attachments.length)} type="submit">{sending ? 'Sending…' : 'Send message'}</button>
          </div>
          {sendError && <p className="conversation-inline-error" role="alert">{sendError}</p>}
        </form>
      ) : (
        <div className="message-composer message-composer--closed">New messages are closed for this home.</div>
      )}

      {!isSeekerWorkspace && (
        <SeekerProfileModal
          isOpen={showSeekerProfile}
          onClose={() => setShowSeekerProfile(false)}
          seeker={conversation.seeker}
        />
      )}
    </section>
  )
}
