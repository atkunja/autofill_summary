# Apply, personally

A personal-use Chrome extension that fills repetitive job application fields and helps draft answers in your own voice. Save your profile and resume once, scan a form, review suggestions, and fill selected fields. No backend, account, telemetry, or automatic submission.

## Install in Chrome

1. Clone this repository or download and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the **extension** folder inside this repository.
4. Pin **Apply, personally** in Chrome's toolbar. Open it and click **Profile ↗**.
5. Save your contact details, resume attachment, resume text, and career goals.
6. On an application page, click the toolbar icon, choose **Scan this application**, review the suggestions, then **Fill selected fields**.

No build step or npm installation is needed to use the extension. Node dependencies are only for development and testing. Chrome 116+ is required.

## AI answers

Add your own OpenAI API key in Profile. The default model is `gpt-5-mini`; the model field is editable. API billing is separate from ChatGPT subscriptions. Your key lasts only for the current browser session and is never committed to this repository or injected into application pages.

Paste the relevant company / role description into **Context for better answers**. Click **Generate AI draft** beside a detected question. This explicitly sends your saved experience, career goals, that question, and your supplied job context to OpenAI. Contact details and the attached resume file are excluded. Paste resume text separately to make it available for drafting; files are not parsed automatically.

Read and edit the draft, then select its checkbox before filling. The prompt varies wording while grounding claims in your supplied facts; it may ask for missing information. Check every draft for accuracy. The extension does not research the company or invent reasons you want to work there.

Uses the [OpenAI Responses API](https://developers.openai.com/api/docs/guides/text) with `store: false`. This setting does not promise zero provider retention; see [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

## Supported behavior

- Common first / last / full name, email, phone, address, location, LinkedIn, and portfolio fields.
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
- The sole permanent host permission is `https://api.openai.com/*` for explicit AI requests.
- No analytics, remote executable code, or third-party backend.
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

The extension runs plain JavaScript with no production dependencies. Tests cover matching, privacy-conscious AI payloads, API error handling, and actual Chromium extension flows: saving profiles, uploading resumes, reviewing fills, preserving existing entries, rejecting stale fields, and approving AI drafts.

Browser tests use an isolated temporary Chrome profile and add **localhost-only host permission to a temporary extension copy** to substitute for the physical toolbar click. The shipped manifest does not contain that permission. AI responses are mocked: automated tests do not spend API credits or submit real applications. Live OpenAI credentials and real ATS sites must be checked manually by the user.

GitHub Actions runs the same checks and uploads an extension ZIP. To install that artifact, unzip it and load the folder containing `manifest.json`.
