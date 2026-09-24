# Apply, personally

A personal-use Chrome extension that fills repetitive job application fields and helps draft answers in your own voice. Save your profile and resume once, scan a form, review suggestions, and fill selected fields. No backend, account, telemetry, or automatic submission.

## Install in Chrome

1. Clone this repository or download and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the **extension** folder inside this repository.
4. Pin **Apply, personally** in Chrome's toolbar. Open it and click **Profile ↗**.
5. Save your contact details, resume attachment, resume text, and career goals.
6. On an application page, click the toolbar icon, choose **Scan this application**, review the suggestions, then **Fill selected fields**.

No build step or npm installation is needed to use the extension. Node dependencies are only for development and testing. Chrome 119+ is required.

## AI answers

Add your own OpenAI API key in Profile. The default model is `gpt-5-mini`; the model field is editable. API billing is separate from ChatGPT subscriptions. Your key lasts only for the current browser session and is never committed to this repository or injected into application pages.

Paste the relevant company / role description into **Context for better answers**. Click **Generate AI draft** beside a detected question. This explicitly sends your saved experience, career goals, enabled project notes and source excerpts, that question, and your supplied job context to OpenAI. Contact autofill fields and the attached resume file are excluded. Text in your experience section and enabled projects is included, even if it contains contact details. Use **Extract resume text** to read a PDF or TXT locally, then review the extracted text before saving. Scanned / encrypted PDFs and DOC/DOCX need manually pasted text.

Read and edit the draft, then select its checkbox before filling. The prompt varies wording while grounding claims in your supplied facts; it may ask for missing information. Check every draft for accuracy. The extension does not research the company or invent reasons you want to work there.

Uses the [OpenAI Responses API](https://developers.openai.com/api/docs/guides/text) with `store: false`. This setting does not promise zero provider retention; see [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

## Resume and project knowledge

In Profile, add up to 10 projects with a name, HTTPS link, and notes about your personal contribution, technologies, and results. **Read project link** imports a public page or the default-branch README of a GitHub repository. Source text remains editable and is limited to 6,000 characters per project; contribution notes allow 2,000 characters. A source toggle controls whether that project is included in drafts.

The extension does not crawl entire websites or repositories, follow linked documents, or execute project code. JavaScript-only sites may provide little text. Redirects are rejected: enter the final URL shown in your browser. For private repos, source errors, or details not visible online, paste the relevant project text or write notes. Existing source text survives failed fetches; changing its URL clears the old source to avoid mismatched attribution. Save the profile after editing or reading a source. Sources refresh only when requested.

The answer prompt treats resume and website content as reference material, not instructions. Project marketing copy cannot establish what you personally built; your resume and contribution notes supply that. It keeps performance claims tied to their stated benchmark scope. These are prompting constraints, not guarantees: review generated answers.

**Extract resume text** supports text-based PDF and TXT files up to 4 MB, with PDF limits of 20 pages and 16,000 extracted characters. It runs locally without sending the file to OpenAI. Extraction replaces the experience editor only after confirmation when it already contains text; click Save profile to persist. Formatting and reading order can vary, so review the result.

### Import a prepared personal profile

Use **Import prepared profile → Profile JSON** to load a local JSON file with `version: 1`, a `profile` object, and an optional `resume` attachment. The editor previews it before saving. Only recognized profile fields are imported; API keys and model settings are ignored. Existing profile fields absent from the file stay unchanged. A supplied project list replaces the current list. Save profile applies the preview.

Keep personal imports under the ignored `private/` directory, never in Git. A profile import can contain your full resume and should be treated as personal data. Reloading/updating the extension can clear Chrome session storage, so you may need to re-enter your API key after an update even though profile import itself preserves it.

## Supported behavior

- Common first / last / full name, email, phone, address, location, LinkedIn, GitHub, and portfolio fields.
- Native dropdowns when your saved value exactly matches an option's text or value (ignoring capitalization / punctuation).
- Visible native resume file inputs accepting your saved PDF, DOC, DOCX, or TXT file, up to 4 MB.
- Standard inputs and textareas, accessible labels, autocomplete attributes, and open shadow roots.
- Editable previews, character-limit checks, input/change events, and protection against overwriting existing entries.
- Manual completion for sensitive demographic, work authorization, salary, consent, and similar questions.

**Compatibility is best effort, not universal.** Cross-origin iframes, closed shadow roots, custom dropdown widgets, hidden upload inputs, and unusual ATS controls may need manual entry. No site-specific certification for Workday, Greenhouse, Lever, or other ATS products is claimed. Scan each new step of a multi-step form. The extension neither checks consent boxes nor submits applications. A website may immediately upload or autosave a value after you fill it; review the destination before filling.

Keep the popup open while reviewing / generating answers. Closing it discards unsaved previews and job context. Your saved profile and resume persist. Chrome internal pages and the Chrome Web Store cannot be filled. If a field changes or the page navigates, scan again.

## Privacy and personal use

The source code is public; your profile is not. Each local installation uses its own Chrome storage. Install only in your own OS/browser profile. There is no server-side identity restriction on who can download public source code, and anyone with access to your unlocked browser profile can access your saved data.

- Contact details, resume, and experience use `chrome.storage.local`, not sync storage. They are not encrypted by this extension.
- The API key uses `chrome.storage.session`, restricted to trusted extension contexts.
- Content scripts cannot read either storage area. Only selected values and, when selected, the resume are passed to the application page.
- The extension accesses the active site only after your toolbar interaction; it has no permanent all-sites permission.
- The sole initial permanent host permission is `https://api.openai.com/*` for explicit AI requests. Project imports declare optional HTTPS host access; clicking **Read project link** requests only that source origin (the GitHub API origin for repository READMEs). Granted permissions persist until revoked in Chrome. Clearing saved data does not revoke site permissions. Fetches omit cookies and credentials, reject redirects, and never include your OpenAI key.
- No analytics, remote executable code, or third-party backend. PDF.js and its worker are bundled locally.
- **Forget API key**, **Remove saved resume**, and **Erase all saved data** are available in Profile. Erasing local data does not retract fields already sent to employers or requests sent to OpenAI.

Do not put a real API key, resume, or personal profile into the repository. `private/` and `.env*` are ignored for local notes; neither is needed by the extension. For a publicly hosted multi-user product, put credentials behind an authenticated backend instead of reusing this personal BYOK design.

## Development

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm run test:browser
```

The extension runs plain JavaScript with a locally bundled PDF.js dependency (Apache-2.0; license in `extension/vendor/pdfjs/LICENSE`). Run `npm run vendor:pdf` after updating the pinned `pdfjs-dist` development dependency. The compatibility build includes its own polyfills; no CDN or remote code is used. Tests cover matching, privacy-conscious AI payloads, API error handling, and actual Chromium extension flows: saving profiles, uploading resumes, reviewing fills, preserving existing entries, rejecting stale fields, and approving AI drafts.

Browser tests use an isolated temporary Chrome profile and add **localhost and example.com fixture permissions to a temporary extension copy** to substitute for the physical toolbar click. The shipped manifest does not contain those required fixture permissions. PDF extraction and project source editing are also covered. AI responses are mocked: automated tests do not spend API credits or submit real applications. Live OpenAI credentials and real ATS sites must be checked manually by the user.

GitHub Actions runs the same checks and uploads an extension ZIP. To install that artifact, unzip it and load the folder containing `manifest.json`.
