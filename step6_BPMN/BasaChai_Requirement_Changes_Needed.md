# BasaChai: requirement changes needed (from the BPMN correction pass)

Steps 4 and 5 have since been updated with the confirmed decisions and consistency corrections below. This file records the remaining source-document issues; its earlier proposed changes are superseded.

## A. OD-01 and OD-05 confirmation status

Step 4 records OD-01 and OD-05 as confirmed decisions. Step 5 reflects the 7-day reconfirmation rule and the viewing-request rules: past or invalid date/time is rejected; the requesting Home Seeker may cancel their own Pending request; there is no mandatory minimum notice period or owner response deadline. The confirmed implementation specification uses a daily scheduled task: in-app reminders on Day 5 and Day 7; Needs Reconfirmation after 7 days without response; dashboard actions Still Available and Not Available. Either action updates the confirmation date. Email reminders are planned subject to Q-02.

## B. Cancellation of a Pending viewing request (OD-05): confirmed behavior

Cancellation is already specified by Step 4 FR-35, FR-36, FR-44, BR-09 and the Section 11 checklist, and Step 5 UC-21, UC-22 and UC-30. A Home Seeker can cancel their own Pending request; Cancelled is terminal and the owner cannot accept or reject it afterward. Step 5 UC-20 and validation V-17 treat cancellation as confirmed. UQ-09 now confirms Published + shown Available eligibility, one Pending request per Home Seeker/listing, and a new request after Rejected or Cancelled; Accepted requests follow the existing workflow.

The editable BPMN and SVG show the confirmed cancellation flow and no longer label the nodes as requiring amendment. The BPMN source and editable XML match. The SVG and combined PNG include UQ-01 conversation reuse and UQ-09 viewing-request rules alongside multi-role and ownership checks. They also show the confirmed ISS-10 timestamp distinction and ISS-30 independent moderation actions. The combined PNG and Part 2 preview were rendered from the updated SVG; Part 1 retains its manually maintained availability note with the confirmed timestamp distinction.

## C. Remaining source-document inconsistencies (reported, not resolved by guessing)

1. UC-20 has no "not logged in" exception flow; login comes only from its precondition, FR-14 and UC-11 6a.
2. ISS-01 is resolved: Visitor means an unauthenticated request, not an account role. Public browsing remains available without login.
3. ISS-12 is resolved by UQ-09 and FR-33: only Published listings shown as Available accept viewing requests; one Pending request per Home Seeker/listing; new requests may follow Rejected or Cancelled.
4. ISS-13 is resolved by UQ-05: Submitted -> Under Review -> Resolved or Rejected; report status remains separate from listing lifecycle.
5. ISS-30 is resolved: feedback and explicit unpublishing are independent actions and may both apply. Feedback may resolve a report without changing listing lifecycle; unpublishing changes listing lifecycle and preserves report status.
6. ISS-10 is resolved: visible content/image changes refresh updated_at; availability reconfirmation alone does not. The timestamps are distinct.
7. UC-15 (remove from shortlist), UC-03 (log out), UC-04 (profile), UC-07 (image management, only inside "Create listing") are not drawn as separate flows.

## D. Multi-role account and owner-action authorization

One account may hold Home Seeker, Property Owner, or both memberships. The BPMN lanes represent capabilities, not separate accounts. UQ-01: one conversation per Home Seeker account/listing; repeat contacts reuse it and preserve message history, while different listings have separate conversations. UQ-09: viewing requests require Published + shown Available; one Pending per Home Seeker/listing; a new request may follow Rejected or Cancelled, while Accepted follows the existing workflow. Conversation, viewing-request and report creation compare listing.owner_id with the requesting account ID and reject own listings regardless of role. Only authenticated Home Seeker members may report another owner?s Published listing; Property Owner-only accounts cannot report; Admin / Moderators review and moderate. Visitor is unauthenticated, not a role.


