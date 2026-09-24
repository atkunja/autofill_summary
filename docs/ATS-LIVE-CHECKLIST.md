# ATS verification

Fixtures reproduce selected control behaviors. They are not copies of current vendor implementations and cannot establish live compatibility. All five platforms currently remain **live unverified** in `ats-verification.json`.

## Reproduce local evidence

Run `npm ci`, `npx playwright install chromium`, and `npm run test:browser`. The suite writes `test-results/ats-fixtures.json`; CI retains it as an artifact. Records include timestamp, extension/browser versions, control version, fixture SHA-256, individual observations and separate outcome counts. Missing records mean the test did not reach that platform, not a pass.

For manual fixture exploration, run `npm run fixtures`, open http://127.0.0.1:4173, load the unpacked extension, then click its toolbar button on a fixture to grant active-tab access. Use a dummy profile. Fixtures never send applications.

| Platform | Representative fixture behaviors | Live status |
| --- | --- | --- |
| Ashby | Nested education inputs, canonical school picker, answer buttons | Unverified |
| Greenhouse | React Select, education and explicit saved disclosures | Unverified |
| Workday | Custom listbox/radios, two-step form replacement | Unverified |
| Lever | Native contact/link fields and an existing answer | Unverified |
| iCIMS | Embedded document, native dropdown and consent checkbox | Unverified |

## Manual live-site procedure

Use a job application you are authorized to inspect. Do not submit it as part of verification. Do not commit personal answers, uploaded resumes, API keys, application tokens or screenshots containing personal information.

1. Record platform, public site URL without application tokens, UTC date, extension version, Chrome version, and observed control version. If the vendor exposes no version, record `not exposed` plus control roles, framework if observable, step names and a sanitized markup hash or reproducible description. Never invent a vendor version.
2. Inventory visible known fields and expected answers before filling. Separately inventory existing answers, unsupported questions, consent, and disclosures without saved explicit choices. Review profile facts and any mappings first.
3. Scan and fill reviewed selections. Compare every targeted answer with the expected answer after the extension finishes, again after at least five seconds, and after resume parsing finishes. Record every mismatch, including answers that disappear.
4. Enter an answer manually between scan and fill; confirm it is preserved. Check that consent and unsupported disclosures remain untouched and Submit is never activated.
5. Edit a writing draft, trigger a meaningful form change, and rescan. Confirm unchanged questions in the same document keep edited drafts. Navigate to the next step; confirm stale controls cannot be filled and newly discovered fields require selection.
6. Test a reviewed ordinary-field mapping on a second application with the same question and control type. Edit/remove it in Profile, rescan, and verify the updated behavior. Existing answers must survive all cases.
7. With explicit company/role context and mocked or deliberately authorized AI use, generate drafts, edit one while pending, and cancel a batch. Confirm generated answers stay unselected, edits survive, no queued requests begin after cancellation, and personal claims match the supplied profile.
8. Record results in a new `runs` entry in `ats-verification.json`. Keep previous runs. Only mark the tested site/control scope verified when all expected behavior passes; do not claim an entire ATS or every employer variant works. For an inconclusive or failed run, record that status and the failures.

## Separate metrics

- **Correct fills:** initially empty known fields containing the expected answer after settling.
- **Incorrect fills:** initially empty known fields containing a nonempty wrong answer.
- **Missed known fields:** initially empty known fields still empty, including fields the scanner missed. Inventory the page independently, not just the preview.
- **Preserved existing answers:** existing fields unchanged, reported alongside the total existing-field count. Record overwritten existing answers separately; never count them as correct fills.

For the fixed inventory, correct + incorrect + missed must equal the total initially empty known fields. Record unsupported/unknown questions separately. A passing fixture, a successful scan, or a nonzero fill count alone cannot mark a live run verified.

Example run fields: `ats`, `evidenceKind: live`, `status`, `site`, `testedAt`, `extensionVersion`, `browserVersion`, `controlVersion`, `scope`, `knownFields`, `correctFills`, `incorrectFills`, `missedKnownFields`, `existingFields`, `preservedExistingAnswers`, `overwrittenExistingAnswers`, `unsupportedFields`, `failures`, `sanitizedEvidence`.
