# Security

What protects the parking app, and what to keep doing.

## Built in

| Area | Protection |
|---|---|
| **Who can see data** | Only *approved staff*. Every table checks `is_staff()` in the database (row-level security), so even someone who makes their own account, or uses the public key, sees and changes nothing. New accounts wait in **account menu → Staff** until approved. |
| **Stay history** | Read-only. Rows are written by the database itself; nobody can edit, fake or delete them. The only change allowed is unpaid → paid, through `mark_change_paid`. Who created a record, and when, can't be rewritten. |
| **Guest check-in form** | Can only call one function. Needs the secret code from the QR sign (32 random characters; **Make new code** replaces it). Limits: 6 tries per phone per 10 minutes and 40 overall per 10 minutes, length limits, plate = letters/numbers only, hidden characters removed, double submits don't duplicate, a reservation is only linked when confirmation # **and** last name match. |
| **Links and code injection** | Everything people type is shown as plain text (never as a link or code). Spreadsheet formulas typed into any field (`=HYPERLINK(...)` etc.) are neutralized in CSV downloads and in the Google Sheet. All links in the app (directions, Google Sheets) are fixed in the code. |
| **The website itself** | Content Security Policy (the page only loads code from itself, Supabase and Google Fonts), can't be shown inside another site (click-jacking), `nosniff`, HTTPS only, no referrer (the QR code's secret never leaks to other sites), hidden from search engines. |
| **Settings** | The QR code can only be changed with the **Make new code** button; the backup can only point at a Google Apps Script web app. |
| **Database functions** | Privileged functions use a locked search path and only run for the right people. |
| **Backup** | The Google Sheet script ignores anything without its secret key and never deletes rows. A backup problem never blocks saving. |

## Keep doing (things code can't do for you)

1. **Turn on 2-step verification** for the Google, GitHub, Vercel and Supabase accounts. Whoever controls those controls the website.
2. In Supabase: **Authentication → Sign In / Providers**: keep *Allow new users to sign up* **off**, and set a minimum password length of at least 10.
3. Only approve staff you know; remove people who leave (**account menu → Staff**).
4. Never share or commit the Supabase `service_role` key. The app only uses the public (anon) key, which is safe because of the rules above.
5. If the QR sign is misused, press **Make new code** and print the new sign.
6. Download a backup file about once a month (**account menu → Backup**).

## Known, accepted

- `npm audit` reports PostCSS advisories inside Next.js 15's own build tools. They affect processing untrusted CSS files at build time, which this app never does; they are fixed in Next.js 16 (a larger upgrade).
