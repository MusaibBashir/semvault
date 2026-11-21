# Sem Vault — design

*Working name. 2026-11-21.*

## Why

Each batch has a semester folder full of notes, formula sheets, Claude-generated PDFs, lab material and question papers. Sharing the raw folder on Drive overwhelms juniors. They don't know what to open, they don't ask for what they need, and the person sharing forgets what's in it. The goal is **ease of use**: a junior opens a course and sees the few things that matter first.

## Goals

1. A public website browsable by **semester → course**, where each course page shows **"Start here" picks chosen by mods** at the top and everything else below.
2. **Anyone can upload.** Uploads go to a pending queue and are not public until a mod approves them.
3. **Only allowlisted emails (mods) can approve or reject.**
4. **Twice-daily mail digest** (morning and night) to mods, sent **only if** there are uploads no mod has acted on yet.
5. A Claude-generated PDF carries its **source** (.tex, or a .zip when it has figures/includes) as a separate download, so someone can hand it to their AI agent instead of starting from scratch.
6. A **question paper archive** filterable by course, year, term (autumn/spring) and exam (midsem/endsem), across all semesters.
7. Seed it with the owner's **Sem 5** folder. Sem 4 and juniors' Sem 3 come in later the same way.

## Non-goals

- Other departments: this is for one department (Industrial & Systems Engineering, IM) only. No department level in navigation.

- Programming/project work (e.g. `Simulation/`, `sim`, `*_src` code, build output, `__pycache__`, `.obsidian`, backups like `backup_pre_restyle/`).
- Comments, ratings, forums, uploader accounts or profiles.
- Editing documents on the site.

## Anti-goals (failure even if it "works")

- Becoming another overwhelming dump: no auto-importing whole folders without curation.
- Costing money, or needing anyone's credit card.
- Depending on one person who will graduate. Ownership must be passable to the next batch's mods.

## Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| **Google Drive + Apps Script + static site** | Free, large storage, everyone already has a Google (kgpian) account, mails are built in. Script responses are a bit slow (~1–2 s). | **Chosen** |
| Supabase / Firebase / Cloudflare R2 / AWS / GCP | Faster and more "app-like", but free tiers are small or time-limited and need a credit card. Billing risk and handover problem when the owner graduates. | Rejected |
| GitHub repo, uploads as PRs | Free, but uploaders and mods would need GitHub and git. Kills ease of use. | Rejected |

Email via a third-party OTP/email service was also rejected: Apps Script's `MailApp` is free and needs no keys. Mod login is Google sign-in, not OTP.

## How it works (decided)

### Storage — Google Drive + a Google Sheet

- A root Drive folder owned by a **dedicated mod account** (passed down batch to batch), with subfolders `Pending/`, `Live/<CourseCode>/`, `Rejected/`.
- A Google Sheet is the **catalog** (one row per item) plus a `Mods` tab listing allowed emails and a `Courses` tab (semester, course code, course name, short name).
  - Catalog columns: id, semester, course code, type, title, description, file id, source file id (optional), year, term, exam, uploader name (optional), uploader email (optional), uploaded at, status (pending/approved/rejected), start-here (yes/no), start-here order, reviewed by, reviewed at, reject reason.
  - Mods can also fix things straight in the Sheet. That is a feature, not a hack.
- Item types: **Start-here-able notes / Formula sheet / Question paper (with or without solutions) / Lab / Assignment / Other**.

### Public site — static, on GitHub Pages

- Home: pick a semester, then courses as cards.
- Course page: **Start here** strip (mod-picked, ordered), then the rest grouped by type, collapsed by default.
- Each item: title, type, a preview link (Drive viewer, works on phones), **Download PDF**, and when a source exists, **Download source (.tex/.zip)** with a one-line hint: "give this to your AI agent to modify the PDF".
- **PYQ archive** page: one table of all question papers across semesters, filterable by course, year, term and exam.
- Search across titles and courses, client-side.
- Catalog data comes from an Apps Script endpoint returning approved items as JSON, cached so the site isn't slow.

### Upload — public form on the site

- Fields: semester, course (picked from `Courses`; "other" allowed), type, title, the file (PDF or other), optional source file, and for question papers year/term/exam. A question paper filename in the common KGP format (`<id>_<CODE>_<NAME>_<year>_<term>_<exam>.pdf`) **pre-fills** those fields. Optional name/email.
- On submit, files go into `Pending/` and a catalog row is added with status `pending`. The uploader sees "Thanks, a mod will review it."
- Per-file size cap around 25 MB (Apps Script request limits).

### Mod panel — Apps Script web page

- Accessible only to Google accounts listed in the `Mods` tab; everyone else gets "not authorised".
- Shows the pending queue: preview, edit metadata, **Approve** (moves files to `Live/<CourseCode>/`, status → approved) or **Reject** (with reason; files moved to `Rejected/`).
- Manage **Start here** for each course: toggle and reorder.
- Edit or remove live items.

### Mail digest

- Time triggers around **8 am and 9 pm IST**.
- If any item is still `pending`, send **one** email to all mods: count, a list of titles/courses/upload times, and a link to the mod panel. If nothing is pending, send nothing.

### Seeding Sem 5

- A local script scans the owner's Sem 5 folder, **skips excluded areas** (see Non-goals), pairs each PDF with a same-named `.tex` in the same folder (zipping the folder's tex + figures when the .tex includes other files), and auto-parses question paper filenames.
- It writes a **candidate list (CSV)** that the owner reviews and trims first. Only the approved rows are uploaded, already approved, with suggested Start-here picks for the owner to confirm.
- The same script is reused later for Sem 4 and others' folders.

## Constraints

- Free forever, with no card anywhere.
- Must hold up on phones (most juniors will open it on mobile).
- Apps Script quotas: mail around 100 recipients/day on a Gmail account (enough for 2 digests × a handful of mods). Script runtime about 6 min per call.
- If the owning account is a plain Gmail, Apps Script can't see the email of a visitor from another account when running as the owner. The mod panel must be deployed so it can verify the visitor's identity. One way is to run it as the visiting user, with mods given edit access to the root folder and Sheet. That conveniently makes "mod" = "has edit access + is on the list".

## Roles and accounts (decided)

- **Owner ("god") account:** one new dedicated Gmail account owns everything: the Drive folder, the Sheet, the Apps Script and the GitHub account. It is passed down batch to batch. Only the owner can add or remove mods.
- **Mods:** any Google account the owner has approved. Mods approve or reject uploads and manage Start-here picks. They cannot change the mod list.
- **Becoming a mod** *(my call)*: a signed-in visitor can click "Request to be a mod" in the panel. The owner sees pending requests in an **Owner** tab and approves or declines them. The owner can also add an email directly.
- **Who did what is visible to mods:** every approved/rejected item shows *reviewed by <email> at <time>* in the panel. An **Activity** view lists recent actions (approve, reject, Start-here changes, edits, removals, mod added or removed), backed by an append-only `Log` tab in the Sheet.

## Calls made during review (owner to confirm)

- **A course is identified by its course code**, not by semester + code. Semester is a browsing label (the semester it is usually taught). All batches' uploads for IM31005 land on one QDC page, with one Start-here list. The folder layout is `Live/<CourseCode>/`.
- **The GitHub Pages site lives on a GitHub account tied to the dedicated mod Gmail account**, so the URL survives handover along with everything else.

## Left to the builder

- Exact Apps Script deployment layout (one or two web-app deployments), caching strategy, how files travel from the static site to Apps Script (e.g. base64 POST).
- Visual design and front-end framework (keep it light: plain HTML/JS or a small static build).
- Spam/abuse mitigation beyond moderation (e.g. simple rate limit, honeypot field).
- Folder naming details and id format.
- How the seeding script authenticates to Drive.
