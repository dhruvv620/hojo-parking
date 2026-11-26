# Google Sheet backup script

`Code.gs` is the script that goes into your Google Sheet (Extensions > Apps Script).

**Easiest:** in the app, open the account menu > **Backup** and press **Copy script**. That copy already has your key filled in.

**Or use this file:**

1. Get your backup key: in Supabase, open **SQL Editor** and run

   ```sql
   select value from app_settings where key = 'backup_key';
   ```

   (If it says the table or row doesn't exist, run `supabase/update-7-sheet-backup.sql` first.)
2. Open `Code.gs`, copy all of it, and paste it into Apps Script, replacing everything there.
3. On the line `const KEY = "PASTE-YOUR-BACKUP-KEY-HERE";` replace `PASTE-YOUR-BACKUP-KEY-HERE` with your key (keep the quotes).
4. Save, then continue with step 3 on the app's Backup page (Deploy > New deployment > Web app).

Do not copy `src/lib/backupScript.ts`: that is the app's code that *builds* this script, and Apps Script can't run it.
