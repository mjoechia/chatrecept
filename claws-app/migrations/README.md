# claws-app migrations

SQL files applied **manually** against the production Supabase database. There's no automated runner — every new migration is paste-into-the-Supabase-SQL-Editor work, and skipping one shows up as a runtime PostgREST error like:

```
Could not find the 'whatsapp_number' column of 'users' in the schema cache
```

## How to apply a migration

1. **Open Supabase** → your project → **SQL Editor** → **New query**.
2. **Paste** the full contents of every migration newer than what's already applied. Each migration is idempotent (`add column if not exists`, `create table if not exists`), so re-running an already-applied one is a no-op.
3. **Append the schema-cache refresh** so PostgREST sees the new shape immediately instead of waiting ~30 s:

   ```sql
   notify pgrst, 'reload schema';
   ```

4. **Run.**

## How to check which migrations are applied

Run this in the SQL Editor to inventory the `app_claws.users` columns:

```sql
select column_name
from information_schema.columns
where table_schema = 'app_claws' and table_name = 'users'
order by ordinal_position;
```

Compare against what each migration adds:

| Migration | Adds (table or columns) |
|---|---|
| 001 | `app_claws.users` (base table) + `spend_today_sgd`, `spend_day`, `mapping_enabled` |
| 002 | `tier`, `trial_ends_at`, `daily_map_count`, `daily_map_day` (drops `mapping_enabled`) |
| 003 | `welcome_sent_at` |
| 004 | `whatsapp_number` |
| 005 | `app_claws.demo_lookups` (new table) |
| 006 | `spend_month_sgd`, `spend_month` |

If a column is missing from `information_schema`, the corresponding migration hasn't been applied — apply it now.

## When you ship a new migration

After adding a new `.sql` file in this directory:

1. Push the code change (the migration file goes to git for future reference).
2. **Immediately** run the new migration in Supabase SQL Editor — before the deployed code that depends on it takes traffic.
3. Confirm with the `information_schema` query above.

Forgetting step 2 is the most common cause of `schema cache` errors in production.

## Convention

- Files are `NNN_short_description.sql` where NNN is zero-padded sequential.
- Each file uses `if not exists` / `if exists` clauses so it can be safely re-run.
- One concern per migration where possible — keeps rollback granular.
- Comments at the top explain *why* the change is being made, not just *what* (the SQL says what).
