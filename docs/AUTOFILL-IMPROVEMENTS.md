# Autofill reliability

Implemented in 0.6.0. Automated acceptance tests exercise the behavior below; live ATS coverage is tracked separately.

| Priority | Implementation | Acceptance evidence |
| --- | --- | --- |
| 1 | Explicit profile-field selector for unmatched ordinary questions. Save, edit or remove mappings scoped to normalized question, control, tag and type. Consent and unsupported disclosures cannot be remapped. | Browser test reuses a mapping on another application, preserves an existing answer, edits and removes it. Unit tests reject disclosure mappings and mismatched controls. |
| 2 | Verify the complete filled set for at least 1.5 seconds and until 500 ms of quiet, bounded at 4 seconds. Unsettled pages, replaced controls and changed answers report failures. Verify earlier documents again after later documents finish. | Delayed replacement clears a field and cannot report success; a delayed user edit survives and reports failure. No automatic retry. |
| 3 | Inspect meaningful form structure every 1.5 seconds while the panel is open; invalidate filling and offer rescan. Preserve edited drafts only for a unique unchanged question/control/options in the same document. | Step replacement invalidates old controls. Edited drafts survive rescan. New fields and restored drafts remain unselected. |
| 4 | Batch unanswered writing questions with explicit company/role context, at most 8 fields and 2 concurrent requests. Cancel aborts local active requests and stops queued requests. Enforce field character limits. | Browser tests check concurrency, cancellation, context and unselected results; unit tests cover queue bounds and character limits. Requests instruct the model to use supplied facts, but the user must review accuracy. |
| 5 | Five representative behavioral ATS fixtures, per-run outcome evidence and a manual live-site checklist. | Separate correct, incorrect, missed and preserved-answer counts, dated and versioned. All live platforms remain unverified until actual recorded live checks pass. |

Verification is a bounded observation, not a guarantee against future page changes. Keep the panel open to receive structural-change notices. Closing it cancels drafting and discards unsaved panel drafts. Cancellation cannot undo a request already processed by the model provider.

Resume extraction and profile coverage improvements from 0.5.0 remain: new PDF/TXT uploads prepare text and recognized education when background is empty, require profile review/save, and never manufacture missing dates. Coverage counts reflect detected fields only.

See [ATS live checklist](ATS-LIVE-CHECKLIST.md) and [verification registry](ats-verification.json).
