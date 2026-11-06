import { Link } from 'react-router-dom'
import './PlatformFeedbackLink.css'

export default function PlatformFeedbackLink({ to }) {
  return <Link className="platform-feedback-dashboard-link" to={to}>
    <span className="platform-feedback-dashboard-link__icon" aria-hidden="true">✦</span>
    <span><strong>Feedback &amp; Reviews</strong><small>Share your BasaChai experience</small></span>
    <span className="platform-feedback-dashboard-link__arrow" aria-hidden="true">→</span>
  </Link>
}
