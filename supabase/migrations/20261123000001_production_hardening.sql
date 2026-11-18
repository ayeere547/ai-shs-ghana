-- =====================================================================================
-- AI SHS Ghana — Phase 7: production hardening
-- Least-privilege grants for anonymous visitors, school_id locks on every tenant table,
-- indexes for every foreign key, retention rules and self-service data export (Act 843).
-- tests/security-audit.test.ts checks these properties for every table and function,
-- including ones added by future migrations.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Anonymous visitors: read the region list and public plans, nothing else.
--    (Supabase grants new tables to anon by default; RLS already blocked these, this removes
--    the grants as a second layer.)
-- -------------------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') loop
    execute format('revoke all on public.%I from anon', t.relname);
  end loop;
end $$;
grant select on public.regions, public.subscription_plans to anon;
alter default privileges in schema public revoke all on tables from anon;

-- Functions: anon may call only the public directory/profile/stats functions and the one helper
-- used inside an anon-visible policy (plans_select). Signed-in users keep exactly the functions they
-- could already call, except internal helpers (prefixed _) and trigger functions, which nobody calls directly.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname, p.prorettype = 'trigger'::regtype as is_trigger,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'
  loop
    if f.auth_ok and left(f.proname, 1) <> '_' and not f.is_trigger then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.auth_ok then
      execute format('revoke execute on function %s from authenticated', f.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;
grant execute on function public.public_school_directory(text, text, text, text, text, int, int), public.public_school_profile(text),
  public.public_platform_stats(), public.has_platform_permission(text) to anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- -------------------------------------------------------------------------------------
-- 2. school_id can never move between schools (remaining tenant tables).
--    audit_logs and support_tickets keep history when a school is deleted (school_id → null).
-- -------------------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid and a.attname = 'school_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('schools', 'audit_logs', 'support_tickets')
      and not exists (select 1 from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid where tg.tgrelid = c.oid and p.proname = 'forbid_school_id_change')
  loop
    execute format('create trigger %s before update on public.%I for each row execute function public.forbid_school_id_change()', left(t.relname || '_school_lock', 63), t.relname);
  end loop;
end $$;

-- -------------------------------------------------------------------------------------
-- 3. An index behind every foreign key (fast joins, RLS lookups and cascading deletes).
-- -------------------------------------------------------------------------------------
do $$
declare fk record; v_cols text; v_name text;
begin
  for fk in
    select c.conrelid, c.conrelid::regclass::text as tbl, c.conkey
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
          and c.conkey @> (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1])
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ord), string_agg(a.attname, '_' order by k.ord)
    into v_cols, v_name
    from unnest(fk.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum;
    v_name := left(replace(fk.tbl, 'public.', '') || '_' || v_name, 56) || '_fk_idx';
    -- Two FKs can share leading columns; skip if an equivalent index was just created.
    if not exists (
      select 1 from pg_index i where i.indrelid = fk.conrelid
        and (i.indkey::int2[])[0:array_length(fk.conkey, 1) - 1] @> fk.conkey
        and fk.conkey @> (i.indkey::int2[])[0:array_length(fk.conkey, 1) - 1]) then
      execute format('create index if not exists %I on %s (%s)', v_name, fk.tbl, v_cols);
    end if;
  end loop;
end $$;

-- -------------------------------------------------------------------------------------
-- 4. Retention (Act 843: keep personal data no longer than needed). Days are configurable by
--    platform staff; null switches a rule off. Audit logs and financial records are kept.
-- -------------------------------------------------------------------------------------
insert into public.platform_settings (key, value) values
  ('retention_days', '{"read_notifications": 180, "notification_outbox": 30, "abandoned_payment_intents": 90, "ai_usage_logs": 730, "unflagged_tutor_messages": 365}')
on conflict (key) do nothing;

/** Server only (daily job). Returns how many rows each rule removed. */
create or replace function public.apply_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; d int; n int; out jsonb := '{}';
begin
  select value into cfg from public.platform_settings where key = 'retention_days';
  cfg := coalesce(cfg, '{}');

  d := (cfg ->> 'read_notifications')::int;
  if d is not null and d >= 30 then
    delete from public.notifications where read_at is not null and created_at < now() - make_interval(days => d);
    get diagnostics n = row_count; out := out || jsonb_build_object('read_notifications', n);
  end if;

  d := (cfg ->> 'notification_outbox')::int;
  if d is not null and d >= 7 then
    delete from public.notification_outbox where status in ('sent', 'failed', 'skipped') and created_at < now() - make_interval(days => d);
    get diagnostics n = row_count; out := out || jsonb_build_object('notification_outbox', n);
  end if;

  d := (cfg ->> 'abandoned_payment_intents')::int;
  if d is not null and d >= 30 then
    delete from public.payment_intents where status in ('failed', 'abandoned', 'pending') and created_at < now() - make_interval(days => d);
    get diagnostics n = row_count;
    delete from public.subscription_payment_intents where status in ('abandoned', 'pending') and created_at < now() - make_interval(days => d);
    out := out || jsonb_build_object('abandoned_payment_intents', n);
  end if;

  d := (cfg ->> 'ai_usage_logs')::int;
  if d is not null and d >= 400 then
    delete from public.ai_usage_logs where created_at < now() - make_interval(days => d);
    get diagnostics n = row_count; out := out || jsonb_build_object('ai_usage_logs', n);
  end if;

  -- Tutor chats: messages in conversations untouched for the period, unless any message was flagged
  -- (safeguarding records are kept for the school's review).
  d := (cfg ->> 'unflagged_tutor_messages')::int;
  if d is not null and d >= 90 then
    delete from public.ai_tutor_conversations c
    where c.last_message_at < now() - make_interval(days => d)
      and not exists (select 1 from public.ai_tutor_messages m where m.conversation_id = c.id and m.flagged);
    get diagnostics n = row_count; out := out || jsonb_build_object('tutor_conversations', n);
  end if;

  perform public._audit(null, null, 'platform.retention_applied', 'platform_settings', 'retention_days', 'Applied data retention rules', out);
  return out;
end $$;
revoke execute on function public.apply_retention() from public, anon, authenticated;
grant execute on function public.apply_retention() to service_role;

-- -------------------------------------------------------------------------------------
-- 5. "Download my data": everything held about the signed-in person as a person
--    (not the school's operational records, which the school controls).
-- -------------------------------------------------------------------------------------
create or replace function public.my_data_export() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'school_memberships', (select coalesce(jsonb_agg(jsonb_build_object('school', s.name, 'role', r.label, 'status', m.status, 'since', m.created_at)), '[]')
       from public.school_memberships m join public.schools s on s.id = m.school_id join public.roles r on r.id = m.role_id where m.user_id = v_uid),
    'platform_role', (select jsonb_build_object('role', r.label, 'since', pu.created_at) from public.platform_users pu join public.roles r on r.id = pu.role_id where pu.user_id = v_uid),
    'student_records', (select coalesce(jsonb_agg(jsonb_build_object('school', sc.name, 'student_number', st.student_number, 'first_name', st.first_name, 'middle_name', st.middle_name,
         'last_name', st.last_name, 'gender', st.gender, 'date_of_birth', st.date_of_birth, 'admission_date', st.admission_date, 'residency', st.residency, 'status', st.status)), '[]')
       from public.students st join public.schools sc on sc.id = st.school_id where st.user_id = v_uid),
    'staff_records', (select coalesce(jsonb_agg(jsonb_build_object('school', sc.name, 'staff_number', sf.staff_number, 'name', concat_ws(' ', sf.first_name, sf.last_name), 'email', sf.email, 'phone', sf.phone)), '[]')
       from public.staff sf join public.schools sc on sc.id = sf.school_id where sf.user_id = v_uid),
    'guardian_of', (select coalesce(jsonb_agg(jsonb_build_object('school', sc.name, 'guardian_name', g.full_name, 'phone', g.phone, 'email', g.email, 'child', st.first_name || ' ' || st.last_name, 'relationship', sg.relationship)), '[]')
       from public.guardians g join public.student_guardians sg on sg.guardian_id = g.id join public.students st on st.id = sg.student_id join public.schools sc on sc.id = g.school_id where g.user_id = v_uid),
    'notification_preferences', (select to_jsonb(np) - 'user_id' from public.notification_preferences np where np.user_id = v_uid),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object('title', n.title, 'body', n.body, 'created_at', n.created_at, 'read_at', n.read_at) order by n.created_at desc), '[]')
       from (select * from public.notifications where user_id = v_uid order by created_at desc limit 1000) n),
    'ai_tutor_conversations', (select coalesce(jsonb_agg(jsonb_build_object('title', c.title, 'created_at', c.created_at,
         'messages', (select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content, 'created_at', m.created_at) order by m.created_at), '[]') from public.ai_tutor_messages m where m.conversation_id = c.id))), '[]')
       from public.ai_tutor_conversations c where c.user_id = v_uid),
    'support_requests', (select coalesce(jsonb_agg(jsonb_build_object('reference', t.reference, 'subject', t.subject, 'status', t.status, 'created_at', t.created_at,
         'messages', (select coalesce(jsonb_agg(jsonb_build_object('from_support', m.from_staff, 'body', m.body, 'created_at', m.created_at) order by m.created_at), '[]') from public.support_messages m where m.ticket_id = t.id and not m.is_internal))), '[]')
       from public.support_tickets t where t.requester_id = v_uid),
    'family_messages_sent', (select coalesce(jsonb_agg(jsonb_build_object('body', f.body, 'created_at', f.created_at)), '[]') from public.family_messages f where f.author_id = v_uid),
    'activity_log', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'summary', a.summary, 'at', a.created_at) order by a.created_at desc), '[]')
       from (select * from public.audit_logs where actor_id = v_uid order by created_at desc limit 1000) a)
  );
end $$;
revoke execute on function public.my_data_export() from public, anon;
grant execute on function public.my_data_export() to authenticated;
