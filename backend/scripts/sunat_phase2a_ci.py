"""Hosted-CI-only lifecycle and rollback evidence for the fiscal candidates.

No destination arguments, credentials, reset, linked project or local fallback.
The original Windows runner remains bound to its existing temporary project.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
PORTS = (59120, 59121, 59122)
CANDIDATE_HASHES = {
    '20261023061225_electronic_fiscal_sandbox_persistence.sql':
        'df0c339852499b2717a5cfd00d822b06128ff970610fb0f74db08a15c242de01',
    '20261023135019_electronic_fiscal_helper_sql_lint.sql':
        'ff0d192543f389de8391a72507de5f217407287e60a4b8295fae4606f9bcb670',
}
FOLLOWUP_MIGRATION = '20261025190353_restrict_electronic_document_direct_select.sql'
FOLLOWUP_HASH = '7613198f6c8152d1e4838c057c308ebb35413ef853087fa2b831358f43155aff'
RPC_NAMES = (
    'save_electronic_issuer_profile', 'configure_electronic_series',
    'prepare_electronic_document', 'revise_electronic_document',
    'confirm_electronic_document', 'get_electronic_document',
    'can_view_electronic_documents',
)


def require(ok, reason):
    if not ok:
        raise ValueError('CPE_CI_' + reason)


def command(args, timeout=900):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf8', timeout=timeout)
    # Supabase start/status can print local API secrets. Never forward their output.
    if result.returncode:
        raise RuntimeError('CPE_CI_COMMAND_FAILED: ' + Path(args[0]).name)
    return result.stdout


def context():
    """Derive the only permitted target from hosted job identity, never a DB URL."""
    require(sys.platform == 'linux' and os.environ.get('RUNNER_OS') == 'Linux'
            and os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted'
            and os.environ.get('GITHUB_ACTIONS') == 'true'
            and os.environ.get('CI') == 'true', 'HOSTED_RUNNER_REQUIRED')
    require(os.environ.get('GITHUB_REPOSITORY') == 'Diegx2801/silsanplex', 'REPOSITORY')
    run_id, attempt = os.environ.get('GITHUB_RUN_ID', ''), os.environ.get('GITHUB_RUN_ATTEMPT', '')
    require(bool(re.fullmatch(r'[1-9][0-9]*', run_id))
            and bool(re.fullmatch(r'[1-9][0-9]*', attempt)), 'RUN_ID')
    require(os.environ.get('RUNNER_TEMP') == '/home/runner/work/_temp', 'TEMP_DIRECTORY')
    require(ROOT == Path(os.environ.get('GITHUB_WORKSPACE', '')).resolve()
            and ROOT.is_relative_to(Path('/home/runner/work').resolve())
            and ROOT != Path('/home/runner/work').resolve(), 'WORKSPACE')
    require(os.environ.get('DOCKER_HOST', 'unix:///var/run/docker.sock')
            == 'unix:///var/run/docker.sock'
            and os.environ.get('DOCKER_CONTEXT', 'default') == 'default', 'DOCKER_ENDPOINT')
    project = f'silsan-cpe-tx-{run_id}-{attempt}'
    directory = Path('/home/runner/work/_temp').resolve() / project
    require(directory.resolve() == directory and not directory.is_symlink(), 'WORKDIR')
    return project, directory


def docker_guard():
    endpoint = json.loads(command(['docker', 'context', 'inspect']))[0]['Endpoints']['docker']['Host']
    require(endpoint == 'unix:///var/run/docker.sock', 'DOCKER_ENDPOINT')


def config(project):
    # Only CLI defaults and dedicated test ports; no repo .env, seed or functions.
    return f'''project_id = "{project}"
[api]
enabled = true
port = 59121
[db]
port = 59122
shadow_port = 59120
major_version = 17
[db.migrations]
enabled = true
schema_paths = []
[db.seed]
enabled = false
sql_paths = []
[studio]
enabled = false
[local_smtp]
enabled = false
[realtime]
enabled = false
[analytics]
enabled = false
[edge_runtime]
enabled = false
[auth]
site_url = "http://127.0.0.1:59121"
enable_signup = false
'''


def repository_manifest():
    paths = sorted((ROOT / 'backend/supabase/migrations').glob('*.sql'))
    require(len(paths) == 151 and [p.name for p in paths[-3:-1]] == list(CANDIDATE_HASHES)
            and paths[-1].name == FOLLOWUP_MIGRATION,
            'MIGRATION_MANIFEST')
    values = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    require(all(values[name] == digest for name, digest in CANDIDATE_HASHES.items()),
            'CANDIDATE_HASH')
    require(values[FOLLOWUP_MIGRATION] == FOLLOWUP_HASH, 'CANDIDATE_HASH')
    return values


def verify_copy(project, directory):
    require((directory / 'supabase/config.toml').read_text(encoding='utf8') == config(project),
            'CONFIGURATION')
    manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf8'))
    require(manifest == repository_manifest(), 'SOURCE_CHANGED')
    copies = sorted((directory / 'supabase/migrations').iterdir())
    expected = list(manifest)[:-3]
    require([p.name for p in copies] == expected, 'COPIED_HISTORY')
    require(all(not p.is_symlink() and hashlib.sha256(p.read_bytes()).hexdigest() == manifest[p.name]
                for p in copies), 'COPIED_HASH')
    require(not (directory / 'supabase/.temp/project-ref').exists()
            and not (directory / '.env').exists()
            and not (directory / 'supabase/seed.sql').exists(), 'LINK_OR_SEED')


def prepare():
    project, directory = context()
    docker_guard()
    # Fail closed rather than reusing any container/volume on this hosted worker.
    require(not command(['docker', 'ps', '-aq']).strip(), 'EXISTING_CONTAINERS')
    require(not command(['docker', 'volume', 'ls', '-q']).strip(), 'EXISTING_VOLUMES')
    for port in PORTS:
        with socket.socket() as probe:
            probe.bind(('0.0.0.0', port))
    manifest = repository_manifest()
    directory.mkdir(mode=0o700, exist_ok=False)
    copies = directory / 'supabase/migrations'
    copies.mkdir(parents=True)
    for name in list(manifest)[:-3]:
        (copies / name).write_bytes((ROOT / 'backend/supabase/migrations' / name).read_bytes())
    (directory / 'supabase/config.toml').write_text(config(project), encoding='utf8')
    (directory / 'manifest.json').write_text(json.dumps(manifest), encoding='utf8')
    verify_copy(project, directory)
    cli = str(ROOT / 'backend/node_modules/.bin/supabase')
    print(json.dumps({'starting_fresh_project': project, 'historical_files': 148}), flush=True)
    command([cli, 'start', '--workdir', str(directory), '--exclude',
             'studio,inbucket,realtime,analytics,vector,edge-runtime,imgproxy,meta'])
    # start initializes fresh volumes; up is harmless if it already applied all 148.
    # No reset, repair, remote URL, seed or backup restore is used.
    verify_target()
    command([cli, 'migration', 'up', '--local', '--workdir', str(directory)])
    print(json.dumps({'prepared_project': project, 'historical_files': 148,
                      'api': 59121, 'postgres': 59122}))


def owned_resources(project):
    ids = command(['docker', 'ps', '-aq']).split()
    containers = json.loads(command(['docker', 'inspect'] + ids)) if ids else []
    for item in containers:
        labels = item['Config'].get('Labels') or {}
        require(labels.get('com.supabase.cli.project') == project
                and labels.get('com.docker.compose.project') == project,
                'CONTAINER_PROJECT')
    names = command(['docker', 'volume', 'ls', '-q']).split()
    volumes = json.loads(command(['docker', 'volume', 'inspect'] + names)) if names else []
    require(all((v.get('Labels') or {}).get('com.supabase.cli.project') == project
                for v in volumes), 'VOLUME_PROJECT')
    return containers, volumes


def verify_target():
    project, directory = context()
    docker_guard()
    verify_copy(project, directory)
    containers, volumes = owned_resources(project)
    require(bool(containers), 'MISSING_CONTAINERS')
    for name, internal, host in [(f'supabase_db_{project}', '5432/tcp', '59122'),
                                 (f'supabase_kong_{project}', '8000/tcp', '59121')]:
        matches = [c for c in containers if c['Name'] == '/' + name]
        require(len(matches) == 1, 'CONTAINER_NAME')
        item = matches[0]
        require(item['State']['Running']
                and any(p['HostPort'] == host
                        for p in item['NetworkSettings']['Ports'].get(internal, []) or []),
                'CONTAINER_PORT')
        if name.startswith('supabase_db_'):
            require(any(m['Type'] == 'volume' and m['Name'] == f'supabase_db_{project}'
                        and m['Destination'] == '/var/lib/postgresql/data' for m in item['Mounts']),
                    'DATABASE_VOLUME')
    require(any(v['Name'] == f'supabase_db_{project}' for v in volumes), 'MISSING_VOLUME')
    return f'supabase_db_{project}'


def stop():
    project, directory = context()
    if not directory.exists():
        return
    docker_guard()
    verify_copy(project, directory)
    containers, volumes = owned_resources(project)
    if not containers and not volumes:
        return
    # Failed startup may leave only some stopped containers. Ownership is still
    # mandatory, but health/API availability is not required to stop this project.
    # Keep volumes; the GitHub-hosted VM itself is discarded after the job.
    command([str(ROOT / 'backend/node_modules/.bin/supabase'), 'stop', '--workdir', str(directory)],
            timeout=120)


def absent_candidates(runner):
    names = ','.join(runner.quote(name) for name in RPC_NAMES)
    result = runner.read(f"""select jsonb_build_object(
      'schemas',(select count(*) from pg_namespace where nspname='electronic_private'),
      'relations',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relname like 'electronic_%'),
      'rpcs',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname in ({names})),
      'permissions',(select count(*) from public.permissions
         where code in ('BILLING_VIEW','BILLING_PREPARE','BILLING_ISSUE','BILLING_CONFIGURE')))""")
    require(all(value == 0 for value in result.values()), 'RESIDUAL_FISCAL_OBJECTS')
    return result


def normalize_dump(source):
    # pg_dump generates random psql restrict keys; they are not schema objects.
    return '\n'.join(line for line in source.splitlines()
                     if not line.startswith(('\\restrict ', '\\unrestrict ')))


def snapshot(runner):
    dump = runner.run(['docker', 'exec', runner.CONTAINER, 'pg_dump', '-U', 'postgres',
                       '-d', 'postgres', '--schema-only']).stdout
    tables = runner.read("""select coalesce(json_agg(format('%I.%I',schemaname,tablename)
      order by schemaname,tablename),'[]') from pg_tables where schemaname not like 'pg_%'
      and schemaname<>'information_schema'""")
    branches = [f"""select {runner.quote(t)} name,(select coalesce(jsonb_agg(md5(to_jsonb(r)::text)
                order by md5(to_jsonb(r)::text)),'[]') from {t} r) hashes""" for t in tables]
    rows = runner.read('select jsonb_object_agg(name,hashes) from (' + ' union all '.join(branches) + ') x')
    security = runner.read("""select jsonb_build_object(
      'roles',(select jsonb_agg(to_jsonb(r) order by rolname) from pg_roles r),
      'memberships',(select coalesce(jsonb_agg(to_jsonb(m) order by roleid,member,grantor),'[]')
                     from pg_auth_members m),
      'database',(select jsonb_build_object('owner',datdba,'acl',datacl) from pg_database
                  where datname=current_database()),
      'settings',(select coalesce(jsonb_agg(to_jsonb(s) order by setdatabase,setrole),'[]')
                   from pg_db_role_setting s))""")
    return {'schema': hashlib.sha256(normalize_dump(dump).encode()).hexdigest(),
            'rows': rows, 'security': security,
            'history': runner.read('select json_agg(version order by version) from supabase_migrations.schema_migrations'),
            'candidates': absent_candidates(runner), 'manifest': repository_manifest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'stop'])
    action = parser.parse_args().action
    prepare() if action == 'prepare' else stop()
