-- D06: expiry and repair-outbound DATE values use the same Lima calendar.
-- transaction_timestamp() is the existing now()/CURRENT_DATE transaction anchor:
-- waiting on a lock does not move the operation into a different business day.
-- Absolute timestamps, declared dates and persisted history remain untouched.
begin;

do $$
declare
  target record;
  definition text;
  occurrences integer;
  original_search_path text := current_setting('search_path');
  business_date_expression constant text :=
    '(pg_catalog.transaction_timestamp() at time zone ''America/Lima'')::date';
begin
  -- pg_get_functiondef retains signatures, defaults, volatility, security and
  -- configuration; CREATE OR REPLACE retains each function's owner and ACL.
  -- Fail rather than silently patch an unexpected version of these contracts.
  for target in select * from (values
    ('public.reserve_repair_part_unchecked(jsonb)', 1),
    ('public.consume_repair_part_unchecked(jsonb)', 2),
    ('public.inventory_bucket_state(uuid,uuid,uuid,uuid,text,text,date)', 3),
    ('public.assert_inventory_fefo_bucket(uuid,uuid,uuid,date)', 1)
  ) as targets(signature, expected_occurrences) loop
    select pg_get_functiondef(target.signature::regprocedure) into definition;
    select count(*) into occurrences from regexp_matches(definition, '\mcurrent_date\M', 'gi');
    if occurrences <> target.expected_occurrences then
      raise exception 'D06_UNEXPECTED_DATE_CONTRACT: % (% vs %)',
        target.signature, occurrences, target.expected_occurrences;
    end if;
    execute regexp_replace(definition, '\mcurrent_date\M', business_date_expression, 'gi');
  end loop;

  -- These are the shared authoritative availability/FEFO projections used by
  -- repair reservations and selectors. Keeping UTC here would still hide a
  -- valid last-day bucket even if consume_repair_part were corrected alone.
  -- Deparse with an empty path to qualify relation names safely. No private
  -- helper EXECUTE grant is added to authenticated readers of these views.
  perform set_config('search_path', '', true);
  for target in select * from (values
    ('inventory_bucket_availability', 5),
    ('inventory_fefo_candidates', 1),
    -- Its days/range must agree with the corrected expiration_state inherited
    -- from availability; otherwise the existing stock UI would show "-1 day"
    -- for a bucket still valid on its Lima expiry day.
    ('inventory_expiration_alerts', 2)
  ) as targets(name, expected_occurrences) loop
    select pg_get_viewdef(('public.' || target.name)::regclass, true) into definition;
    select count(*) into occurrences from regexp_matches(definition, '\mcurrent_date\M', 'gi');
    if occurrences <> target.expected_occurrences then
      raise exception 'D06_UNEXPECTED_VIEW_DATE_CONTRACT: % (% vs %)',
        target.name, occurrences, target.expected_occurrences;
    end if;
    execute format('create or replace view public.%I with (security_invoker=true) as %s',
      target.name, regexp_replace(definition, '\mcurrent_date\M', business_date_expression, 'gi'));
  end loop;
  perform set_config('search_path', original_search_path, true);
end;
$$;

-- No grants, new RPCs, client-supplied clock, timezone changes, backfill,
-- inventory revaluation or historical DATE/timestamptz updates.
commit;
