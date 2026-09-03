# Department of Microbiology, CBNU — website

Bilingual (KO/EN) static site for the Department of Microbiology at Chungbuk
National University, with an online **seminar room reservation** system for
graduate students.

Live at: `https://tatsu1207.github.io/dept_mbio_cbnu/` (after step 2 below)

---

## How it works

The site is plain HTML + [Tailwind](https://tailwindcss.com) (CDN) + vanilla JS,
so GitHub Pages can serve it with no build step. Content lives in `data/*.json`,
not in the markup.

Reservations need somewhere to **write** data, which GitHub Pages cannot do. A
Google Apps Script web app takes that role and stores each booking as a row in a
Google Sheet you own:

```
browser (reserve.html)  ──GET  ?action=list──▶  Apps Script  ──▶  Google Sheet
                        ──POST create/cancel─▶   /exec
```

No accounts, no API keys in the repo, no monthly bill. The office manages
bookings by opening the spreadsheet.

---

## Setup

### 1. Run it locally

The pages fetch `partials/` and `data/` over HTTP, so opening `index.html` by
double-clicking will not work. Serve the folder instead:

```sh
cd dept_mbio_cbnu
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Until you finish step 3, the booking page runs in **demo mode**: reservations are
saved in your own browser only, so you can click through the whole flow.

### 2. Publish on GitHub Pages

```sh
git add -A
git commit -m "Initial department website"
git push -u origin main
```

Then on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
branch → Branch: `main` / `/ (root)` → Save.** The site appears at
`https://tatsu1207.github.io/dept_mbio_cbnu/` within a minute or two.

### 3. Turn on real reservations

1. Create a new Google Sheet (call it e.g. *Seminar Room Reservations*).
2. In that sheet: **Extensions → Apps Script**.
3. Delete the placeholder code, paste in all of [`apps-script/Code.gs`](apps-script/Code.gs), and save.
4. Run the `setup` function once (select it in the toolbar, press **Run**) and
   approve the permission prompt. A `Reservations` tab appears in the sheet.
5. **Deploy → New deployment → Type: Web app**, with:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
6. Copy the Web app URL (ends in `/exec`).
7. Paste it into [`assets/js/config.js`](assets/js/config.js):

   ```js
   endpoint: 'https://script.google.com/macros/s/AKfy..../exec',
   ```

8. Commit and push. The booking page is now live and shared.

> After editing `Code.gs` later, you must **Deploy → Manage deployments → Edit →
> Version: New version** for the change to take effect. The `/exec` URL stays the same.

### 4. Make it yours

| What | Where |
|---|---|
| Room name, hours, max booking length, days ahead | `assets/js/config.js` |
| Faculty directory | `data/faculty.json` |
| News and notices | `data/news.json` |
| Course list | `data/courses.json` |
| Research areas | `data/research.json` |
| Greeting, goals, statistics | `about.html` |
| Address, phone, map pin | `contact.html`, `partials/footer.html` |
| Menu items | `partials/nav.html` |
| Colours | `:root` in `assets/css/style.css` |

Every visible string carries `data-ko` and `data-en` attributes; edit both and the
language toggle keeps working. In JSON, bilingual fields are `{ "ko": …, "en": … }`.

Faculty photos: drop them in `assets/img/` and set `"photo": "./assets/img/name.jpg"`.
Leave it empty and the card shows initials instead.

---

## Booking rules

Enforced in the browser *and* re-checked in Apps Script, so a stale page cannot
double-book:

- 08:00–22:00, 30-minute granularity, 6 hours maximum per booking
- Up to 90 days ahead, no past dates
- Overlapping bookings are rejected (`LockService` serialises writes)
- Name and lab/advisor are required
- Cancelling needs the 4-digit PIN chosen at booking time

Change the first four in **both** `assets/js/config.js` and the constants at the
top of `apps-script/Code.gs`.

The PIN is a courtesy lock, not security: anyone with the link can book, and the
office can delete any row directly in the sheet. That matches "open, name + lab
required". If you later need stricter control, the natural next step is a shared
department passcode checked in `doPost`.

---

## Layout

```
index.html          Home — hero, news, upcoming bookings
reserve.html        Seminar room calendar + booking form
about.html          Greeting, goals
faculty.html        Searchable, filterable directory
research.html       Research areas
courses.html        Undergraduate / graduate tabs
news.html           All notices
contact.html        Address and map
partials/           Shared header and footer, injected by JS
assets/css/         Theme tokens and components
assets/js/          config.js · main.js (i18n, partials) · pages.js · reserve.js
data/               Editable content
apps-script/Code.gs Backend to paste into Google Apps Script
```

## License

MIT
