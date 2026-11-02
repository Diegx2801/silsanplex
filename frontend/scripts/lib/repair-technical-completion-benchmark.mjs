import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]
const projectionCalls = node => (['repair_technical_completions','unoptimized'].includes(node['Function Name']) ? node['Actual Loops'] : 0)
  + (node.Plans || []).reduce((n,p)=>n+projectionCalls(p),0)

/** Uses ONLY the runner's identity-verified disposable SQL channel. */
export function benchmarkTechnicalCompletion({ sql, backend, evidence }) {
  const org = randomUUID(), actor = randomUUID()
  const reference = fs.readFileSync(path.join(backend,'supabase/tests/helpers/repair_technical_completion_benchmark.sql.fixture'),'utf8')
  const output = sql(`begin; set local statement_timeout='60s';
    ${reference}
    insert into organizations(id,name,slug) values('${org}','R13 benchmark','r13-bench-${org}');
    insert into auth.users(id,email) values('${actor}','${actor}@example.invalid');
    insert into auth.sessions(id,user_id,created_at,updated_at) values('${actor}','${actor}',now(),now());
    insert into organization_memberships(organization_id,user_id) values('${org}','${actor}');
    insert into user_roles(organization_id,user_id,role_code) values('${org}','${actor}','ADMIN');
    insert into repairs(organization_id,requester_type,requesting_area,equipment_type,external_equipment_description,
      problem_description,customer_name_snapshot,customer_document_snapshot,product_code_snapshot,product_description_snapshot,priority)
      select '${org}','internal','R13 benchmark','external','Benchmark equipment','Benchmark problem','R13 benchmark','INTERNO','EXTERNO','Benchmark equipment',
        case when n%2=0 then 'high' else 'normal' end from generate_series(1,1200) n;
    insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
      select organization_id,id,'UPDATED','received','received' from repairs cross join generate_series(1,5) where organization_id='${org}';
    create temporary table r13_bench_top as select id from repairs where organization_id='${org}' order by received_at desc,id desc limit 20;
    create temporary table r13_bench_columns as select string_agg(quote_ident(column_name),',' order by ordinal_position) cols
      from information_schema.columns where table_schema='r13_benchmark' and table_name='baseline' and column_name<>'non_repairable_decision_id';
    grant select on r13_bench_top,r13_bench_columns to authenticated;
    create function pg_temp.r13_measure(stage text,version text,kind text,iteration integer,q text) returns jsonb language plpgsql as $fn$
    declare p jsonb; begin execute 'explain (analyze,buffers,format json) '||q into p;
      return jsonb_build_object('stage',stage,'version',version,'kind',kind,'iteration',iteration,'plan',p);
    end $fn$;
    create function pg_temp.r13_phase(stage text) returns setof jsonb language plpgsql as $fn$
    declare v text; relation text; cols text; i integer; q text; expected jsonb; actual jsonb; begin
      select c.cols into cols from r13_bench_columns c;
      -- Same old fields, filters, ordering and page on all three definitions.
      -- Include the feature only on the two R13 versions; baseline has no such field.
      for i in 1..3 loop
        foreach v in array array['baseline','before_fix','after_fix'] loop
          relation:=case v when 'baseline' then 'r13_benchmark.baseline' when 'before_fix' then 'r13_benchmark.before_fix' else 'public.repair_list' end;
          q:=format('select count(*) from %s where organization_id=%L::uuid',relation,'${org}');
          return next pg_temp.r13_measure(stage,v,'count',i,q);
          q:=format('select %s%s from %s where organization_id=%L::uuid order by received_at desc,id desc limit 10 offset 10',cols,
            case when v='baseline' then '' else ',technical_completion' end,relation,'${org}');
          return next pg_temp.r13_measure(stage,v,'page',i,q);
          if v<>'baseline' then
            q:=format('select %s from %s where organization_id=%L::uuid and id=(select id from r13_bench_top order by id limit 1)',
              case when v='before_fix' then 'technical_completion,first_technical_completion' else 'technical_completion_summary' end,relation,'${org}');
            return next pg_temp.r13_measure(stage,v,'detail',i,q);
          end if;
        end loop;
      end loop;
      return next pg_temp.r13_measure(stage,'after_fix','filtered_page',1,format(
        'select id,technical_completion from repair_list where organization_id=%L::uuid and priority=%L order by received_at desc,id desc limit 10 offset 10','${org}','high'));
      return next pg_temp.r13_measure(stage,'after_fix','no_offset',1,format(
        'select id,technical_completion from repair_list where organization_id=%L::uuid order by received_at desc,id desc limit 10','${org}'));
      select jsonb_agg(to_jsonb(p) order by p.id) into expected from
        (select id,technical_completion,first_technical_completion from r13_benchmark.before_fix where organization_id='${org}') p;
      select jsonb_agg(to_jsonb(p) order by p.id) into actual from
        (select id,technical_completion,first_technical_completion from repair_list where organization_id='${org}') p;
      if expected is distinct from actual then raise exception 'BENCHMARK_VALID_DATA_RESULTS_DIFFER'; end if;
      if (select count(*) from jsonb_array_elements(actual) as x(item) where x.item->'technical_completion'<>'null'::jsonb)
        <> (case when stage='500_ready' then 20 else 0 end) then raise exception 'BENCHMARK_COMPLETION_FIXTURE_INVALID'; end if;
    end $fn$;
    analyze repairs; analyze repair_events;
    select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','${actor}','session_id','${actor}')::text,true);
    set local role authenticated;
    select * from pg_temp.r13_phase('5');
    reset role;
    insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
      select '${org}',id,'UPDATED','received','received' from r13_bench_top cross join generate_series(1,95);
    analyze repair_events;
    set local role authenticated;
    select * from pg_temp.r13_phase('100');
    reset role;
    insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
      select '${org}',id,'UPDATED','received','received' from r13_bench_top cross join generate_series(1,400);
    analyze repair_events;
    set local role authenticated;
    select * from pg_temp.r13_phase('500');
    reset role;
    -- Also exercise genuine server-issued completions, not just NULL rows.
    select set_config('app.repairs_status_write','true',true);
    update repairs set status='diagnosis',assigned_technician_id='${actor}' where id in(select id from r13_bench_top);
    update repairs set status='in_repair' where id in(select id from r13_bench_top);
    update repairs set status='testing',current_test_cycle_number=1 where id in(select id from r13_bench_top);
    select set_config('app.repairs_status_write','false',true);
    insert into repair_events(organization_id,repair_id,event_type,from_status,to_status,metadata)
      select '${org}',id,'STATUS_CHANGED','in_repair','testing',jsonb_build_object('test_cycle_number',1) from r13_bench_top;
    set local role authenticated;
    do $do$ declare r public.repairs%rowtype; begin
      for r in select * from public.repairs where id in(select id from r13_bench_top) loop
        perform public.record_repair_test(jsonb_build_object('organization_id','${org}','repair_id',r.id,'expected_lock_version',r.lock_version,
          'test_type','Benchmark test','result','Approved','passed',true));
        perform public.change_repair_status_idempotent(jsonb_build_object('organization_id','${org}','repair_id',r.id,'expected_lock_version',r.lock_version+1,
          'operation_key',gen_random_uuid(),'status','ready_for_delivery'));
      end loop;
    end $do$;
    select * from pg_temp.r13_phase('500_ready');
    rollback;`)
  const samples = output.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).filter(row=>row.plan)
  assert.equal(samples.length, 104, 'All benchmark stages, repetitions and controls must execute')
  for (const row of samples) {
    const calls = projectionCalls(row.plan[0].Plan)
    if (row.kind==='count') assert.equal(calls,0,'Counts must prune completion reconstruction')
    if (row.kind==='detail') assert.equal(calls,row.version==='after_fix' ? 1 : 2,'Detail must use one corrected reconstruction')
    if (row.kind==='page' && row.version==='after_fix') assert.ok(calls>=10 && calls<=20,'Projection must be bounded by page plus OFFSET')
    if (row.kind==='no_offset') assert.ok(calls<=10,'No-OFFSET page must not reconstruct off-page rows')
  }
  fs.writeFileSync(path.join(evidence,'technical-completion-benchmark-plans.json'),JSON.stringify(samples,null,2))
  const groups = new Map()
  for (const row of samples) {
    const key = `${row.stage}:${row.version}:${row.kind}`
    const values = groups.get(key) || []
    values.push(row.plan[0]); groups.set(key,values)
  }
  const summary = [...groups].map(([key,values])=>({ key, samples: values.length,
    planningMs: median(values.map(p=>p['Planning Time'])), executionMs: median(values.map(p=>p['Execution Time'])),
    hitBlocks: median(values.map(p=>p.Plan['Shared Hit Blocks']||0)), readBlocks: median(values.map(p=>p.Plan['Shared Read Blocks']||0)),
    projectionCalls: median(values.map(p=>projectionCalls(p.Plan))) }))
  fs.writeFileSync(path.join(evidence,'technical-completion-benchmark-summary.json'),JSON.stringify(summary,null,2))
  const comparisons = ['5','100','500','500_ready'].map(stage => {
    const find = (version,kind) => summary.find(r=>r.key===`${stage}:${version}:${kind}`)
    const baseline = find('baseline','page'), before = find('before_fix','page'), after = find('after_fix','page')
    return { stage, baselineMs: baseline.executionMs, beforeFixMs: before.executionMs, afterFixMs: after.executionMs,
      ratioToBaseline: after.executionMs/baseline.executionMs, ratioToBeforeFix: after.executionMs/before.executionMs,
      reductionPercent: 100*(1-after.executionMs/before.executionMs),
      beforeHitBlocks: before.hitBlocks, afterHitBlocks: after.hitBlocks,
      countBaselineMs: find('baseline','count').executionMs, countBeforeFixMs: find('before_fix','count').executionMs,
      countAfterFixMs: find('after_fix','count').executionMs }
  })
  fs.writeFileSync(path.join(evidence,'technical-completion-benchmark-comparison.json'),JSON.stringify(comparisons,null,2))
  console.log('R13_BENCHMARK_MEDIANS',JSON.stringify(summary))
  assert.equal(sql("select count(*) from organizations where slug like 'r13-bench-%'"),'0','Benchmark fixtures must roll back')
  return summary
}
