# Anonymous Graduate Voice

A private, anonymous space where graduates can discuss the delayed certificates, vote on
issues and polls, and produce one clear report for the administration.

- **Chat**: live group chat with replies, report button, moderator hiding and slow mode.
- **Issues**: post specific issues and upvote the ones that affect you.
- **Polls**: settle different views with a vote. Results show after you vote.
- **Report** (`/report`): a printable summary of the top issues and poll results. Save it as a PDF.
- **Moderate**: moderators only. Review reports, set slow mode, rotate the access code, see the log.

No names, emails or phone numbers are ever stored. See `/privacy` in the app.

## Setup (about 15 minutes)

### 1. Create the Supabase project
1. Create a free project at https://supabase.com.
2. **Authentication → Sign In / Providers**: turn on **Allow anonymous sign-ins**.
3. **SQL Editor**: paste the whole of `supabase/schema.sql` and run it once.
4. Still in the SQL editor, set the first class access code (choose your own, at least 6 characters):

   ```sql
   update private.settings
   set access_code_hash = extensions.crypt(upper('CLASS2026'), extensions.gen_salt('bf'))
   where id = 1;
   ```

   Codes are not case-sensitive.

### 2. Run it on your computer
```powershell
copy .env.example .env.local   # then fill in the URL and publishable key
npm install
npm run dev
```
Open http://localhost:3000 and join with the code.

### 3. Make yourself (and other trusted people) moderators
Each moderator joins the app first and tells you their nickname. Then, in the SQL editor:

```sql
update public.sessions set is_moderator = true where nickname = 'Graduate 47';
```

They will see the **Moderate** tab after a refresh.

### 4. Deploy to Vercel
1. Push this folder to a GitHub repository.
2. Import it in Vercel and add the two `NEXT_PUBLIC_SUPABASE_*` variables.
3. Share the link and the access code in the class WhatsApp group.

## If the code leaks
Use **Moderate → Rotate access code**. Everyone else is locked out until they enter the new
code, and they keep their nicknames.

## How the security works
- Each device signs in as a Supabase *anonymous user*. No identity data is stored.
- Joining checks the access code inside the database (`join_class`). The code is stored only as a bcrypt hash.
- Votes, polls, issues and reports can only be read or written through database functions,
  so nobody, moderators included, can see who voted for what in the app.
- Chat messages use row-level security, so only members with the current code can read or post them.
  Hidden messages have their text removed from the public table and kept in a private table that only moderators can read.
- Rate limits: slow mode for chat (10 s by default), 5 issues per hour and 3 polls per hour per person.

## Known limits
- One person can join from several browsers and vote more than once. The report says that
  counts are per device. If this becomes a problem, switch to single-use codes handed out blindly.
- The hosting providers keep their own technical logs, which may include IP addresses.
