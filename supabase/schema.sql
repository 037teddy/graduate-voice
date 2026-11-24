-- =====================================================================
-- Anonymous Graduate Voice: database schema
-- Run this once in the Supabase SQL editor of a NEW project.
--
-- Design rules:
--   * No names, emails or phone numbers are stored anywhere.
--   * Each device signs in with a Supabase *anonymous* user (auth.uid()).
--   * Joining requires the class access code (checked in the database).
--   * Rotating the code bumps an "epoch" and locks out every old session
--     until it re-enters the new code.
--   * Almost every read/write goes through security-definer functions,
--     so the browser can never see who voted for what.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------
-- Private settings (not reachable through the API)
-- ---------------------------------------------------------------------
create table private.settings (
  id                int primary key default 1 check (id = 1),
  access_code_hash  text,
  code_epoch        int not null default 1,
  slow_mode_seconds int not null default 10 check (slow_mode_seconds between 0 and 600)
);
insert into private.settings (id) values (1);

-- ---------------------------------------------------------------------
-- Sessions: one row per anonymous device
-- ---------------------------------------------------------------------
create table public.sessions (
  id           uuid primary key references auth.users (id) on delete cascade,
  nickname     text not null unique,
  is_moderator boolean not null default false,
  code_epoch   int not null,
  created_at   timestamptz not null default now()
);
alter table public.sessions enable row level security;
create policy "read own session" on public.sessions
  for select to authenticated using (id = auth.uid());

-- Helper checks used by policies and functions
create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s, private.settings c
    where s.id = auth.uid() and c.id = 1 and s.code_epoch = c.code_epoch
  );
$$;

create function private.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s, private.settings c
    where s.id = auth.uid() and c.id = 1 and s.code_epoch = c.code_epoch and s.is_moderator
  );
$$;

create function private.my_nickname() returns text
language sql stable security definer set search_path = '' as $$
  select nickname from public.sessions where id = auth.uid();
$$;

grant execute on function private.is_member(), private.is_moderator(), private.my_nickname() to authenticated;

-- ---------------------------------------------------------------------
-- Chat messages (read directly + realtime; insert directly)
-- ---------------------------------------------------------------------
create table public.messages (
  id                  bigint generated always as identity primary key,
  session_id          uuid not null default auth.uid() references public.sessions (id) on delete cascade,
  nickname            text not null default '',
  author_is_moderator boolean not null default false,
  body                text not null check (char_length(body) <= 1000),
  reply_to            bigint references public.messages (id) on delete set null,
  is_hidden           boolean not null default false,
  hidden_reason       text,
  created_at          timestamptz not null default now()
);
create index messages_created_at_idx on public.messages (created_at desc);
create index messages_session_idx on public.messages (session_id, created_at desc);

alter table public.messages enable row level security;
create policy "members read messages" on public.messages
  for select to authenticated using (private.is_member());
create policy "members post messages" on public.messages
  for insert to authenticated with check (private.is_member() and session_id = auth.uid());

-- Original text of hidden messages, visible to moderators only
create table private.hidden_bodies (
  message_id bigint primary key references public.messages (id) on delete cascade,
  body       text not null
);

-- Moderation log (moderators can read it, keeps moderators accountable)
create table private.mod_actions (
  id         bigint generated always as identity primary key,
  moderator  text not null,
  action     text not null,
  target     text not null,
  reason     text,
  created_at timestamptz not null default now()
);

create function private.before_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me      public.sessions;
  wait_s  int;
  last_at timestamptz;
begin
  select * into me from public.sessions where id = auth.uid();
  if not found then
    raise exception 'Join the class first.';
  end if;

  new.session_id          := me.id;
  new.nickname            := me.nickname;
  new.author_is_moderator := me.is_moderator;
  new.body                := btrim(new.body);
  new.is_hidden           := false;
  new.hidden_reason       := null;
  new.created_at          := now();

  if char_length(new.body) = 0 then
    raise exception 'Message is empty.';
  end if;

  select slow_mode_seconds into wait_s from private.settings where id = 1;
  if wait_s > 0 and not me.is_moderator then
    select max(created_at) into last_at from public.messages where session_id = me.id;
    if last_at is not null and now() - last_at < make_interval(secs => wait_s) then
      raise exception 'Slow mode is on: please wait % seconds between messages.', wait_s;
    end if;
  end if;

  return new;
end $$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function private.before_message_insert();

-- ---------------------------------------------------------------------
-- Reports on chat messages (function access only)
-- ---------------------------------------------------------------------
create table public.reports (
  id         bigint generated always as identity primary key,
  message_id bigint not null references public.messages (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  reason     text not null check (char_length(reason) between 1 and 300),
  resolved   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (message_id, session_id)
);
alter table public.reports enable row level security;

-- ---------------------------------------------------------------------
-- Feedback board (function access only)
-- ---------------------------------------------------------------------
create table public.issues (
  id                bigint generated always as identity primary key,
  session_id        uuid not null references public.sessions (id) on delete cascade,
  nickname          text not null,
  title             text not null check (char_length(title) between 3 and 120),
  description       text not null default '' check (char_length(description) <= 2000),
  source_message_id bigint references public.messages (id) on delete set null,
  status            text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  is_hidden         boolean not null default false,
  created_at        timestamptz not null default now()
);
alter table public.issues enable row level security;

create table public.issue_votes (
  issue_id   bigint not null references public.issues (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (issue_id, session_id)
);
alter table public.issue_votes enable row level security;

-- ---------------------------------------------------------------------
-- Polls (function access only)
-- ---------------------------------------------------------------------
create table public.polls (
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  nickname   text not null,
  question   text not null check (char_length(question) between 5 and 200),
  is_closed  boolean not null default false,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.polls enable row level security;

create table public.poll_options (
  id       bigint generated always as identity primary key,
  poll_id  bigint not null references public.polls (id) on delete cascade,
  label    text not null check (char_length(label) between 1 and 100),
  position int not null
);
alter table public.poll_options enable row level security;

create table public.poll_votes (
  poll_id    bigint not null references public.polls (id) on delete cascade,
  option_id  bigint not null references public.poll_options (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, session_id)
);
alter table public.poll_votes enable row level security;

-- =====================================================================
-- Functions callable from the app (supabase.rpc(...))
-- =====================================================================

-- Join (or re-join after a code change) with the class access code
create function public.join_class(code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cfg      private.settings;
  me       public.sessions;
  uid      uuid := auth.uid();
  n        int;
  attempts int := 0;
begin
  if uid is null then
    raise exception 'Not signed in.';
  end if;

  select * into cfg from private.settings where id = 1;
  if cfg.access_code_hash is null then
    raise exception 'The access code has not been set up yet.';
  end if;
  if extensions.crypt(upper(btrim(code)), cfg.access_code_hash) <> cfg.access_code_hash then
    perform pg_sleep(1); -- slow down guessing
    raise exception 'That access code is not correct.';
  end if;

  select * into me from public.sessions where id = uid;
  if found then
    update public.sessions set code_epoch = cfg.code_epoch where id = uid returning * into me;
  else
    loop
      attempts := attempts + 1;
      n := 1 + floor(random() * (case when attempts <= 20 then 999 else 99999 end))::int;
      begin
        insert into public.sessions (id, nickname, code_epoch)
        values (uid, 'Graduate ' || n, cfg.code_epoch)
        returning * into me;
        exit;
      exception when unique_violation then
        if attempts > 60 then
          raise exception 'Could not assign a nickname, please try again.';
        end if;
      end;
    end loop;
  end if;

  return jsonb_build_object('nickname', me.nickname, 'is_moderator', me.is_moderator, 'active', true);
end $$;

-- Who am I? Returns null if this device never joined.
create function public.my_session() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when s.id is null then null else jsonb_build_object(
    'nickname', s.nickname,
    'is_moderator', s.is_moderator,
    'active', s.code_epoch = c.code_epoch
  ) end
  from private.settings c
  left join public.sessions s on s.id = auth.uid()
  where c.id = 1;
$$;

-- ---------------- Chat moderation ----------------
create function public.report_message(p_message_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member() then raise exception 'Join the class first.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'Please give a short reason.'; end if;
  insert into public.reports (message_id, session_id, reason)
  values (p_message_id, auth.uid(), left(btrim(p_reason), 300))
  on conflict (message_id, session_id) do nothing;
end $$;

create function public.moderate_message(p_message_id bigint, p_hide boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
begin
  if not private.is_moderator() then raise exception 'Moderators only.'; end if;
  select * into m from public.messages where id = p_message_id for update;
  if not found then raise exception 'Message not found.'; end if;

  if p_hide and not m.is_hidden then
    insert into private.hidden_bodies (message_id, body) values (m.id, m.body)
    on conflict (message_id) do update set body = excluded.body;
    update public.messages
      set body = '', is_hidden = true, hidden_reason = nullif(btrim(coalesce(p_reason, '')), '')
      where id = m.id;
  elsif not p_hide and m.is_hidden then
    update public.messages
      set body = coalesce((select h.body from private.hidden_bodies h where h.message_id = m.id), ''),
          is_hidden = false, hidden_reason = null
      where id = m.id;
    delete from private.hidden_bodies where message_id = m.id;
  end if;

  update public.reports set resolved = true where message_id = m.id;
  insert into private.mod_actions (moderator, action, target, reason)
  values (private.my_nickname(), case when p_hide then 'hide' else 'unhide' end, 'message #' || m.id, p_reason);
end $$;

create function public.dismiss_reports(p_message_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_moderator() then raise exception 'Moderators only.'; end if;
  update public.reports set resolved = true where message_id = p_message_id;
  insert into private.mod_actions (moderator, action, target)
  values (private.my_nickname(), 'dismiss reports', 'message #' || p_message_id);
end $$;

create function public.get_hidden_body(p_message_id bigint) returns text
language sql stable security definer set search_path = '' as $$
  select h.body from private.hidden_bodies h
  where h.message_id = p_message_id and private.is_moderator();
$$;

create function public.get_mod_queue() returns table (
  message_id bigint, nickname text, body text, is_hidden boolean, hidden_reason text,
  report_count bigint, reasons text[], last_reported_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.nickname,
         case when m.is_hidden then coalesce(h.body, '') else m.body end,
         m.is_hidden, m.hidden_reason,
         count(r.id), array_agg(r.reason order by r.created_at), max(r.created_at)
  from public.reports r
  join public.messages m on m.id = r.message_id
  left join private.hidden_bodies h on h.message_id = m.id
  where private.is_moderator() and not r.resolved
  group by m.id, h.body
  order by max(r.created_at) desc;
$$;

create function public.get_mod_log() returns table (
  moderator text, action text, target text, reason text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select a.moderator, a.action, a.target, a.reason, a.created_at
  from private.mod_actions a
  where private.is_moderator()
  order by a.created_at desc
  limit 100;
$$;

-- ---------------- Settings (moderators) ----------------
create function public.get_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('slow_mode_seconds', c.slow_mode_seconds, 'code_epoch', c.code_epoch)
  from private.settings c where c.id = 1 and private.is_moderator();
$$;

create function public.set_slow_mode(p_seconds int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_moderator() then raise exception 'Moderators only.'; end if;
  update private.settings set slow_mode_seconds = greatest(0, least(600, p_seconds)) where id = 1;
  insert into private.mod_actions (moderator, action, target)
  values (private.my_nickname(), 'set slow mode', p_seconds || ' seconds');
end $$;

-- Rotate the access code: everyone except the caller must re-enter the new code
create function public.set_access_code(p_new_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  new_epoch int;
begin
  if not private.is_moderator() then raise exception 'Moderators only.'; end if;
  if char_length(btrim(coalesce(p_new_code, ''))) < 6 then
    raise exception 'The code must be at least 6 characters.';
  end if;
  update private.settings
    set access_code_hash = extensions.crypt(upper(btrim(p_new_code)), extensions.gen_salt('bf')),
        code_epoch = code_epoch + 1
    where id = 1
    returning code_epoch into new_epoch;
  update public.sessions set code_epoch = new_epoch where id = auth.uid();
  insert into private.mod_actions (moderator, action, target)
  values (private.my_nickname(), 'rotate access code', 'all sessions');
end $$;

-- ---------------- Feedback board ----------------
create function public.create_issue(p_title text, p_description text default '', p_source_message_id bigint default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me     public.sessions;
  new_id bigint;
begin
  if not private.is_member() then raise exception 'Join the class first.'; end if;
  select * into me from public.sessions where id = auth.uid();
  if not me.is_moderator and (
    select count(*) from public.issues where session_id = me.id and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'You can post up to 5 issues per hour.';
  end if;
  insert into public.issues (session_id, nickname, title, description, source_message_id)
  values (me.id, me.nickname, btrim(p_title), btrim(coalesce(p_description, '')), p_source_message_id)
  returning id into new_id;
  -- the author automatically supports their own issue
  insert into public.issue_votes (issue_id, session_id) values (new_id, me.id);
  return new_id;
end $$;

create function public.get_issues() returns table (
  id bigint, nickname text, title text, description text, status text, is_hidden boolean,
  is_mine boolean, created_at timestamptz, vote_count bigint, voted boolean
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.nickname, i.title, i.description, i.status, i.is_hidden,
         i.session_id = auth.uid(), i.created_at,
         (select count(*) from public.issue_votes v where v.issue_id = i.id) as vote_count,
         exists (select 1 from public.issue_votes v where v.issue_id = i.id and v.session_id = auth.uid())
  from public.issues i
  where private.is_member() and (not i.is_hidden or private.is_moderator())
  order by vote_count desc, i.created_at desc;
$$;

create function public.toggle_issue_vote(p_issue_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member() then raise exception 'Join the class first.'; end if;
  if not exists (select 1 from public.issues where id = p_issue_id and not is_hidden) then
    raise exception 'Issue not found.';
  end if;
  delete from public.issue_votes where issue_id = p_issue_id and session_id = auth.uid();
  if found then return false; end if;
  insert into public.issue_votes (issue_id, session_id) values (p_issue_id, auth.uid());
  return true;
end $$;

create function public.moderate_issue(p_issue_id bigint, p_hide boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_moderator() then raise exception 'Moderators only.'; end if;
  update public.issues set is_hidden = p_hide where id = p_issue_id;
  insert into private.mod_actions (moderator, action, target, reason)
  values (private.my_nickname(), case when p_hide then 'hide' else 'unhide' end, 'issue #' || p_issue_id, p_reason);
end $$;

create function public.set_issue_status(p_issue_id bigint, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_moderator() then raise exception 'Moderators only.'; end if;
  update public.issues set status = p_status where id = p_issue_id;
  insert into private.mod_actions (moderator, action, target)
  values (private.my_nickname(), 'status ' || p_status, 'issue #' || p_issue_id);
end $$;

-- ---------------- Polls ----------------
create function public.create_poll(p_question text, p_options text[]) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me      public.sessions;
  cleaned text[];
  new_id  bigint;
begin
  if not private.is_member() then raise exception 'Join the class first.'; end if;
  select * into me from public.sessions where id = auth.uid();

  select array_agg(o order by first_pos) into cleaned
  from (
    select btrim(o) as o, min(pos) as first_pos
    from unnest(p_options) with ordinality as t(o, pos)
    where char_length(btrim(o)) > 0
    group by btrim(o)
  ) x;

  if coalesce(array_length(cleaned, 1), 0) not between 2 and 6 then
    raise exception 'A poll needs between 2 and 6 different options.';
  end if;
  if not me.is_moderator and (
    select count(*) from public.polls where session_id = me.id and created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'You can create up to 3 polls per hour.';
  end if;

  insert into public.polls (session_id, nickname, question)
  values (me.id, me.nickname, btrim(p_question))
  returning id into new_id;

  insert into public.poll_options (poll_id, label, position)
  select new_id, o, pos from unnest(cleaned) with ordinality as t(o, pos);

  return new_id;
end $$;

create function public.get_polls() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.obj order by x.created_at desc), '[]'::jsonb)
  from (
    select p.created_at, jsonb_build_object(
      'id', p.id,
      'nickname', p.nickname,
      'question', p.question,
      'is_closed', p.is_closed,
      'is_hidden', p.is_hidden,
      'is_mine', p.session_id = auth.uid(),
      'created_at', p.created_at,
      'total', (select count(*) from public.poll_votes v where v.poll_id = p.id),
      'my_option', (select v.option_id from public.poll_votes v where v.poll_id = p.id and v.session_id = auth.uid()),
      'options', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', o.id,
          'label', o.label,
          'votes', (select count(*) from public.poll_votes v where v.option_id = o.id)
        ) order by o.position), '[]'::jsonb)
        from public.poll_options o where o.poll_id = p.id
      )
    ) as obj
    from public.polls p
    where private.is_member() and (not p.is_hidden or private.is_moderator())
  ) x;
$$;

create function public.vote_poll(p_poll_id bigint, p_option_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member() then raise exception 'Join the class first.'; end if;
  if not exists (select 1 from public.polls where id = p_poll_id and not is_hidden and not is_closed) then
    raise exception 'This poll is closed.';
  end if;
  if not exists (select 1 from public.poll_options where id = p_option_id and poll_id = p_poll_id) then
    raise exception 'Option not found.';
  end if;
  insert into public.poll_votes (poll_id, option_id, session_id)
  values (p_poll_id, p_option_id, auth.uid())
  on conflict (poll_id, session_id) do update set option_id = excluded.option_id, created_at = now();
end $$;

create function public.close_poll(p_poll_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member() then raise exception 'Join the class first.'; end if;
  if not (private.is_moderator() or exists (
    select 1 from public.polls where id = p_poll_id and session_id = auth.uid()
  )) then
    raise exception 'Only the poll creator or a moderator can close it.';
  end if;
  update public.polls set is_closed = true where id = p_poll_id;
end $$;

create function public.moderate_poll(p_poll_id bigint, p_hide boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_moderator() then raise exception 'Moderators only.'; end if;
  update public.polls set is_hidden = p_hide where id = p_poll_id;
  insert into private.mod_actions (moderator, action, target, reason)
  values (private.my_nickname(), case when p_hide then 'hide' else 'unhide' end, 'poll #' || p_poll_id, p_reason);
end $$;

-- ---------------- Summary for the report ----------------
create function public.get_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member() then raise exception 'Join the class first.'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'members', (select count(*) from public.sessions),
    'participants', (
      select count(distinct sid) from (
        select session_id as sid from public.messages
        union select session_id from public.issues
        union select session_id from public.issue_votes
        union select session_id from public.poll_votes
      ) t
    ),
    'messages', (select count(*) from public.messages where not is_hidden),
    'issues', (
      select coalesce(jsonb_agg(to_jsonb(i) order by i.votes desc, i.created_at), '[]'::jsonb)
      from (
        select x.id, x.title, x.description, x.status, x.created_at,
               (select count(*) from public.issue_votes v where v.issue_id = x.id) as votes
        from public.issues x
        where not x.is_hidden
      ) i
    ),
    'polls', (
      select coalesce(jsonb_agg(e), '[]'::jsonb)
      from jsonb_array_elements(public.get_polls()) e
      where not (e ->> 'is_hidden')::boolean
    )
  );
end $$;

-- =====================================================================
-- Permissions: only signed-in (anonymous) users may call the functions
-- =====================================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.join_class(text)',
    'public.my_session()',
    'public.report_message(bigint, text)',
    'public.moderate_message(bigint, boolean, text)',
    'public.dismiss_reports(bigint)',
    'public.get_hidden_body(bigint)',
    'public.get_mod_queue()',
    'public.get_mod_log()',
    'public.get_settings()',
    'public.set_slow_mode(int)',
    'public.set_access_code(text)',
    'public.create_issue(text, text, bigint)',
    'public.get_issues()',
    'public.toggle_issue_vote(bigint)',
    'public.moderate_issue(bigint, boolean, text)',
    'public.set_issue_status(bigint, text)',
    'public.create_poll(text, text[])',
    'public.get_polls()',
    'public.vote_poll(bigint, bigint)',
    'public.close_poll(bigint)',
    'public.moderate_poll(bigint, boolean, text)',
    'public.get_summary()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke all on all tables in schema private from anon, authenticated;

-- Newer Supabase projects do not grant table access to API roles automatically.
-- Only these two tables are used directly by the app (row-level security still applies);
-- everything else goes through the functions above.
grant select on public.sessions to authenticated;
grant select, insert on public.messages to authenticated;
revoke execute on function private.before_message_insert() from public, anon, authenticated;

-- Live chat: stream message inserts/updates to subscribed members (RLS applies)
alter publication supabase_realtime add table public.messages;
