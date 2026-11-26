# HoJo Parking Manager

A simple parking lot manager for Howard Johnson. It tracks every car in the fenced lot (67 spots), cars parked outside the fence, and upcoming reservations, and checks cars out automatically when their paid time is up.

## How it works

| Rule | What happens |
|---|---|
| **67 inside spots** | Only cars *inside the fence* count. At 67 the app shows **LOT FULL**. |
| **Lot full** | New cars are not blocked. They are saved as **Outside the fence**. |
| **Check-out time** | Arrival time + (days paid x 24 hours). Worked out for you. |
| **Auto check-out** | When the paid time ends, the car moves to History and its spot frees up (67 becomes 66). Nobody has to press anything. |
| **Future reservations** | Show in **Upcoming reservations**. They take no spot until staff press **Arrived**, and the paid days start counting then. |
| **Car still there after time is up?** | It shows under **Checked out (last 24 hrs)**. Press **Extend** to put it back. |
| **Editing** | Name, plate, make, model, color, phone, room, dates, days and location can all be changed. |
| **Login** | Only staff with an account can open the app. |

The database also enforces the 67 limit, so two desks can't both take the last spot at the same moment.

---

## One-time setup (about 15 minutes)

### 1. Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project**. Any name works (e.g. `hojo-parking`). Pick a strong database password and the region closest to the hotel.
2. When it's ready, open **SQL Editor** > **New query**.
3. Copy everything in [`supabase/schema.sql`](supabase/schema.sql), paste it in, and click **Run**. You should see "Success".

### 2. Turn off public sign-ups

So that only people you add can log in:

1. **Authentication** > **Sign In / Providers** (called **Providers** in some versions).
2. Turn **off** "Allow new users to sign up". Keep the **Email** provider turned on.

### 3. Add staff logins

1. **Authentication** > **Users** > **Add user** > **Create new user**.
2. Enter the staff member's email and a password, and tick **Auto Confirm User**.
3. Repeat for each person. To remove someone later, delete them here.

### 4. Get the two keys

Go to **Project Settings** > **API** (or click **Connect** at the top) and copy:
- **Project URL**, e.g. `https://abcdefgh.supabase.co`
- **anon / public key** (sometimes called the **publishable** key)

Never use the `service_role` / secret key in this app.

### 5. Put it online (Vercel)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Add New** > **Project** > import the `hojo-parking` repo.
3. Open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon / publishable key
4. Click **Deploy**. After a minute or two you'll get a link like `hojo-parking.vercel.app`. That's the app.

Open the link, log in with a user from step 3, and you're ready.

---

## Daily use

- **Guest arrives (walk-in or online):** **+ Add Car** > Arriving now > start typing the name, plate or confirmation number. If they've been here before, click them in the pop-up and their car details fill in. If they have a reservation waiting, click **Open & check in**. Otherwise fill in the details > pick days > **Check in car**. Tell them to park inside the fence and tick the box.
- **Booking for a later date:** **+ Add Car** > Future reservation > pick the date. On the day, press **Arrived** on the dashboard.
- **Guest extends (or shortens) their stay:** open the car (or use **⋯** on the dashboard) > **Update stay**. Pick the new check-out date, choose **Paid / Not paid yet / No charge**, add the amount and a note. It all shows in the car's **Stay history**, with who made the change and when. Unpaid changes show an amber badge until someone presses **Mark paid**.
- **Guest leaves early:** open the car (or use the table) > **Check out now**.
- **Space opens up for a car parked outside:** press **Move inside** in the table.
- **Lots:** **Lot 1** (fenced lot on E Melvin St) is for cars & SUVs and is the only lot that counts toward the 67. **Lot 2** (401 N 41st St) is for trucks. **Lot 3** (along E Melvin St, behind the hotel building) takes any vehicle. **Hotel Lot** is at the hotel (4120 E Van Buren St). When adding a car, pick Car / SUV / Truck and the app suggests the lot (trucks to Lot 2; cars & SUVs to Lot 1, or Lot 3 when Lot 1 is full). Staff can always change it.
- **Directions for guests:** the check-in form and the "You're all set" screen have a **Directions to Lot X** button (Google Maps, or Apple Maps). Each lot's destination is the `nav` value in `src/lib/lots.ts`: either a Google Maps share link of the pinned lot (`{ link: "https://maps.app.goo.gl/..." }`) or an address (`{ address: "..." }`).
- **Guest self check-in:** open **Guest QR** in the top menu, press **Print sign** and put it at the front desk. Guests scan it with their phone, pick Car / SUV / Truck, see where to park, fill in their details and submit. The car appears on the dashboard straight away (marked **Self check-in**). If the QR code is ever misused, press **Make new code** and print the new sign; the old one stops working.
- **Mark where a car is parked (optional):** on Add Car or a car's page, use **Spot on the map** on the right: pick the lot tab, then tap where the car is. To change a lot's picture, replace its file in `public/maps/` (same framing) and update its width/height in `src/lib/lots.ts`.
- **Find an old record:** **History** > search by name or plate. **Download CSV** gives a spreadsheet.

Tip: on a tablet or phone, open the link and use "Add to Home Screen" so it opens like an app.

## Backup

Open the account menu (top right) → **Backup**:

- **Google Sheet backup:** follow the 5 steps on that page once. After that, every check-in, edit, extension and check-out is copied to your Google Sheet within seconds (tabs **Cars** and **Stay history**). Deleted cars stay in the sheet with a "Deleted at" time. **Send everything now** rewrites the sheet with a fresh full copy.
- **Download a backup file:** **All cars (.csv)** opens in Excel; **Everything (.json)** includes the full Stay history. Save one on a computer or USB drive about once a month.
- If the sheet is ever unreachable, the app keeps working normally; it just won't copy that change. Press **Send everything now** later to catch up.

## Updates

If you set up the database before an update was released, run the matching file once in the Supabase SQL Editor:

- `supabase/update-2-confirmation-number.sql`: adds the Confirmation # field and faster customer look-up.
- `supabase/update-3-stay-history.sql`: adds **Update stay** and the **Stay history** log (extensions, payments, notes).
- `supabase/update-4-map-pin.sql`: adds the optional **Spot on the map** pin (run update 3 first).
- `supabase/update-5-map-areas.sql`: lets the pin be on any of the three parking areas.
- `supabase/update-6-lots-and-guest-form.sql`: Lot 1 / Lot 2 / Lot 3 / Hotel Lot, vehicle type, and the guest QR check-in form.
- `supabase/update-7-sheet-backup.sql`: automatic backup to a Google Sheet.
- `supabase/update-8-security.sql`: security hardening: only approved staff can see data, tamper-proof Stay history, guest form limits. See [SECURITY.md](SECURITY.md).

## Changing the lot size

If the lot ever holds a different number of cars, change `67` in both:
- `supabase/schema.sql` (the `lot_capacity` function; run that part again in the SQL Editor)
- `src/lib/config.ts`

## For developers

```bash
cp .env.example .env.local   # fill in the two values
npm install
npm run dev                  # http://localhost:3000
```

Built with Next.js 15, Tailwind CSS 4 and Supabase (Postgres, Auth, Realtime).
