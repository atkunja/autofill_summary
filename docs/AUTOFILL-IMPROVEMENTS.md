# Autofill reliability priorities

The current extension has useful control handling, but passing local fixtures does not establish that a live application is complete. The Ramp investigation exposed a setup gap: the resume attachment existed while education, extracted background and project context were empty.

## Implemented in this update

- Prepare PDF/TXT text and recognized education when a resume is selected and experience text is empty. Keep existing answers, leave unrecognized dates blank, and require Save profile after review. Unsupported documents explain the manual text step.
- Report detected fields as already filled, selected, or needing attention. Update after filling and selection changes. This reports detected fields only, not hidden or inaccessible application fields.

## Next priorities, in order

| Priority | Problem in current implementation | Concrete change | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | `matching.js` uses narrow label patterns. Unknown but answerable fields still require manual mapping. | Add an explicit “use this profile field” selector for unmatched fields, with a saved, editable mapping scoped to the question and control type. Never infer consent or unsupported disclosures. | A reviewed mapping works on the next application, can be removed, and cannot overwrite an existing answer. |
| 2 | `content.js` verifies most native values immediately. Later React renders or upload parsing may change them. | Verify the full filled set after asynchronous updates settle and show changed/rejected fields as failures. | A fixture that clears a value after a delayed rerender cannot produce a successful final result. Do not silently retry over user edits. |
| 3 | Each application step requires a manual scan. | Detect meaningful form changes, offer a rescan, and preserve edited drafts where the question and document are unchanged. | Navigating a step invalidates stale controls; a rescan preserves drafts and never fills newly added fields without review. |
| 4 | AI drafts are generated individually and company context capture is limited. | Add a reviewed batch-draft action with bounded concurrency, cancellation, field limits, and explicit company/role context. | Drafts remain unselected until reviewed; no invented personal facts; cancellation stops queued requests. |
| 5 | ATS claims exceed the available evidence if based only on synthetic fixtures. | Maintain reproducible representative forms and a manual live-site verification checklist for Ashby, Greenhouse, Workday, Lever and iCIMS. | Track correct fills, incorrect fills, missed known fields, and preserved existing answers separately. Record site/date/control version. Never mark an ATS verified solely because a fixture passes. |

## Quality target

Measure known, answerable fields separately from missing profile facts, unavailable options, consent, and unsupported widgets. Optimize for zero wrong answers and zero unintended submissions first, then increase coverage. Use synthetic candidate data in public fixtures. Keep real profiles and credentials out of the repository.
