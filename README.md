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
- **Find an old record:** **History** > search by name or plate. **Download CSV** gives a spreadsheet.

Tip: on a tablet or phone, open the link and use "Add to Home Screen" so it opens like an app.

## Updates

If you set up the database before an update was released, run the matching file once in the Supabase SQL Editor:

- `supabase/update-2-confirmation-number.sql`: adds the Confirmation # field and faster customer look-up.
- `supabase/update-3-stay-history.sql`: adds **Update stay** and the **Stay history** log (extensions, payments, notes).

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
