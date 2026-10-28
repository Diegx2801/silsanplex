"""Fictitious fiscal SQL tests; fixed, verified temporary Supabase only.

--transactional requires the history preceding the fiscal candidate migrations,
compiles those candidates in order, and runs serial tests inside one ROLLBACK
transaction. Default requires the complete installed history and also runs
independent races.
--ci-transactional uses only a verified GitHub-hosted disposable project.
No resets, cleanup, existing fixture reuse, credentials, transport, or backend writes.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = (
    ROOT / 'backend/supabase/migrations/20261023061225_electronic_fiscal_sandbox_persistence.sql',
    ROOT / 'backend/supabase/migrations/20261023135019_electronic_fiscal_helper_sql_lint.sql',
)
VERSIONS = tuple(path.name.split('_')[0] for path in MIGRATIONS)
CANDIDATE_HASHES = {
    '20261023061225_electronic_fiscal_sandbox_persistence.sql':
        'df0c339852499b2717a5cfd00d822b06128ff970610fb0f74db08a15c242de01',
    '20261023135019_electronic_fiscal_helper_sql_lint.sql':
        'ff0d192543f389de8391a72507de5f217407287e60a4b8295fae4606f9bcb670',
}
SUITE = ROOT / 'backend/scripts/fixtures/electronic_document_persistence.sql'
CONTAINER = 'supabase_db_silsanplexp2c2'
HELPERS = SUITE.read_text(encoding='utf8').split('-- SERIAL_TESTS_START:')[0]
CHECKS = []


def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf8', **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result


def sql(query):
    # Existing fixture sentinel, not a destination selector. CI verifies its own
    # hosted project/container before changing CONTAINER; local checks are unchanged.
    return run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt',
                '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
               input="set silsan.sunat_phase2a_test='verified-silsanplexp2c2';\n"+query)


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def js(value):
    return quote(json.dumps(value)) + '::jsonb'


def read(query):
    return json.loads(sql(query).stdout.strip())


def uid():
    return str(uuid.uuid4())


def check(label, ok, evidence=None):
    item = dict(assertion=label, passed=bool(ok))
    if evidence is not None:
        item['evidence'] = evidence
    CHECKS.append(item)
    print(json.dumps(item), flush=True)
    if not ok:
        raise AssertionError(label)


def candidate_start(files):
    """Return the exact candidate offset without assuming later history is absent."""
    repository_files = sorted(path.name.split('_')[0]
                              for path in MIGRATIONS[0].parent.glob('*.sql'))
    if files != sorted(set(files)) or files != repository_files:
        raise ValueError('CPE_TEST_MIGRATION_FILES_MISMATCH')
    if tuple(path.name for path in MIGRATIONS) != tuple(CANDIDATE_HASHES):
        raise ValueError('CPE_TEST_MIGRATION_FILES_MISMATCH')
    if any(not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()
           != CANDIDATE_HASHES.get(path.name) for path in MIGRATIONS):
        raise ValueError('CPE_TEST_CANDIDATE_HASH')
    starts = [index for index, version in enumerate(files) if version == VERSIONS[0]]
    if len(starts) != 1 or tuple(files[starts[0]:starts[0] + len(VERSIONS)]) != VERSIONS:
        raise ValueError('CPE_TEST_MIGRATION_FILES_MISMATCH')
    return starts[0]


def validate_history(migrations, files, transactional):
    """Reject missing, extra, reordered or duplicate versions before fixtures."""
    first_candidate = candidate_start(files)
    expected = files[:first_candidate] if transactional else files
    if migrations != expected:
        raise ValueError('CPE_TEST_MIGRATION_HISTORY_MISMATCH')


def candidate_sql(path):
    """Keep candidate DDL inside the test transaction without editing SQL files."""
    if path not in MIGRATIONS:
        raise ValueError('CPE_TEST_UNEXPECTED_CANDIDATE')
    lines = path.read_text(encoding='utf8').splitlines(keepends=True)
    statements = [i for i, line in enumerate(lines)
                  if line.strip() and not line.lstrip().startswith('--')]
    if not statements:
        raise ValueError('CPE_TEST_EMPTY_CANDIDATE')
    first, last = statements[0], statements[-1]
    if path == MIGRATIONS[1]:
        if (first == last or lines[first].strip().lower() != 'begin;'
                or lines[last].strip().lower() != 'commit;'):
            raise ValueError('CPE_TEST_CANDIDATE_TRANSACTION_CONTROL')
        lines[first] = lines[last] = ''
    source = ''.join(lines)
    # The two fixed candidates use single-line outer wrappers and dollar-quoted
    # function bodies ending in "end $$;". Fail closed on any remaining control
    # line instead of letting it commit/abort the enclosing test transaction.
    if re.search(r'^\s*(?:begin|commit|rollback|end|abort|start\s+transaction)\s*;',
                 source, re.I | re.M):
        raise ValueError('CPE_TEST_CANDIDATE_TRANSACTION_CONTROL')
    return source


def serial_script(transactional):
    if transactional:
        candidates = """create temporary table cpe_transaction_guard on commit drop as
          select txid_current() transaction_id, pg_backend_pid() backend_pid;
        """
        for index, path in enumerate(MIGRATIONS):
            candidates += candidate_sql(path) + '\n' + transaction_probe(
                f'candidate-{index + 1}', verify_helpers=index == len(MIGRATIONS) - 1
            ) + '\n'
        return ('begin;\n' + candidates + SUITE.read_text(encoding='utf8')
                + '\n' + transaction_probe('serial', verify_helpers=True) + '\nrollback;')
    candidates = ''
    return 'begin;\n' + candidates + '\n' + SUITE.read_text(encoding='utf8') + '\nrollback;'


def transaction_probe(stage, verify_helpers=False):
    """Executed by PostgreSQL, not inferred from the exit status of psql."""
    volatility = '' if not verify_helpers else """
      if (select array_agg(p.provolatile::text order by p.proname)
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='electronic_private'
          and p.proname in ('address','date_value','payment','request','snapshot'))
         is distinct from array['s','s','s','s','v']::text[] then
        raise exception 'CPE_TEST_CANDIDATE_HELPERS_NOT_EFFECTIVE';
      end if;
    """
    return f"""do $cpe_probe$ begin
      if not exists(select 1 from pg_temp.cpe_transaction_guard
          where transaction_id=txid_current() and backend_pid=pg_backend_pid()) then
        raise exception 'CPE_TEST_TRANSACTION_CHANGED';
      end if;
      if (select count(*) from pg_tables where schemaname='public'
          and tablename in ('electronic_issuer_profiles','electronic_document_series',
            'electronic_documents','electronic_document_items',
            'electronic_document_commands','electronic_document_outbox')) <> 6 then
        raise exception 'CPE_TEST_CANDIDATE_SCHEMA_NOT_EFFECTIVE';
      end if;
      {volatility}
      raise notice 'CPE_TRANSACTIONAL:{stage}';
    end $cpe_probe$;"""


def verify(transactional):
    directory = Path(os.environ['LOCALAPPDATA']) / 'Temp/silsanplex-phase2c2-20261021'
    config = (directory / 'supabase/config.toml').read_text(encoding='utf8')
    assert re.search(r'^project_id\s*=\s*"silsanplexp2c2"\s*$', config, re.M)
    assert re.search(r'^port\s*=\s*58121\s*$', config, re.M)
    assert re.search(r'^port\s*=\s*58122\s*$', config, re.M)
    for name, port, host in [(CONTAINER, '5432/tcp', '58122'), ('supabase_kong_silsanplexp2c2', '8000/tcp', '58121')]:
        c = json.loads(run(['docker', 'inspect', name]).stdout)[0]
        assert c['State']['Running']
        assert c['Config']['Labels']['com.supabase.cli.project'] == 'silsanplexp2c2'
        assert c['Config']['Labels']['com.docker.compose.project'] == 'silsanplexp2c2'
        assert any(p['HostPort'] == host for p in c['NetworkSettings']['Ports'][port])
        if name == CONTAINER:
            assert any(m['Type'] == 'volume' and m['Name'] == 'supabase_db_silsanplexp2c2'
                       and m['Destination'] == '/var/lib/postgresql/data' for m in c['Mounts'])
    volume = json.loads(run(['docker', 'volume', 'inspect', 'supabase_db_silsanplexp2c2']).stdout)[0]
    assert volume['Labels']['com.supabase.cli.project'] == 'silsanplexp2c2'
    assert sql("select current_database(),current_setting('port')").stdout.strip() == 'postgres|5432'
    migrations = read('select json_agg(version order by version) from supabase_migrations.schema_migrations')
    files = sorted(p.name.split('_')[0] for p in MIGRATIONS[0].parent.glob('*.sql'))
    validate_history(migrations, files, transactional)
    definition = sql("select pg_get_functiondef('public.record_distribution_delivery_outcome(jsonb)'::regprocedure)").stdout
    assert 'pg_advisory_xact_lock' in definition and 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED' in definition
    if not transactional:
        installed = sql("select array_to_string(statements,E'\\n') from supabase_migrations.schema_migrations where version=" + quote(VERSIONS[0])).stdout
        # History stores statement blocks; effective function definitions are checked below.
        assert 'CPE-PE-DOM-PEN-1' in installed
    check('isolated project preflight', True, dict(project='silsanplexp2c2', api=58121, postgres=58122,
          volume='supabase_db_silsanplexp2c2', migrations=len(migrations),
          candidate_sha256={path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in MIGRATIONS}))


def fingerprints():
    """Keep hashes only, including private auth rows; never return their contents."""
    tables = read("select json_agg(format('%I.%I',schemaname,tablename)) from pg_tables where schemaname='public' or (schemaname='auth' and tablename in('users','sessions','refresh_tokens'))")
    branches = [f"select {quote(table)} name,(select coalesce(jsonb_agg(md5(to_jsonb(t)::text)),'[]') from {table} t) hashes" for table in tables]
    values = read('select jsonb_object_agg(name,hashes) from ('+' union all '.join(branches)+') x')
    return {table:Counter(hashes) for table,hashes in values.items()}


def serial(transactional):
    result = sql(serial_script(transactional))
    assertions = re.findall(r'NOTICE:  PASS: (.+)', result.stderr)
    if len(assertions) != 97:
        raise AssertionError('CPE_TEST_SERIAL_ASSERTION_COUNT')
    if transactional:
        markers = re.findall(r'NOTICE:  CPE_TRANSACTIONAL:([a-z0-9-]+)', result.stderr)
        if markers != ['candidate-1', 'candidate-2', 'serial']:
            raise AssertionError('CPE_TEST_TRANSACTIONAL_EXECUTION_NOT_PROVEN')
    for label in assertions:
        check('serial/' + label, True)


def fixture(count=1):
    # Fresh tenants per scenario. Fixtures are retained, not cleaned up.
    body = f"""begin; {HELPERS}
    do $seed$ declare f jsonb; s uuid; p jsonb; d jsonb; docs jsonb='[]'; begin
      f:=pg_temp.cpe_tenant();
      for i in 1..{count} loop
        s:=pg_temp.cpe_sale(f); p:=pg_temp.cpe_prepare(f,s);
        d:=pg_temp.cpe_ok('prepare_electronic_document',p,(f->>'actor')::uuid,(f->>'sid')::uuid);
        docs:=docs||jsonb_build_array(jsonb_build_object('sale',s,'request',p,'document',d));
      end loop;
      raise notice 'FIXTURE:%',f||jsonb_build_object('docs',docs);
    end $seed$; commit;"""
    result = sql(body)
    f = json.loads(re.search(r'FIXTURE:(\{.+\})', result.stderr)[1])
    f['commercialFingerprint'] = state(f)['commercialFingerprint']
    return f


def confirm(f, index=0, **changes):
    d = f['docs'][index]['document']
    return dict(organizationId=f['org'], environment='sandbox', operationKey=uid(),
                documentId=d['documentId'], expectedVersion=d['version'], **changes)


def call(f, operation, payload):
    return f"pg_temp.cpe_call({quote(operation)},{js(payload)},{quote(f['actor'])},{quote(f['sid'])})"


def state(f):
    value = json.loads(sql(f"begin;{HELPERS} select pg_temp.cpe_state({quote(f['org'])});rollback;").stdout.strip())
    if 'commercialFingerprint' in f:
        check('fictitious source sales inventory reservations distribution preserved', f['commercialFingerprint']==value['commercialFingerprint'])
    return value


def session_query(expression, name, hold=0):
    return f"""begin; set local application_name={quote(name)}; set local statement_timeout='12s';
    set local lock_timeout='8s'; {HELPERS}
    select jsonb_build_object('pid',pg_backend_pid(),'result', {expression});
    select pg_sleep({hold}); commit;"""


def race(label, expression1, expression2, independent=False):
    """First session holds its committed-in-transaction effects; second waits on real locks.

    Observe pg_stat_activity, not just near-simultaneous thread scheduling.
    """
    tag = 'cpe2a-' + uid()[:8]
    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(sql, session_query(expression1, tag+'-1', 2))
        deadline = time.monotonic()+8
        while time.monotonic() < deadline:
            ready = sql(f"select count(*) from pg_stat_activity where application_name={quote(tag+'-1')} and wait_event='PgSleep'").stdout.strip() == '1'
            if ready:
                break
            time.sleep(.03)
        assert ready, 'first independent session did not reach hold point'
        second = executor.submit(sql, session_query(expression2, tag+'-2'))
        blocked = False
        deadline = time.monotonic()+1.5
        while time.monotonic() < deadline:
            blocked = sql(f"select count(*) from pg_stat_activity where application_name={quote(tag+'-2')} and wait_event_type='Lock'").stdout.strip() == '1'
            if blocked or second.done():
                break
            time.sleep(.03)
        check(label+'/observed independent sessions', second.done() and not blocked if independent else blocked)
        r1, r2 = first.result(), second.result()
    values = [json.loads(next(line for line in r.stdout.splitlines() if line.startswith('{'))) for r in [r1,r2]]
    check(label+'/different backend pids', values[0]['pid'] != values[1]['pid'])
    return values[0]['result'], values[1]['result']


def races():
    f = fixture(); p = confirm(f)
    a,b = race('C01 identical confirm',call(f,'confirm_electronic_document',p),call(f,'confirm_electronic_document',p))
    s = state(f)
    check('C01 one number command audit job lines', a==b and a['state']=='00000' and s['outbox']==1 and s['commands']==4
          and s['fiscalAudits']==4 and len(s['items'])==1 and s['series'][0]['next_number']==2)

    f = fixture(); p=confirm(f); q={**p,'expectedVersion':'2'}
    a,b = race('C02 conflicting key',call(f,'confirm_electronic_document',p),call(f,'confirm_electronic_document',q))
    s=state(f)
    check('C02 winner and explicit conflict without effects',a['state']=='00000' and b.get('message')=='CPE_OPERATION_KEY_REUSED'
          and s['commands']==4 and s['fiscalAudits']==4 and s['outbox']==1 and s['series'][0]['next_number']==2)

    f=fixture(); p=confirm(f); q=confirm(f)
    a,b=race('C03 two confirm keys same original',call(f,'confirm_electronic_document',p),call(f,'confirm_electronic_document',q))
    s=state(f)
    check('C03 one original and one number',a['state']=='00000' and b.get('message')=='CPE_DOCUMENT_IMMUTABLE'
          and len(s['docs'])==1 and s['commands']==4 and s['fiscalAudits']==4 and s['outbox']==1)

    f=fixture(0)
    result=sql(f"begin;{HELPERS} select pg_temp.cpe_prepare({js(f)},pg_temp.cpe_sale({js(f)}));commit;")
    p=json.loads(result.stdout.strip()); q={**p,'operationKey':uid()}
    f['commercialFingerprint']=json.loads(sql(f"begin;{HELPERS}select pg_temp.cpe_state({quote(f['org'])});rollback;").stdout.strip())['commercialFingerprint']
    a,b=race('C03 two prepare keys same sale',call(f,'prepare_electronic_document',p),call(f,'prepare_electronic_document',q))
    s=state(f)
    check('C03 original race prevented at preparation',a['state']=='00000' and b.get('message')=='CPE_ORIGINAL_EXISTS'
          and len(s['docs'])==1 and s['commands']==3 and s['fiscalAudits']==3 and s['outbox']==0 and s['series'][0]['next_number']==1)

    f=fixture(2); a,b=race('C04 different sales same series',call(f,'confirm_electronic_document',confirm(f,0)),call(f,'confirm_electronic_document',confirm(f,1)))
    s=state(f)
    check('C04 consecutive distinct numbers',a['state']=='00000' and b['state']=='00000' and
          {a['value']['fiscalIdentity']['number'],b['value']['fiscalIdentity']['number']}=={'1','2'} and s['series'][0]['next_number']==3
          and s['commands']==6 and s['fiscalAudits']==6 and s['outbox']==2)

    f=fixture(); g=fixture(); p=confirm(f); q=confirm(g); q['operationKey']=p['operationKey']
    a,b=race('C05 independent tenants same key',call(f,'confirm_electronic_document',p),call(g,'confirm_electronic_document',q),True)
    check('C05 independent identities and counters',a['state']=='00000' and b['state']=='00000' and
          a['value']['fiscalIdentity']['ruc']!=b['value']['fiscalIdentity']['ruc'] and
          a['value']['fiscalIdentity']['number']==b['value']['fiscalIdentity']['number']=='1')
    for tenant in [f,g]:
        s=state(tenant)
        check('C05 isolated fiscal counts',s['commands']==4 and s['fiscalAudits']==4 and s['outbox']==1 and s['series'][0]['next_number']==2)

    f=fixture(); config=dict(organizationId=f['org'],environment='sandbox',operationKey=uid(),id=f['series'],expectedVersion='1',
                           issuerProfileId=f['issuer'],documentType='01',series='F001',nextNumber='1',enabled=False)
    a,b=race('C06 configuration before confirm',call(f,'configure_electronic_series',config),call(f,'confirm_electronic_document',confirm(f)))
    s=state(f)
    check('C06 disable prevents allocation',a['state']=='00000' and b.get('message')=='CPE_SERIES_INVALID' and s['outbox']==0
          and s['series'][0]['next_number']==1 and s['docs'][0]['state']=='prepared' and s['fiscalAudits']==4)

    f=fixture(); config={**config,'organizationId':f['org'],'id':f['series'],'issuerProfileId':f['issuer'],'operationKey':uid(),'enabled':True}
    a,b=race('C06 configuration version before confirm',call(f,'configure_electronic_series',config),call(f,'confirm_electronic_document',confirm(f)))
    s=state(f)
    check('C06 stale configuration rejected without counter effect',a['state']=='00000' and b.get('message')=='CPE_CONFIGURATION_CHANGED'
          and s['series'][0]['next_number']==1 and s['series'][0]['version']==2 and s['outbox']==0 and s['fiscalAudits']==4)

    f=fixture(); config={**config,'organizationId':f['org'],'id':f['series'],'issuerProfileId':f['issuer'],'operationKey':uid(),'enabled':True}
    a,b=race('C06 confirm before configuration regression',call(f,'confirm_electronic_document',confirm(f)),call(f,'configure_electronic_series',config))
    s=state(f)
    check('C06 cannot reuse allocated number',a['state']=='00000' and b.get('message')=='CPE_COUNTER_REGRESSION'
          and s['series'][0]['next_number']==2 and s['series'][0]['version']==1 and s['fiscalAudits']==4)

    f=fixture()
    # Data change on this scenario's fictitious customer only; no production roles changed.
    expression=f"pg_temp.cpe_edit_buyer({quote(f['buyer'])})"
    a,b=race('C09 customer changes before freeze',expression,call(f,'confirm_electronic_document',confirm(f)))
    s=state(f)
    check('C09 changed source rejected atomically',b.get('message')=='CPE_SOURCE_CHANGED' and s['outbox']==0
          and s['series'][0]['next_number']==1 and s['docs'][0]['state']=='prepared' and s['fiscalAudits']==3)

    f=fixture(); expression=f"pg_temp.cpe_edit_buyer({quote(f['buyer'])})"
    a,b=race('C09 freeze before customer change',call(f,'confirm_electronic_document',confirm(f)),expression)
    s=state(f)
    check('C09 coherent frozen customer snapshot',a['state']=='00000' and b['changed']==1 and s['docs'][0]['snapshot']['buyer']['name']=='SANDBOX comprador ficticio'
          and s['outbox']==1 and s['fiscalAudits']==4)


def ci_transactional(ci):
    """No race fixtures: only transactional SQL and exact before/after evidence."""
    global CONTAINER
    CONTAINER = ci.verify_target()
    if sql("select current_database(),current_setting('port')").stdout.strip() != 'postgres|5432':
        raise ValueError('CPE_CI_DATABASE_IDENTITY')
    before = ci.snapshot(sys.modules[__name__])
    files = sorted(p.name.split('_')[0] for p in MIGRATIONS[0].parent.glob('*.sql'))
    validate_history(before['history'], files, True)
    check(f'CI initial {candidate_start(files)} migrations and no candidate objects', True)
    try:
        serial(True)
    finally:
        after = ci.snapshot(sys.modules[__name__])
        for field in ('schema', 'security', 'rows', 'history', 'candidates', 'manifest'):
            check('CI rollback preserves ' + field, before[field] == after[field])
    print(json.dumps(dict(passed=len(CHECKS),failed=0,transactional=True,ci=True,
                         nontransactional_sequence_values_checked=False),indent=2))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--transactional',action='store_true')
    mode.add_argument('--ci-transactional',action='store_true')
    args=parser.parse_args()
    if args.ci_transactional:
        import sunat_phase2a_ci as ci
        ci_transactional(ci)
        return
    verify(args.transactional)
    before=fingerprints()
    try:
        serial(args.transactional)
        if not args.transactional:
            races()
    finally:
        after=fingerprints()
        check('all previous public and auth row fingerprints preserved',all(not(counter-after.get(t,Counter())) for t,counter in before.items()))
    print(json.dumps(dict(passed=len(CHECKS),failed=0,transactional=args.transactional),indent=2))


if __name__=='__main__':
    main()
