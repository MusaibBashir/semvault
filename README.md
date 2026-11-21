# Sem Vault

A free, student-run library for the IM department at IIT Kharagpur. You browse it by **semester → course**. Each course page opens with a short **Start here** list picked by mods, and everything else sits below it. Anyone can upload. A mod approves each upload before it goes public. Claude-made PDFs come with their LaTeX source, so the next person's AI agent can edit them instead of starting from scratch.

- **Site:** static pages in `site/`, hosted free on GitHub Pages.
- **Backend:** a Google Apps Script in `apps-script/`. It stores files in Google Drive and the catalog in a Google Sheet, both owned by **kgp.indu@gmail.com**.
- **Mods** sign in with Google. The script checks each one's email against the `Mods` tab. Only the owner account can add or remove mods.
- **Digest email** at 8 am and 9 pm IST, only when uploads are waiting.
- No credit card anywhere. Nothing here costs money.

Design and plan: `docs/2026-11-21-semvault-design.md`, `docs/2026-11-21-semvault-plan.md`.

---

## First-time setup (about 45 minutes, once)

Do every step **signed in as kgp.indu@gmail.com**. A private or incognito browser window keeps your own account out of the way.

### 1. Put the backend in Apps Script

1. Go to <https://script.google.com/home/usersettings> and turn on **Google Apps Script API**.
2. In this folder, run these commands. The `login` command opens a browser, so pick kgp.indu@gmail.com there:
   ```powershell
   npx @google/clasp login
   ```
   ```powershell
   cd apps-script; npx @google/clasp create --type standalone --title "Sem Vault" --rootDir .; npx @google/clasp push
   ```
   No Node? Instead, create a new project at <https://script.google.com>, add one script file per `.js` file in `apps-script/` (same names), and paste in the contents. Then turn on "Show appsscript.json" in Project Settings and paste `appsscript.json` too.
3. Open the project (<https://script.google.com>, then **Sem Vault**). Choose the function **`setup`** in the toolbar and click **Run**.
   - Google warns *"Google hasn't verified this app"*. That's expected: it's your own script. Click **Advanced → Go to Sem Vault → Allow**.
   - When it finishes, the log shows links to a new Drive folder **Sem Vault** (with `Pending`, `Live`, `Rejected` and `Seed` inside) and a Sheet **Sem Vault catalog**.
   - Setup also records kgp.indu@gmail.com as the owner and schedules the 8 am and 9 pm digests. It's safe to run again.

### 2. Make a Google sign-in ID for mods (free, no billing)

1. Go to <https://console.cloud.google.com> → **New project** → name it `Sem Vault` → Create.
2. Open **Google Auth Platform** (or "OAuth consent screen").
   - App name `Sem Vault`, support email kgp.indu@gmail.com, audience **External**. Add no scopes.
   - Under **Audience**, click **Publish app**. Sign-in only asks for name and email, so Google doesn't need to review it.
3. Go to **Clients → Create client → Web application**. Under **Authorised JavaScript origins**, add:
   - `https://<github-username>.github.io` (from step 4; you can add it later)
   - `http://localhost:5173` (for trying it locally)
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

### 3. Deploy the backend

1. In the Apps Script editor, open **Project Settings → Script properties**. Add:
   - `GOOGLE_CLIENT_ID` = the client ID from step 2
   - `SITE_URL` = the site address from step 4, e.g. `https://kgp-indu.github.io/semvault/`
   - (`OWNER_EMAIL`, `SHEET_ID` and `ROOT_FOLDER_ID` were already filled in by `setup`.)
2. Click **Deploy → New deployment → ⚙ → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then Deploy.
3. Copy the **Web app URL** (ends in `/exec`).

### 4. Publish the site on GitHub Pages

1. Create a GitHub account using kgp.indu@gmail.com. The username becomes part of the web address.
2. Create a public repository called `semvault`, and push this folder to its `main` branch.
3. In the repo, go to **Settings → Pages → Source: GitHub Actions**. Every push to `main` runs the tests, then publishes `site/` to `https://<username>.github.io/semvault/`.
4. Fill in `site/js/config.js` and push:
   ```js
   export const API_URL = 'https://script.google.com/macros/s/…/exec';   // step 3
   export const GOOGLE_CLIENT_ID = '….apps.googleusercontent.com';       // step 2
   ```
5. Add the Pages address to the OAuth client's origins (step 2.3) and to `SITE_URL` (step 3.1) if you hadn't yet.

### 5. Check it works

On the live site:
- [ ] The home page loads. It's empty until you seed or approve something.
- [ ] Upload a small test PDF. It shows up in Drive under `Sem Vault/Pending` and as a `pending` row in the Sheet.
- [ ] Open **Mod panel** (link in the footer) and sign in with Google as kgp.indu@gmail.com. The test upload is in **Queue**.
- [ ] Approve it. Reload the course page: the item is there, and the file moved to `Live/<course code>/`.
- [ ] Open the same pending item in two tabs and approve in both. The second tab says *"Already reviewed by …"*.
- [ ] Add a mod in the **Mods** tab, then remove them. Their next click shows "This account is no longer a mod".
- [ ] To test the digest without waiting: upload something, then in the Apps Script editor run **`sendDigest`**. An email arrives.

---

## Loading a semester's folder (Sem 5 now, Sem 4 and others later)

You need Python 3. Run these from this folder.

1. **List the candidates:**
   ```powershell
   python seed/seed.py scan "C:\path\to\the semester folder" --out seed/candidates.csv
   ```
   - The scan skips code and build folders (`sim`, anything ending in `_src`, `__pycache__`, `backup…`, `bin`, `out`, figure folders, `.obsidian`, `_inbox`).
   - It lists PDFs, DOCX and PPTX files, pairs each PDF with a same-named `.tex`, and reads question paper filenames for course, year and exam.
   - Course codes come from `seed/courses.json` (folder → code). Add new folders and courses there.
2. **Trim the list.** Open `seed/candidates.csv` in Excel or Google Sheets. This step is what keeps the site from becoming an overwhelming dump:
   - Set `include` to `n` for anything a junior doesn't need: drafts, duplicates, project dumps, personal stuff.
   - Fix `course`, `type` (`notes`, `formula`, `pyq`, `lab`, `assignment`, `other`) and `title`.
   - Put `y` in `start_here` on the 3–5 things per course a junior should read first. Use `start_order` to set their order.
   - Save as CSV.
3. **Build the upload folder:**
   ```powershell
   python seed/seed.py build seed/candidates.csv --root "C:\path\to\the semester folder" --staging seed/staging
   ```
   When a `.tex` uses figures or other files, they're zipped together so the source still compiles.
4. **Import:** drag everything inside `seed/staging/` into Drive's **Sem Vault/Seed** folder. Then, in the Apps Script editor, run **`importSeed`**.
   - If it stops at the 6-minute limit, just run it again. Items that were already imported are skipped.
   - After that, empty the `Seed` folder.

For Sem 5, `seed/courses.json` already maps EE, QDC, QDC Lab, Simulation, Simulation Lab, SCM and HPSC. **`stochastic` has no course code yet.** Fill it in before building.

---

## Day to day

- **Mods** get the digest email when uploads are waiting. In the **Mod panel**:
  - **Queue**: fix the title or course and approve, or reject with a reason. Uploads for a course that isn't listed need **Add a new course…** first.
  - **Start here**: choose and order the first-read list for each course.
  - **Library**: edit or remove live files. Removed files go to `Rejected/` in Drive, so they can be recovered.
  - **Activity**: who did what, newest first.
- **Owner** (kgp.indu@gmail.com) also gets the **Mods** tab, for approving mod requests and adding or removing mods.
- The Sheet is the source of truth, and mods can fix things in it directly. **Don't edit the `Log` tab.**

## Handing over to the next batch

1. Give the next owner the password and recovery options for **kgp.indu@gmail.com**. Change the recovery phone and email to theirs.
2. Nothing else changes: same Drive, Sheet, script, GitHub account and web address.
3. They can review the mod list in the **Mods** tab.

If ownership ever has to move to a *different* Google account, transfer the Drive folder, then set `OWNER_EMAIL` in Script properties to the new address.

## Changing the code

- Tests: `npm test` (backend logic and site logic) and `python -m pytest seed` (seeding script).
- Try the site locally with `python -m http.server 5173 -d site`, then open <http://localhost:5173>.
  - With `API_URL` empty, it uses `site/dev/sample-catalog.json`.
  - To try the mod panel without a server, run `localStorage.setItem('semvault:mock','1')` in the browser console and reload. Sign in as `kgp.indu@gmail.com` (owner) or `mod@example.com` (mod).
- Backend change: `cd apps-script; npx @google/clasp push`. Then go to **Deploy → Manage deployments → ✎ → Version: New version → Deploy**. The URL stays the same.
- Site change: push to `main`.

## Limits worth knowing

- Files over **25 MB** are refused (Apps Script's request size limit). Split big PDFs or compress them.
- The free Gmail account has **15 GB** of Drive. Sem 5 is about 350 MB, so there's room for many batches.
- Mail: about 100 recipients a day. Two digests to even 10 mods is fine.
- At most 30 uploads an hour across everyone, to slow down spam.
- The public list is cached for up to 10 minutes. Mod actions clear the cache straight away.

## Troubleshooting

- **"Not authorised"** in the mod panel: that email isn't on the `Mods` tab. The owner adds it in the **Mods** tab.
- **Sign-in button missing:** `GOOGLE_CLIENT_ID` is empty in `config.js`, or the site's address isn't in the OAuth client's authorised origins.
- **"Please sign in again":** Google sign-ins last an hour. Sign in again.
- **Site says "Couldn't load the library":** check `API_URL` in `config.js`, and that the deployment's access is **Anyone**.
