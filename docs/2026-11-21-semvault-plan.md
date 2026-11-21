# Sem Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free, moderated website where IM students browse course material by semester → course ("Start here" first), download PDFs with their LaTeX source, search a PYQ archive, and upload new material that mods approve.

**Architecture:** One Google Apps Script web app (runs as the owner "god" Gmail, access: Anyone) is the backend. It stores files in Drive and the catalog, mods, courses and log in one Google Sheet. A static single-page site on GitHub Pages is the whole UI, public pages and mod panel alike. Mods sign in with Google Identity Services. The site sends the Google ID token, and the script verifies it and checks the email against the `Mods` tab. Pure logic lives in small files tested with Node's built-in test runner. Apps Script files are loaded into a `vm` context for the tests.

**Tech Stack:** Google Apps Script (V8), Google Sheets + Drive, `clasp` for deploying, plain HTML/CSS/ES-module JS (no framework, no build), Node 26 `node:test`, Python 3.14 + pytest for the seeding script.

**Spec:** `_semvault/docs/2026-11-21-semvault-design.md`

**Change from the spec (builder's call, allowed by "Left to the builder"):** the mod panel is a page of the static site, not an Apps Script HTML page. Signing in with Google there needs a free OAuth client ID (Google Cloud console, no billing). This removes the "unverified app" consent screen mods would otherwise hit, and mods need no Drive or Sheet sharing.

## Global Constraints

- Free forever. No credit card anywhere, no paid services, no third-party email or OTP service.
- One department (IM). Navigation is semester → course. No department level.
- A course is identified by its course code. Semester comes from the `Courses` tab. Drive layout is `Live/<CourseCode>/`.
- Item types: `notes`, `formula`, `pyq`, `lab`, `assignment`, `other`.
- Item status: `pending`, `approved`, `rejected`, `removed`. Only `approved` is ever public.
- Upload cap: 25 MB per file. Source may be `.tex` or `.zip`.
- Digest at 8 am and 9 pm, Asia/Kolkata. Send one email to all mods, and only if at least one item is `pending`.
- Only the owner (Script Property `OWNER_EMAIL`) adds or removes mods. Mods cannot change the mod list.
- Every mod action appends a row to the `Log` tab. Log rows are never edited or deleted.
- Source download hint copy, exactly: "Give this to your AI agent to modify the PDF."
- Must work on a 375 px wide phone screen.
- Seeding excludes: `Simulation`, `sim`, `Simulation.py`, any dir ending `_src`, `__pycache__`, `.obsidian`, any dir starting `backup`, `_inbox`, `_semvault`, `bin`, `out`, `exam_prep_code`, `tex_common`.

## Review Focus

1. **Messy question-paper filenames** (`… (1).pdf`, `&`, `End-Autumn`, a leading numeric id like `11311_2024_…`, `MidSem_2024_Solutions`): the parser fills what it can, leaves the rest blank, and never throws. → Task 4 tests.
2. **Two mods reviewing the same item at once:** the second gets "Already reviewed by <email>" and nothing changes. → Task 3 test (`applyReview` on a non-pending item) and a lock in the handler.
3. **A removed mod or a signed-in non-mod calling mod actions:** they are refused with 403 straight away, with no stale session. → Task 2 `roleOf` tests. Every mod handler re-reads `Mods` on each call.
4. **A Start-here item that later gets rejected or removed:** it disappears from the public page and the rest stays ordered. A course with no picks still shows its items normally. → Task 4 `coursePage` tests.
5. **An oversized or wrong-type upload:** blocked in the browser with a clear message before any bytes are sent, and refused by the server too. → Task 1 `validateUpload` tests, Task 6 check.

---

## File structure

```
_semvault/
  package.json                 # "test": "node --test tests/"
  README.md                    # setup, deploy, handover guide (Task 9)
  apps-script/                 # pushed with clasp; all files share one global scope
    appsscript.json            # timeZone Asia/Kolkata, webapp executeAs USER_DEPLOYING, access ANYONE_ANONYMOUS
    Catalog.js                 # PURE: columns, rowToItem, itemToRow, publicView, validateUpload, applyReview, applyEdits
    Roles.js                   # PURE: roleOf, logRow
    Digest.js                  # PURE: buildDigest
    Store.js                   # Sheet/Drive I/O, catalog cache
    Auth.js                    # verifyIdToken (UrlFetchApp → tokeninfo)
    Api.js                     # doGet/doPost router + handlers
    Jobs.js                    # sendDigest trigger, setup(), importSeed()
  site/
    index.html                 # shell, hash router mount, GIS script tag
    css/style.css
    js/config.js               # API_URL, GOOGLE_CLIENT_ID, SITE_URL
    js/api.js                  # getCatalog(), post(action, body)
    js/app.js                  # router: #/  #/sem/:n  #/course/:code  #/pyqs  #/search?q=  #/upload  #/mod
    js/lib/pyq.js              # PURE: parsePyqFilename
    js/lib/catalog.js          # PURE: semesters, coursePage, filterPyqs, search, driveUrls
    js/views/{home,course,pyqs,search,upload,mod}.js
    dev/sample-catalog.json    # used when API_URL is empty, for local preview
  seed/
    seed.py                    # scan → candidates.csv ; build → staging/ + manifest.csv
    courses.json               # top-level folder → course code, name, semester
    test_seed.py
  tests/
    gas.js                     # loadGas(...files) → vm context exposing globals
    catalog.test.js  roles.test.js  digest.test.js  pyq.test.js  site-catalog.test.js
```

**Shared shapes**

`Item` (one Catalog row; column order = `CATALOG_COLUMNS`):
`{ id, course, type, title, description, fileId, sourceFileId, sourceName, year, term, exam, uploaderName, uploaderEmail, uploadedAt, status, startHere, startOrder, reviewedBy, reviewedAt, rejectReason }`
`year` is a number or `''`. `term` is `'autumn'|'spring'|''`. `exam` is `'midsem'|'endsem'|''`. `startHere` is a boolean. `startOrder` is a number or `''`. Dates are ISO strings.

`PublicItem`: the `Item` minus `uploaderEmail`, `status`, `rejectReason`.

`Course` (Courses tab): `{ code, name, short, semester }`.

API (POST bodies are JSON sent as `text/plain` to avoid a CORS preflight; every response is `{ ok: true, ... }` or `{ ok: false, error }`):

| action | who | in | out |
|---|---|---|---|
| GET `?action=catalog` | anyone | — | `{courses, items: PublicItem[], updatedAt}` |
| `upload` | anyone | `{meta, file:{name,mimeType,base64}, source?, hp}` | `{id}` |
| `me` | signed in | `{idToken}` | `{email, role}` |
| `pending` | mod | `{idToken}` | `{items: Item[]}` (each with `fileUrl`) |
| `review` | mod | `{idToken, id, decision:'approve'\|'reject', reason?, edits?}` | `{item}` |
| `update` | mod | `{idToken, id, edits}` (edits may set `status:'removed'`) | `{item}` |
| `saveCourse` | mod | `{idToken, course: Course}` | `{courses}` |
| `activity` | mod | `{idToken, limit}` | `{rows}` |
| `requestMod` | signed in | `{idToken}` | `{}` |
| `mods` | owner | `{idToken}` | `{mods, requests}` |
| `setMod` | owner | `{idToken, email, decision:'add'\|'remove'\|'decline'}` | `{mods, requests}` |

---

### Task 1: Scaffold, GAS test loader, catalog logic

**Files:**
- Create: `_semvault/package.json`, `_semvault/.gitignore` (`seed/staging/`, `seed/candidates.csv`, `node_modules/`, `.clasp.json`), `tests/gas.js`, `apps-script/appsscript.json`, `apps-script/Catalog.js`, `tests/catalog.test.js`

**Interfaces:**
- Produces: `loadGas(...relPaths) → context` (in `tests/gas.js`; evaluates each file into one `vm` context and returns it). In `Catalog.js`: `CATALOG_COLUMNS: string[]`, `ITEM_TYPES`, `MAX_BYTES = 25*1024*1024`, `rowToItem(row: any[]) → Item`, `itemToRow(item) → any[]`, `publicView(items: Item[]) → PublicItem[]`, `validateUpload(meta, file, source) → {ok, errors: string[]}`, `applyReview(item, {decision, reviewer, at, reason}) → {ok, item?, error?}`, `applyEdits(item, edits) → Item`

- [ ] **Step 1:** `git init` in `_semvault`, then write `package.json` (`"type":"module"`, `"test":"node --test tests/"`) and `.gitignore`.
- [ ] **Step 2: Write the failing tests** in `tests/catalog.test.js`:
  - `rowToItem(itemToRow(x))` deep-equals `x` for a full item, with `startHere` coming back as a boolean from `'TRUE'`/`true`.
  - `publicView` drops `pending`, `rejected` and `removed` items, and strips `uploaderEmail`, `status` and `rejectReason`.
  - `validateUpload` rejects: a missing title, a course not given, a type not in `ITEM_TYPES`, a file over `MAX_BYTES` (error contains `"25 MB"`), a source that isn't `.tex`/`.zip`. It accepts a valid pdf with no source.
  - `applyReview` on a pending item with `approve` sets `status:'approved'`, `reviewedBy` and `reviewedAt`. On an already-approved item it returns `{ok:false, error:'Already reviewed by a@x.com'}`. `reject` without a reason fails.
  - `applyEdits` ignores keys outside `title, description, course, type, year, term, exam, startHere, startOrder, status`, and only allows `status` → `'removed'`.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (`loadGas` / functions not defined).
- [ ] **Step 4:** Implement `tests/gas.js` and `Catalog.js`. Use plain function declarations, no `import`/`export` (Apps Script shares one global scope). Base64 size = `Math.floor(len*3/4)`.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6:** Write `appsscript.json`: `timeZone: "Asia/Kolkata"`, `runtimeVersion: "V8"`, `webapp: {executeAs: "USER_DEPLOYING", access: "ANYONE_ANONYMOUS"}`, oauthScopes for drive, spreadsheets, script.send_mail, script.external_request, script.scriptapp.
- [ ] **Step 7:** Commit: `feat: scaffold and catalog logic`.

### Task 2: Roles, activity log row, mail digest

**Files:**
- Create: `apps-script/Roles.js`, `apps-script/Digest.js`, `tests/roles.test.js`, `tests/digest.test.js`

**Interfaces:**
- Consumes: `Item` shape.
- Produces: `roleOf(email, ownerEmail, modEmails: string[]) → 'owner'|'mod'|'none'` (case- and whitespace-insensitive; the owner is also allowed every mod action). `logRow(actor, action, targetId, detail, atIso) → any[]` (`[atIso, actor, action, targetId, detail]`). `buildDigest(pending: Item[], courses: Course[], modUrl, nowIso) → null | {subject, body}`.

- [ ] **Step 1: Write the failing tests:**
  - `roleOf(' A@x.com ', 'a@x.com', [])` returns `'owner'`. `roleOf('b@x.com','a@x.com',['B@x.com'])` returns `'mod'`. An empty or undefined email returns `'none'`. An email removed from the list returns `'none'`.
  - `buildDigest([], …)` returns `null`. With 2 pending items, `subject === 'Sem Vault: 2 uploads waiting for review'`. With 1 item, the subject says `1 upload waiting`. The body lists each title with its course short name and upload time, and contains `modUrl`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `Roles.js` and `Digest.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: roles and digest`.

### Task 3: Apps Script I/O, API and jobs

Not unit-tested. Apps Script services don't run in Node. The handlers stay thin and call Task 1–2 functions. Verified by hand on the deployed script (Step 6).

**Files:**
- Create: `apps-script/Store.js`, `apps-script/Auth.js`, `apps-script/Api.js`, `apps-script/Jobs.js`

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces: the API table above. In `Jobs.js`: `setup()`, `sendDigest()`, `importSeed()`.

- [ ] **Step 1: `Store.js`.** `props()` reads Script Properties `OWNER_EMAIL, SHEET_ID, ROOT_FOLDER_ID, GOOGLE_CLIENT_ID, SITE_URL`. `readItems()` / `writeItem(item)` (upsert by id) / `appendLog(row)` / `readMods()` / `readRequests()` / `readCourses()` / `saveCourse(c)`. Folder helpers: `liveFolder(code)` (create on demand), `pendingFolder()`, `rejectedFolder()`. Public catalog cache: `CacheService` JSON split into 90 KB chunks under `catalog:0..n`, 10 min TTL, cleared by `bustCache()` on every write.
- [ ] **Step 2: `Auth.js`.** `verifyIdToken(token) → email | null`: `UrlFetchApp` to `https://oauth2.googleapis.com/tokeninfo?id_token=…`, accept only if `aud === GOOGLE_CLIENT_ID`, `email_verified === 'true'` and `exp` is in the future. Cache the result for 5 min keyed by a token hash.
- [ ] **Step 3: `Api.js`.**
  - `doGet` serves `catalog`. `doPost` parses JSON, routes by `action`, wraps errors into `{ok:false,error}`, and returns `ContentService` JSON.
  - Every mod or owner handler: verify the token, re-read `Mods`, call `roleOf`, and refuse with `{ok:false, error:'Not authorised', code:403}` if the role is too low.
  - `upload`: honeypot `hp` must be empty. A global limit of 30 uploads/hour (CacheService counter). Run `validateUpload`, save the files to `Pending/` named `<id>.<ext>` / `<id>.src.<ext>`, set them to "anyone with link: view" (the ids are only shown to mods), and write a `pending` row.
  - `review` and `update` run inside `LockService.getScriptLock()`, re-read the row, and apply `applyReview` / `applyEdits`. Approve moves the files to `liveFolder(course)`. Reject moves them to `Rejected/` and sets sharing to private. Every action appends a log row and calls `bustCache()`.
  - `setMod` add/remove edits the `Mods` tab. `requestMod` appends to `Requests` unless the email is already there or already a mod.
- [ ] **Step 4: `Jobs.js`.**
  - `setup()` creates the root folder with `Pending/Live/Rejected/Seed`, and the Sheet with tabs `Catalog` (header = `CATALOG_COLUMNS`), `Courses`, `Mods`, `Requests`, `Log`. It writes their ids to Script Properties, and installs daily triggers for `sendDigest` at hour 8 and hour 21. It is safe to run twice: it reuses existing resources and doesn't duplicate triggers.
  - `sendDigest()` builds the digest from pending items and sends one `MailApp.sendEmail` with every mod in `to` and a `modUrl` of `SITE_URL + '#/mod'`. It sends nothing when `buildDigest` returns null.
  - `importSeed()` reads `Seed/manifest.csv`. For each row it moves `<id>.pdf` and the optional source into `liveFolder`, sets "anyone with link", and writes an `approved` row with `reviewedBy:'seed'` and the manifest's `startHere`/`startOrder`. It logs one `seed-import` row with a count, and skips ids already in the Catalog.
- [ ] **Step 5:** `npm test` still passes (pure files unchanged). Commit: `feat: apps script backend`.
- [ ] **Step 6 (manual, on the owner account, after Task 9's setup steps 1–4):** Run `setup()`. Then `curl "<API>?action=catalog"` should return `{"ok":true,"items":[]…}`. A POST `upload` with a small pdf should put the file in `Pending/` and a row in Catalog. A POST `pending` without a token should return `Not authorised`.

### Task 4: Site pure logic

**Files:**
- Create: `site/js/lib/pyq.js`, `site/js/lib/catalog.js`, `tests/pyq.test.js`, `tests/site-catalog.test.js`

**Interfaces:**
- Produces: `parsePyqFilename(name) → {course, year, term, exam}` (each `null` when unknown). `semesters(courses) → [{semester, courses: Course[]}]` sorted ascending, courses sorted by code. `coursePage(items, code) → {startHere: PublicItem[], groups: [{type, items}]}`. `filterPyqs(items, {course, year, term, exam}) → PublicItem[]` (empty filter = all; sorted year desc, then endsem before midsem). `search(items, courses, q) → PublicItem[]`. `driveUrls(fileId) → {view, download}`.

- [ ] **Step 1: Write the failing tests:**
  - `parsePyqFilename('12834_IM31005_QUALITY-DESIGN-AND-CONTROL_2025_autumn_endsem.pdf')` returns `{course:'IM31005', year:2025, term:'autumn', exam:'endsem'}`.
  - `'2023_End_Autumn_Industrial_and_System_IM31005_Quality_Design_and_Control_EA_2022 (1).pdf'` returns `{course:'IM31005', year:2023, term:'autumn', exam:'endsem'}`.
  - `'11311_2024_End-Autumn_Industrial_&_Systems_Engineering_IM31005_Quality_Design_and_Control_2024.pdf'` returns year `2024`, exam `'endsem'`, course `'IM31005'`.
  - `'IM21203_EngEco_MidSem_2024_Solutions.pdf'` returns `{course:'IM21203', year:2024, term:null, exam:'midsem'}`.
  - `'notes.pdf'` returns all nulls.
  - `coursePage`: items with `startHere` are ordered by `startOrder` (blanks last). Non-start items are grouped in type order `formula, notes, pyq, lab, assignment, other`, and empty groups are omitted. Items from other courses are excluded. With no picks, `startHere` is `[]`.
  - `search` is case-insensitive over title, description, course code, course name and short name. An empty `q` returns `[]`.
  - `driveUrls('abc').download === 'https://drive.google.com/uc?export=download&id=abc'` and `view === 'https://drive.google.com/file/d/abc/view'`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. In `parsePyqFilename`, strip the extension, split on `[_\-\s.()&]+`, then match tokens case-insensitively:
  - course: `^[A-Z]{2}\d{5}$`
  - year: the first `^20\d{2}$`
  - term: `autumn` or `spring`
  - exam: `mid`/`midsem` → midsem, `end`/`endsem` → endsem (first exam token wins)
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: site catalog logic`.

### Task 5: Site shell and public pages

**Files:**
- Create: `site/index.html`, `site/css/style.css`, `site/js/config.js`, `site/js/api.js`, `site/js/app.js`, `site/js/views/home.js`, `site/js/views/course.js`, `site/js/views/pyqs.js`, `site/js/views/search.js`, `site/dev/sample-catalog.json`

**Interfaces:**
- Consumes: Task 4 lib functions, and the API `catalog` shape.
- Produces: `getCatalog() → Promise<{courses, items}>` (falls back to `dev/sample-catalog.json` when `API_URL === ''`, and caches in `sessionStorage` for 5 min). `post(action, body) → Promise<object>` (throws `Error(error)` when `ok:false`). Each view is `render(el, params, catalog)`.

- [ ] **Step 1:** Write `sample-catalog.json` with 3 courses in 2 semesters. Include start-here items, a course with no picks, items with and without a source, and 5 PYQs across 2 courses.
- [ ] **Step 2:** Build the pages:
  - **Header:** site name, search box, and links Home / PYQs / Upload.
  - **Home** (`#/`): semesters as sections, with courses as cards showing short name, code and item count.
  - **Course** (`#/course/:code`): title, a **Start here** strip of cards first, then each type group in a collapsed `<details>`.
  - **Item card:** title, type label, View and Download PDF buttons. When there's a source, a Download source button with the exact hint "Give this to your AI agent to modify the PDF."
  - **PYQs** (`#/pyqs`): filter selects for course, year, term and exam, plus a table that becomes stacked cards under 600 px.
  - **Search** (`#/search?q=`).
  - Show a loading state while the catalog loads. If the API fails, show "Couldn't load, try again" with a retry button.
- [ ] **Step 3: Verify.** Run `npx serve site` (or `python -m http.server -d site`) and open it in the browser pane at 375 px and at desktop width.
  - Every route renders from the sample catalog.
  - The empty-picks course shows its groups.
  - The PYQ filters narrow the table.
  - The console has no errors.
- [ ] **Step 4:** Commit: `feat: public site pages`.

### Task 6: Upload page

**Files:**
- Create: `site/js/views/upload.js`

**Interfaces:**
- Consumes: `post('upload', …)`, `parsePyqFilename`, and the catalog's `courses`.

- [ ] **Step 1:** Build the form:
  - Course select (by semester; "Not listed" reveals a free-text name, sent as course `OTHER:<name>`), type, title, description, file and optional source.
  - Year/term/exam fields show only when the type is `pyq`. Picking a file with a parseable name pre-fills course/year/term/exam and switches the type to `pyq` when an exam token was found.
  - Optional name/email, and a hidden honeypot input `hp`.
  - Check in the browser before sending: file ≤ 25 MB ("Max 25 MB per file"), source `.tex`/`.zip`, title present.
  - Read files as base64 with `FileReader`, and show a progress state while sending. On success, show "Thanks, a mod will review it." with an "Upload another" button.
- [ ] **Step 2:** Apps Script side: `validateUpload` accepts a course `OTHER:<name>`. Add a test case to `tests/catalog.test.js`, run `npm test`, and expect PASS.
- [ ] **Step 3: Verify** with `API_URL` empty: the submit button shows "Preview mode: uploads disabled" and the in-browser checks fire for a 30 MB file and a `.docx` source.
- [ ] **Step 4:** Commit: `feat: upload page`.

### Task 7: Mod panel

**Files:**
- Create: `site/js/views/mod.js`
- Modify: `site/index.html` (GIS script `https://accounts.google.com/gsi/client`)

**Interfaces:**
- Consumes: the API actions `me, pending, review, update, saveCourse, activity, requestMod, mods, setMod`.

- [ ] **Step 1:** Build sign-in. Render the Google Identity Services button and keep the ID token in memory only, never in storage. Call `me`:
  - Role `none`: show "You're not a mod" with a **Request to be a mod** button (`requestMod`, then "Request sent to the owner").
  - Role `mod`/`owner`: show the tabs.
- [ ] **Step 2:** Build the tabs:
  - **Queue:** one card per pending item with a preview link and editable fields. An `OTHER:` course must be mapped to an existing course, or a new one created inline via `saveCourse`, before Approve is enabled. Approve and Reject (reason required). On "Already reviewed by …", show the message and refresh the queue.
  - **Start here:** pick a course, list its approved items, toggle start-here, reorder with ↑/↓ (sends `update` with `startHere`/`startOrder`).
  - **Library:** search approved items, edit metadata or Remove (confirm dialog). Each item shows "approved by *email* at *time*".
  - **Activity:** the last 200 log rows (time, who, action, item title).
  - **Owner** (owner only): the mod list with Remove, pending requests with Approve/Decline, and an "Add mod by email" box.
- [ ] **Step 3: Verify** against the deployed script (after Task 9). Check each of these:
  - A non-mod sees the request flow.
  - Approve moves an item onto the public course page within one reload (cache busted).
  - A second approve from another tab shows "Already reviewed by …".
  - Removing a mod stops their next action with "Not authorised".
- [ ] **Step 4:** Commit: `feat: mod panel`.

### Task 8: Seeding script

**Files:**
- Create: `seed/seed.py`, `seed/courses.json`, `seed/test_seed.py`

**Interfaces:**
- Produces: CLI `python seed/seed.py scan <root> --out seed/candidates.csv` and `python seed/seed.py build seed/candidates.csv --staging seed/staging`. Functions: `is_excluded(rel_path: str) -> bool`, `guess_type(rel_path: str) -> str`, `find_source(pdf: Path) -> Path | None`, `needs_bundle(tex_text: str) -> bool`, `parse_pyq(name: str) -> dict` (same rules and test cases as Task 4).
- `candidates.csv` columns: `include,path,course,type,title,source,year,term,exam,start_here,start_order`.
- `manifest.csv` columns: `id,file,source_file,course,type,title,year,term,exam,start_here,start_order`.

- [ ] **Step 1:** Write `courses.json` with the known mappings: `EE → IM21203 Engineering Economy`, `QDC → IM31005 Quality Design and Control`, `HPSC → CD61002 High Performance Scientific Computing`, plus entries for `QDC Lab`, `QDC Lab All Exps`, `SCM`, `stochastic` with `"code": ""` for the owner to fill. Unknown codes make `scan` print a warning listing them.
- [ ] **Step 2: Write the failing tests** in `test_seed.py`:
  - `is_excluded` is True for `HPSC/l123_src/a.pdf`, `HPSC/backup_pre_restyle/x.pdf`, `Simulation/x.pdf`, `sim/x.pdf`, `.obsidian/x`. It is False for `QDC/formula-sheet/QDC_Formula_Sheet.pdf`.
  - `guess_type`: `QDC/Endsem Papers/x.pdf` and `EE/PYQs/x.pdf` give `pyq`. `QDC/formula-sheet/x.pdf` gives `formula`. `QDC Lab/exp1/x.pdf` gives `lab`. `HPSC/assignment/x.pdf` gives `assignment`. Anything else gives `notes`.
  - `find_source`: with a tmp dir holding `a.pdf` and `a.tex`, it returns `a.tex`. With no tex, it returns `None`.
  - `needs_bundle`: True when the text has `\includegraphics`, `\input{` or `\include{`. False for plain text.
  - `build` on a 2-row tmp csv (one row `include=n`) writes 1 manifest row. With a bundled source, the zip contains the `.tex` plus the referenced figure files and excludes `.aux/.log/.out/.synctex.gz`.
  - `parse_pyq` uses the Task 4 cases.
- [ ] **Step 3:** Run `pytest seed -q`. Expected: FAIL.
- [ ] **Step 4:** Implement. `scan` writes PDFs only, with `include=y` and `title` taken from the filename (underscores/hyphens → spaces). It suggests `start_here=y` for `formula` items. `build` creates ids `it_` + 8 hex chars.
- [ ] **Step 5:** Run `pytest seed -q`. Expected: PASS.
- [ ] **Step 6:** Run `python seed/seed.py scan "C:\Users\User A\Documents\Indu" --out seed/candidates.csv`. Check that no excluded path appears and the row count is plausible (under 200). Commit (the csv is gitignored): `feat: seeding script`.

### Task 9: Setup, deploy and handover guide

**Files:**
- Create: `_semvault/README.md`
- Modify: `site/js/config.js` (real values after deploy)

- [ ] **Step 1:** Write the README as numbered steps the owner can follow:
  1. Create the god Gmail account.
  2. While signed in as it, create an Apps Script project. Run `npx @google/clasp login` and `clasp clone`/`push` from `apps-script/` (fallback: paste the files into the editor).
  3. Run `setup()` and approve the permissions.
  4. In Google Cloud console (the script's project, no billing), create an OAuth client ID of type Web with authorised origin `https://<github-user>.github.io`. Set the Script Properties `GOOGLE_CLIENT_ID`, `OWNER_EMAIL`, `SITE_URL`.
  5. Deploy as a web app (execute as me, anyone) and copy the URL.
  6. Create the GitHub account on the god Gmail, push `site/` and enable Pages.
  7. Fill in `config.js`.
  8. Seed: `scan`, edit the CSV, `build`, drag `seed/staging` into Drive `Seed/`, run `importSeed()`.
  9. Add mods.
  10. **Handover:** give the next owner the Gmail password and recovery details, change `OWNER_EMAIL`, nothing else.
  11. **Adding a new semester's folder:** the same `scan`/`build`/`importSeed` steps.
  12. **Troubleshooting:** "Not authorised" (email not in Mods), quota emails.
- [ ] **Step 2:** Follow the guide end to end (with the owner, since it needs their new account). Then run the Task 3 Step 6 and Task 7 Step 3 checks.
- [ ] **Step 3:** Commit: `docs: setup and handover guide`.
