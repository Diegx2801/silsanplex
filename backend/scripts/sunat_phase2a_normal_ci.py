"""Hosted-GitHub-only disposable Supabase lifecycle for the full fiscal runner.

The target is derived from GitHub's workflow/run/attempt/job identity. This
module accepts no database URL, project id, directory, credential, or Docker
endpoint from a caller. It never links to a hosted project or resets a local
project. The workflow's unconditional finalizer removes only resources whose
project labels and temporary owner manifest match this run.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import tomllib


ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = 'Diegx2801/silsanplex'
WORKFLOW_NAME = 'Flujos E2E'
WORKFLOW_PATH = '.github/workflows/inventory-e2e.yml'
JOB_ID = 'sunat-python-normal'
RUNNER_WORK_ROOT = Path('/home/runner/work')
RUNNER_TEMP_ROOT = Path('/home/runner/work/_temp')
DOCKER_ENDPOINT = 'unix:///var/run/docker.sock'
PORTS = {'shadow': 59320, 'api': 59321, 'db': 59322}
NETWORK_OPTIONS = {'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1'}
SUPABASE_HOME_NAME = 'supabase-home'
DOCKER_CONFIG_NAME = 'docker-config'
SUPABASE_CHILD_ENV = {
    'SUPABASE_NO_UPDATE_NOTIFIER': '1',
    'SUPABASE_TELEMETRY_DISABLED': '1',
    'DO_NOT_TRACK': '1',
}
SUPABASE_SAFE_ENV_KEYS = ('PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL')
FORBIDDEN_LOCAL_CLI_STATE = {'project-ref', 'linked-project.json', 'profile', 'profiles', 'access-token'}
EXCLUDED_SERVICES = (
    'studio,mailpit,realtime,logflare,vector,edge-runtime,imgproxy,postgres-meta,supavisor'
)
START_FAILURE_PATTERNS = (
    ('CLI_CONFIG', re.compile(r'unknown flag|unknown shorthand|invalid config|failed to parse.*config|toml.*error', re.I)),
    ('PORT_BIND', re.compile(r'address already in use|port is already allocated|failed to bind|bind .* failed', re.I)),
    ('DOCKER_NETWORK', re.compile(r'network .* not found|network .* already exists|could not find network|failed to create endpoint|invalid network', re.I)),
    ('IMAGE_PULL_OR_REGISTRY', re.compile(r'pull access denied|manifest unknown|no matching manifest|failed to pull|i/o timeout|tls handshake timeout', re.I)),
    ('CONTAINER_HEALTH', re.compile(r'health check|unhealthy|timed out waiting|context deadline exceeded|service .* not ready', re.I)),
    ('RESOURCE_LIMIT', re.compile(r'no space left|not enough memory|insufficient memory', re.I)),
    ('PERMISSION', re.compile(r'permission denied|operation not permitted|access denied', re.I)),
)
SYSTEM_NETWORKS = {'bridge': 'bridge', 'host': 'host', 'none': 'null'}
REMOTE_ENVIRONMENT_KEYS = (
    'DATABASE_URL', 'PGHOST', 'PGDATABASE', 'PGPORT', 'PGPASSWORD',
    'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD',
    'SUPABASE_PROJECT_REF', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY',
    'SUPABASE_URL', 'SUPABASE_ANON_KEY',
)
DOCKER_OVERRIDE_ENVIRONMENT_KEYS = (
    'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_TLS_VERIFY',
    'DOCKER_CERT_PATH', 'DOCKER_API_VERSION',
)
MIGRATION_RE = re.compile(r'^(\d{14})_[a-z0-9_]+\.sql$')


def require(condition, code):
    if not condition:
        raise ValueError('CPE_NORMAL_CI_' + code)


def identity(env=None, platform=None, root=None):
    """Return the sole approved hosted runner identity and derived target."""
    env = os.environ if env is None else env
    platform = sys.platform if platform is None else platform
    root = ROOT.resolve() if root is None else Path(root).resolve()
    require(platform == 'linux', 'HOSTED_LINUX_REQUIRED')
    require(env.get('GITHUB_ACTIONS') == 'true' and env.get('CI') == 'true'
            and env.get('RUNNER_OS') == 'Linux'
            and env.get('RUNNER_ENVIRONMENT') == 'github-hosted', 'HOSTED_RUNNER_REQUIRED')
    require(env.get('GITHUB_REPOSITORY') == REPOSITORY, 'REPOSITORY')
    require(env.get('GITHUB_WORKFLOW') == WORKFLOW_NAME, 'WORKFLOW_NAME')
    workflow_ref = env.get('GITHUB_WORKFLOW_REF', '')
    workflow_prefix = re.escape(REPOSITORY + '/' + WORKFLOW_PATH + '@')
    pull_ref = bool(re.fullmatch(workflow_prefix + r'refs/pull/[1-9][0-9]*/merge', workflow_ref))
    main_ref = bool(re.fullmatch(workflow_prefix + r'refs/heads/main', workflow_ref))
    require(pull_ref or main_ref, 'WORKFLOW_REF')
    require(env.get('GITHUB_JOB') == JOB_ID, 'JOB_ID')
    event = env.get('GITHUB_EVENT_NAME')
    require((event == 'pull_request' and pull_ref) or (event == 'push' and main_ref), 'EVENT_REF')
    run_id, attempt = env.get('GITHUB_RUN_ID', ''), env.get('GITHUB_RUN_ATTEMPT', '')
    require(bool(re.fullmatch(r'[1-9][0-9]*', run_id))
            and bool(re.fullmatch(r'[1-9][0-9]*', attempt)), 'RUN_ID')
    require(env.get('RUNNER_TEMP') == str(RUNNER_TEMP_ROOT), 'TEMP_ROOT')
    workspace = Path(env.get('GITHUB_WORKSPACE', '')).resolve()
    require(root == workspace and workspace.is_relative_to(RUNNER_WORK_ROOT)
            and workspace != RUNNER_WORK_ROOT, 'WORKSPACE')
    require(all(env.get(key) is None for key in DOCKER_OVERRIDE_ENVIRONMENT_KEYS), 'DOCKER_OVERRIDE')
    require(all(not env.get(key) for key in REMOTE_ENVIRONMENT_KEYS), 'REMOTE_CREDENTIAL_OR_URL')

    job_fingerprint = hashlib.sha256(
        (f'{REPOSITORY}|{WORKFLOW_PATH}|{env["GITHUB_WORKFLOW"]}|{workflow_ref}|'
         f'{env["GITHUB_JOB"]}').encode('utf8')
    ).hexdigest()[:10]
    project = f'silsan-py-{run_id}-{attempt}-{job_fingerprint}'
    require(len(project) <= 63 and re.fullmatch(r'[a-z0-9-]+', project), 'PROJECT_ID')
    runner_temp = Path(env['RUNNER_TEMP']).resolve()
    directory = runner_temp / project
    require(directory.parent == runner_temp and directory.name == project
            and directory.resolve(strict=False) == directory and not directory.is_symlink(), 'WORKDIR')
    identity_doc = {
        'repository': REPOSITORY,
        'workflow_path': WORKFLOW_PATH,
        'workflow_name': env['GITHUB_WORKFLOW'],
        'workflow_ref': workflow_ref,
        'job': env['GITHUB_JOB'],
        'run_id': run_id,
        'attempt': attempt,
        'project_id': project,
    }
    return project, directory, identity_doc


def config(project):
    source = tomllib.loads((ROOT / 'backend/supabase/config.toml').read_text(encoding='utf8'))
    major_version = source.get('db', {}).get('major_version')
    require(isinstance(major_version, int) and 12 <= major_version <= 99, 'DATABASE_MAJOR_VERSION')
    return f'''project_id = "{project}"
[api]
enabled = true
port = {PORTS['api']}
[db]
port = {PORTS['db']}
shadow_port = {PORTS['shadow']}
major_version = {major_version}
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
site_url = "http://127.0.0.1:{PORTS['api']}"
enable_signup = false
[auth.email]
enable_confirmations = false
'''


def repository_manifest():
    paths = sorted((ROOT / 'backend/supabase/migrations').glob('*.sql'))
    require(bool(paths), 'EMPTY_MIGRATION_MANIFEST')
    versions = []
    manifest = {}
    for path in paths:
        require(path.is_file() and not path.is_symlink(), 'MIGRATION_FILE_TYPE')
        match = MIGRATION_RE.fullmatch(path.name)
        require(match is not None, 'MIGRATION_FILENAME')
        versions.append(match.group(1))
        manifest[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    require(versions == sorted(set(versions)), 'MIGRATION_ORDER_OR_DUPLICATE')
    return manifest


def cli_path():
    cli = ROOT / 'backend/node_modules/.bin/supabase'
    require(cli.is_file(), 'CLI_NOT_INSTALLED')
    return str(cli)


def safe_start_failure_categories(result):
    """Classify known startup failures without exposing CLI output or credentials."""
    output = f'{result.stdout or ""}\n{result.stderr or ""}'
    categories = [name for name, pattern in START_FAILURE_PATTERNS if pattern.search(output)]
    return categories or ['UNCLASSIFIED']


def command(args, timeout=900):
    """Run allowlisted Docker inspection, project-network, and local CLI commands."""
    require(isinstance(args, list) and args, 'COMMAND_ARGUMENTS')
    program = Path(args[0]).name
    if program == 'docker':
        require(len(args) > 1 and args[1] in ('context', 'info', 'ps', 'inspect', 'volume', 'network'),
                'DOCKER_COMMAND')
        if args[1] == 'context':
            require(args[2:] in (['show'], ['inspect']), 'DOCKER_COMMAND')
        if args[1] == 'info':
            require(args[2:] == ['--format', '{{.ServerVersion}}'], 'DOCKER_COMMAND')
        if args[1] == 'inspect':
            require(len(args) > 2, 'DOCKER_COMMAND')
        if args[1] == 'volume':
            require(len(args) > 2 and args[2] in ('ls', 'inspect', 'rm'), 'DOCKER_COMMAND')
            if args[2] == 'ls':
                require('-q' in args, 'DOCKER_COMMAND')
        if args[1] == 'volume' and args[2] == 'rm':
            project, _, _ = identity()
            volume_names = args[3:]
            expected_volumes = {f'supabase_db_{project}', f'supabase_storage_{project}'}
            require(bool(volume_names) and len(volume_names) == len(set(volume_names))
                    and set(volume_names) <= expected_volumes, 'DOCKER_VOLUME_REMOVE')
        if args[1] == 'network':
            require(len(args) > 2 and args[2] in ('ls', 'inspect', 'create', 'rm'), 'DOCKER_COMMAND')
            if args[2] == 'ls':
                require('-q' in args, 'DOCKER_COMMAND')
        if args[1] == 'ps':
            require(args == ['docker', 'ps', '-aq']
                    or args == ['docker', 'ps', '-a', '-q'], 'DOCKER_COMMAND')
        if args[1] == 'network' and args[2] == 'create':
            project, _, _ = identity()
            expected = ['network', 'create', '--driver', 'bridge', '--internal',
                        '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
                        '--label', 'com.docker.compose.project=' + project,
                        '--label', 'com.supabase.cli.project=' + project,
                        'supabase_network_' + project]
            require(args[1:] == expected, 'DOCKER_NETWORK_CREATE')
        if args[1] == 'network' and args[2] == 'rm':
            project, _, _ = identity()
            require(args[1:] == ['network', 'rm', 'supabase_network_' + project],
                    'DOCKER_NETWORK_REMOVE')
    elif program == 'supabase':
        require(all(flag not in args for flag in ('--linked', '--db-url', '--project-ref', '--all')),
                'REMOTE_CLI_FLAG')
        require(Path(args[0]).resolve() == Path(cli_path()).resolve(), 'CLI_BINARY')
        action = args[1:3]
        expected_directory = identity()[1]
        if args[1] == '--version':
            require(args == [cli_path(), '--version'], 'VERSION_ARGUMENTS')
        else:
            workdir_index = args.index('--workdir') + 1 if '--workdir' in args else -1
            require(workdir_index >= 0 and args[workdir_index] == str(expected_directory), 'WORKDIR_ARGUMENT')
        if args[1] == 'start':
            project, _, _ = identity()
            require(args == [cli_path(), 'start', '--workdir', str(expected_directory),
                             '--exclude', EXCLUDED_SERVICES, '--network-id', network_name(project)],
                    'START_ARGUMENTS_OR_NETWORK')
        elif action == ['migration', 'up']:
            require(args == [cli_path(), 'migration', 'up', '--local', '--workdir',
                             str(expected_directory)], 'MIGRATION_ARGUMENTS')
        elif args[1] == 'stop':
            require(args == [cli_path(), 'stop', '--no-backup', '--workdir',
                             str(expected_directory)], 'STOP_ARGUMENTS')
        elif args[1] == '--version':
            pass
        else:
            require(False, 'SUPABASE_COMMAND')
    else:
        require(False, 'EXECUTABLE')
    run_options = {}
    docker_config_context = None
    if program == 'docker':
        project, _, _ = identity()
        docker_env = {key: os.environ[key] for key in SUPABASE_SAFE_ENV_KEYS if key in os.environ}
        docker_config_context = tempfile.TemporaryDirectory(
            prefix=project + '-docker-config-', dir=str(RUNNER_TEMP_ROOT))
        docker_env['DOCKER_CONFIG'] = docker_config_context.name
        run_options['env'] = docker_env
    if program == 'supabase':
        _, directory, _ = identity()
        home = directory / SUPABASE_HOME_NAME
        require(home.is_dir() and not home.is_symlink()
                and home.resolve().is_relative_to(directory.resolve()), 'SUPABASE_HOME')
        if os.name == 'posix':
            home_stat = home.stat()
            require(home_stat.st_uid == os.getuid() and stat.S_IMODE(home_stat.st_mode) == 0o700,
                    'SUPABASE_HOME_OWNER_OR_MODE')
        cli_env = {key: os.environ[key] for key in SUPABASE_SAFE_ENV_KEYS if key in os.environ}
        cli_env['HOME'] = str(home)
        cli_env['SUPABASE_HOME'] = str(home)
        cli_env['DOCKER_CONFIG'] = str(home / DOCKER_CONFIG_NAME)
        cli_env.update(SUPABASE_CHILD_ENV)
        run_options['env'] = cli_env
    try:
        result = subprocess.run(args, capture_output=True, text=True, encoding='utf8', timeout=timeout,
                                **run_options)
    finally:
        if docker_config_context is not None:
            docker_config_context.cleanup()
    if result.returncode:
        # Supabase start/status output can contain local API keys; never emit it.
        if program == 'supabase' and args[1:2] == ['start']:
            print(json.dumps({'phase': 'supabase-start-failed',
                              'exit_code': result.returncode,
                              'categories': safe_start_failure_categories(result)}), flush=True)
        raise RuntimeError('CPE_NORMAL_CI_COMMAND_FAILED:' + program)
    return result.stdout


def docker_guard():
    project, directory, _ = identity()
    require(command(['docker', 'context', 'show']).strip() == 'default', 'DOCKER_CONTEXT')
    contexts = json.loads(command(['docker', 'context', 'inspect']))
    require(len(contexts) == 1 and contexts[0]['Endpoints']['docker']['Host'] == DOCKER_ENDPOINT,
            'DOCKER_ENDPOINT')
    require(bool(command(['docker', 'info', '--format', '{{.ServerVersion}}']).strip()), 'DOCKER_UNAVAILABLE')
    return project, directory


def docker_client_env():
    """Provide the runner's psql exec calls only the job's empty Docker config."""
    project, directory, identity_doc = identity()
    assert_owner(project, directory, identity_doc)
    home = directory / SUPABASE_HOME_NAME
    docker_config = home / DOCKER_CONFIG_NAME
    require(home.is_dir() and not home.is_symlink()
            and docker_config.is_dir() and not docker_config.is_symlink(), 'DOCKER_CLIENT_HOME')
    if os.name == 'posix':
        home_stat, config_stat = home.stat(), docker_config.stat()
        require(home_stat.st_uid == os.getuid() and stat.S_IMODE(home_stat.st_mode) == 0o700
                and config_stat.st_uid == os.getuid()
                and stat.S_IMODE(config_stat.st_mode) == 0o700, 'DOCKER_CLIENT_OWNER_OR_MODE')
    require(not any(docker_config.iterdir()), 'DOCKER_CLIENT_CONFIG_NOT_EMPTY')
    child_env = {key: os.environ[key] for key in SUPABASE_SAFE_ENV_KEYS if key in os.environ}
    child_env['HOME'] = str(home)
    child_env['DOCKER_CONFIG'] = str(docker_config)
    return child_env


def inventory():
    container_ids = command(['docker', 'ps', '-aq']).split()
    containers = json.loads(command(['docker', 'inspect'] + container_ids)) if container_ids else []
    volume_names = command(['docker', 'volume', 'ls', '-q']).split()
    volumes = json.loads(command(['docker', 'volume', 'inspect'] + volume_names)) if volume_names else []
    network_ids = command(['docker', 'network', 'ls', '-q']).split()
    networks = json.loads(command(['docker', 'network', 'inspect'] + network_ids)) if network_ids else []
    return {'containers': containers, 'volumes': volumes, 'networks': networks}


def system_networks(resources):
    result = {}
    for network in resources['networks']:
        name = network.get('Name')
        if name in SYSTEM_NETWORKS:
            result[name] = network.get('Driver')
    return result


def network_name(project):
    return 'supabase_network_' + project


def assert_empty_runner(resources, code='EXISTING_RESOURCES'):
    require(not resources['containers'], code + '_CONTAINERS')
    require(not resources['volumes'], code + '_VOLUMES')
    require(system_networks(resources) == SYSTEM_NETWORKS, code + '_NETWORKS')
    require(all(n.get('Name') in SYSTEM_NETWORKS for n in resources['networks']), code + '_NETWORKS')


def assert_ports_free():
    for port in PORTS.values():
        with socket.socket() as probe:
            try:
                probe.bind(('0.0.0.0', port))
            except OSError as error:
                raise ValueError('CPE_NORMAL_CI_PORT_IN_USE') from error


def write_exclusive(path, content):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, 'w', encoding='utf8', newline='\n') as output:
        output.write(content)
        output.flush()
        os.fsync(output.fileno())


def expected_manifest(identity_doc):
    return {'identity': identity_doc, 'migrations': repository_manifest()}


def owner_doc(identity_doc):
    return {'schema': 1, 'identity': identity_doc}


def assert_owner(project, directory, identity_doc):
    _, expected_directory, expected_identity = identity()
    require(project == identity_doc.get('project_id') and directory == expected_directory
            and identity_doc == expected_identity, 'OWNER_IDENTITY')
    require(directory.parent == RUNNER_TEMP_ROOT and directory.name == project
            and directory.resolve(strict=False) == directory and not directory.is_symlink(), 'DIRECTORY_PATH')
    require(directory.is_dir(), 'DIRECTORY_MISSING')
    if os.name == 'posix':
        directory_stat = directory.stat()
        require(directory_stat.st_uid == os.getuid() and stat.S_IMODE(directory_stat.st_mode) == 0o700,
                'DIRECTORY_OWNER_OR_MODE')
    owner_path = directory / 'owner.json'
    require(owner_path.is_file() and not owner_path.is_symlink(), 'OWNER_MARKER')
    require(json.loads(owner_path.read_text(encoding='utf8')) == owner_doc(identity_doc), 'OWNER_MARKER')


def assert_directory(project, directory, identity_doc, require_copy=True):
    assert_owner(project, directory, identity_doc)
    home = directory / SUPABASE_HOME_NAME
    require(home.is_dir() and not home.is_symlink()
            and home.resolve().is_relative_to(directory.resolve()), 'SUPABASE_HOME')
    if os.name == 'posix':
        home_stat = home.stat()
        require(home_stat.st_uid == os.getuid() and stat.S_IMODE(home_stat.st_mode) == 0o700,
                'SUPABASE_HOME_OWNER_OR_MODE')
    docker_config = home / DOCKER_CONFIG_NAME
    require(docker_config.is_dir() and not docker_config.is_symlink()
            and docker_config.resolve().is_relative_to(home.resolve()), 'DOCKER_CONFIG')
    if os.name == 'posix':
        docker_config_stat = docker_config.stat()
        require(docker_config_stat.st_uid == os.getuid()
                and stat.S_IMODE(docker_config_stat.st_mode) == 0o700, 'DOCKER_CONFIG_OWNER_OR_MODE')
    require(not any(docker_config.iterdir()), 'DOCKER_CONFIG_NOT_EMPTY')
    config_path = directory / 'supabase/config.toml'
    require(config_path.is_file() and not config_path.is_symlink(), 'CONFIG_FILE')
    require(config_path.read_text(encoding='utf8') == config(project), 'CONFIGURATION')
    forbidden = (directory / '.env', directory / 'supabase/seed.sql', directory / 'supabase/functions',
                 directory / 'supabase/.temp/project-ref')
    require(all(not path.exists() and not path.is_symlink() for path in forbidden),
            'LINK_SEED_OR_FUNCTIONS')
    local_temp = directory / 'supabase/.temp'
    if local_temp.exists() or local_temp.is_symlink():
        require(local_temp.is_dir() and not local_temp.is_symlink(), 'CLI_TEMP_TYPE')
        for current, dirs, files in os.walk(local_temp, followlinks=False):
            require(all(not (Path(current) / name).is_symlink() for name in dirs + files),
                    'CLI_TEMP_SYMLINK')
            require(not any(name in FORBIDDEN_LOCAL_CLI_STATE for name in dirs + files),
                    'CLI_TEMP_REMOTE_STATE')
            require(all((Path(current) / name).is_file()
                        and (Path(current) / name).stat().st_size <= 65536 for name in files),
                    'CLI_TEMP_FILE')
    if not require_copy:
        return
    manifest_path = directory / 'manifest.json'
    require(manifest_path.is_file() and not manifest_path.is_symlink(), 'MANIFEST_FILE')
    require(json.loads(manifest_path.read_text(encoding='utf8')) == expected_manifest(identity_doc),
            'SOURCE_CHANGED')
    migration_dir = directory / 'supabase/migrations'
    files = sorted(migration_dir.glob('*.sql'))
    expected_names = list(repository_manifest())
    require([path.name for path in files] == expected_names, 'COPIED_HISTORY')
    require(all(path.is_file() and not path.is_symlink()
                and hashlib.sha256(path.read_bytes()).hexdigest()
                == json.loads(manifest_path.read_text(encoding='utf8'))['migrations'][path.name]
                for path in files), 'COPIED_HASH')
    root_entries = sorted(path.name for path in directory.iterdir())
    require(root_entries == ['manifest.json', 'owner.json', 'supabase', SUPABASE_HOME_NAME],
            'DIRECTORY_CONTENTS')
    supabase_entries = sorted(path.name for path in (directory / 'supabase').iterdir())
    require(supabase_entries in (['config.toml', 'migrations'], ['.temp', 'config.toml', 'migrations']),
            'SUPABASE_CONTENTS')


def label_owner(labels, project, kind):
    require(isinstance(labels, dict)
            and labels.get('com.supabase.cli.project') == project
            and labels.get('com.docker.compose.project') == project,
            kind + '_OWNER')


def assert_owned_resources(project, resources, directory, require_complete=True):
    for container in resources['containers']:
        label_owner(container.get('Config', {}).get('Labels') or {}, project, 'CONTAINER')
        require(container.get('Name', '').startswith('/supabase_')
                and container.get('Name', '').endswith('_' + project), 'CONTAINER_NAME')
        for mount in container.get('Mounts', []):
            require(mount.get('Type') in ('bind', 'volume', 'tmpfs'), 'MOUNT_TYPE')
            if mount.get('Type') == 'bind':
                source = Path(mount.get('Source', '')).resolve()
                require(source.is_relative_to(directory.resolve()), 'HOST_BIND_OUTSIDE_TEMP')
    expected_volumes = {f'supabase_db_{project}', f'supabase_storage_{project}'}
    for volume in resources['volumes']:
        labels = volume.get('Labels') or {}
        require(labels.get('com.supabase.cli.project') == project
                and volume.get('Name') in expected_volumes, 'VOLUME_OWNER')
    custom_networks = [n for n in resources['networks'] if n.get('Name') not in SYSTEM_NETWORKS]
    for network in custom_networks:
        labels = network.get('Labels') or {}
        require(labels.get('com.docker.compose.project') == project
                and labels.get('com.supabase.cli.project') == project, 'NETWORK_OWNER')
        require(network.get('Name') == network_name(project), 'NETWORK_NAME')
        require(network.get('Driver') == 'bridge' and network.get('Internal') is True,
                'NETWORK_ISOLATION')
        require(network.get('Options') == NETWORK_OPTIONS, 'NETWORK_BIND_ADDRESS')
    require(len(custom_networks) <= 1, 'NETWORK_COUNT')
    if require_complete:
        require(bool(resources['containers']), 'PROJECT_CONTAINERS_MISSING')
        require(bool(resources['volumes']), 'PROJECT_VOLUMES_MISSING')
        require(len(custom_networks) == 1, 'PROJECT_NETWORK_MISSING')
    require(system_networks(resources) == SYSTEM_NETWORKS, 'SYSTEM_NETWORKS_CHANGED')
    return custom_networks


def cli_version():
    lock = json.loads((ROOT / 'backend/package-lock.json').read_text(encoding='utf8'))
    locked = lock.get('packages', {}).get('node_modules/supabase', {}).get('version')
    require(isinstance(locked, str) and re.fullmatch(r'\d+\.\d+\.\d+', locked), 'LOCKED_CLI_VERSION')
    actual = command([cli_path(), '--version']).strip()
    require(actual == locked, 'CLI_VERSION')
    return locked


def prepare():
    project, directory, identity_doc = identity()
    docker_guard()
    initial = inventory()
    assert_empty_runner(initial)
    assert_ports_free()
    manifest = expected_manifest(identity_doc)
    created_inode = None
    start_attempted = False
    try:
        directory.mkdir(mode=0o700, parents=False, exist_ok=False)
        created = directory.stat()
        created_inode = (created.st_dev, created.st_ino)
        write_exclusive(directory / 'owner.json', json.dumps(owner_doc(identity_doc), sort_keys=True))
        home = directory / SUPABASE_HOME_NAME
        home.mkdir(mode=0o700)
        (home / DOCKER_CONFIG_NAME).mkdir(mode=0o700)
        supabase_dir = directory / 'supabase'
        supabase_dir.mkdir(mode=0o700)
        migration_dir = supabase_dir / 'migrations'
        migration_dir.mkdir(mode=0o700)
        write_exclusive(supabase_dir / 'config.toml', config(project))
        for name, digest in manifest['migrations'].items():
            source = ROOT / 'backend/supabase/migrations' / name
            destination = migration_dir / name
            content = source.read_bytes()
            require(hashlib.sha256(content).hexdigest() == digest, 'SOURCE_CHANGED')
            fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
        write_exclusive(directory / 'manifest.json', json.dumps(manifest, sort_keys=True))
        assert_directory(project, directory, identity_doc)
        version = cli_version()
        cli = cli_path()
        command(['docker', 'network', 'create', '--driver', 'bridge', '--internal',
                 '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
                 '--label', 'com.docker.compose.project=' + project,
                 '--label', 'com.supabase.cli.project=' + project,
                 network_name(project)])
        assert_owned_resources(project, inventory(), directory, require_complete=False)
        start_attempted = True
        command([cli, 'start', '--workdir', str(directory), '--exclude', EXCLUDED_SERVICES,
                 '--network-id', network_name(project)], timeout=1200)
        container = verify_target()
        command([cli, 'migration', 'up', '--local', '--workdir', str(directory)], timeout=1800)
        container = verify_target()
        print(json.dumps({'phase': 'prepared', 'project': project, 'cli_version': version,
                          'migration_files': len(manifest['migrations']), 'db_container': container}), flush=True)
    except Exception:
        if created_inode is not None and not start_attempted and directory.exists():
            try:
                assert_empty_runner(inventory(), 'PRESTART_CLEANUP')
                safe_remove_created_directory(project, directory, identity_doc, created_inode)
            except Exception:
                # Preserve the original failure and leave uncertain resources untouched.
                print(json.dumps({'phase': 'prestart-cleanup', 'project': project,
                                  'result': 'failed-closed'}), flush=True)
        raise


def verify_target():
    project, directory, identity_doc = identity()
    docker_guard()
    assert_directory(project, directory, identity_doc)
    resources = inventory()
    networks = assert_owned_resources(project, resources, directory)
    containers = {container['Name']: container for container in resources['containers']}
    db_name, api_name = f'/supabase_db_{project}', f'/supabase_kong_{project}'
    require(db_name in containers and api_name in containers, 'REQUIRED_CONTAINERS')
    for name, internal_port, host_port in ((db_name, '5432/tcp', str(PORTS['db'])),
                                           (api_name, '8000/tcp', str(PORTS['api']))):
        container = containers[name]
        require(container.get('State', {}).get('Running') is True, 'CONTAINER_NOT_RUNNING')
        published = container.get('NetworkSettings', {}).get('Ports', {}).get(internal_port) or []
        require(len(published) == 1 and published[0].get('HostPort') == host_port
                and published[0].get('HostIp') == '127.0.0.1', 'CONTAINER_PORT_OR_BIND')
    allowed_bindings = {str(PORTS['api']), str(PORTS['db'])}
    for container in resources['containers']:
        name = container.get('Name', '')
        for bindings in (container.get('NetworkSettings', {}).get('Ports') or {}).values():
            for binding in bindings or []:
                require(binding.get('HostPort') in allowed_bindings, 'UNEXPECTED_HOST_PORT')
                require(binding.get('HostIp') == '127.0.0.1', 'NON_LOOPBACK_BIND')
                require(name in (db_name, api_name), 'UNEXPECTED_PUBLISHED_CONTAINER')
    db = containers[db_name]
    volume_name = f'supabase_db_{project}'
    require(any(mount.get('Type') == 'volume' and mount.get('Name') == volume_name
                and mount.get('Destination') == '/var/lib/postgresql/data'
                for mount in db.get('Mounts', [])), 'DATABASE_VOLUME_MOUNT')
    volumes = {volume.get('Name'): volume for volume in resources['volumes']}
    require(volume_name in volumes, 'DATABASE_VOLUME_MISSING')
    require((volumes[volume_name].get('Labels') or {}).get('com.supabase.cli.project') == project,
            'DATABASE_VOLUME_OWNER')
    network_names = {network.get('Name') for network in networks}
    require(network_names == {network_name(project)}, 'CONTAINER_NETWORK_SET')
    for container in resources['containers']:
        attached = set(container.get('NetworkSettings', {}).get('Networks', {}))
        require(attached == network_names, 'CONTAINER_NETWORK')
    return db_name.lstrip('/')


def safe_remove_directory(project, directory, identity_doc):
    assert_owner(project, directory, identity_doc)
    for current, dirs, files in os.walk(directory, followlinks=False):
        for name in dirs + files:
            require(not (Path(current) / name).is_symlink(), 'DIRECTORY_SYMLINK')
    shutil.rmtree(directory)
    require(not directory.exists() and not directory.is_symlink(), 'DIRECTORY_REMAINS')


def safe_remove_created_directory(project, directory, identity_doc, created_inode):
    """Remove a pre-start directory only when this process can prove its inode."""
    _, expected_directory, expected_identity = identity()
    require(project == identity_doc.get('project_id') and directory == expected_directory
            and identity_doc == expected_identity, 'OWNER_IDENTITY')
    require(directory.parent == RUNNER_TEMP_ROOT and directory.name == project
            and directory.resolve(strict=False) == directory and not directory.is_symlink(), 'DIRECTORY_PATH')
    directory_stat = directory.stat()
    require((directory_stat.st_dev, directory_stat.st_ino) == created_inode,
            'DIRECTORY_IDENTITY_CHANGED')
    if os.name == 'posix':
        require(directory_stat.st_uid == os.getuid() and stat.S_IMODE(directory_stat.st_mode) == 0o700,
                'DIRECTORY_OWNER_OR_MODE')
    for current, dirs, files in os.walk(directory, followlinks=False):
        for name in dirs + files:
            require(not (Path(current) / name).is_symlink(), 'DIRECTORY_SYMLINK')
    shutil.rmtree(directory)
    require(not directory.exists() and not directory.is_symlink(), 'DIRECTORY_REMAINS')


def stop():
    project, directory, identity_doc = identity()
    docker_guard()
    resources = inventory()
    if not directory.exists():
        assert_empty_runner(resources, 'CLEANUP_WITHOUT_OWNER')
        print(json.dumps({'phase': 'cleanup', 'project': project, 'already_absent': True}), flush=True)
        return
    assert_owner(project, directory, identity_doc)
    resource_count = sum(len(resources[key]) for key in ('containers', 'volumes'))
    custom_networks = [n for n in resources['networks'] if n.get('Name') not in SYSTEM_NETWORKS]
    resource_count += len(custom_networks)
    if not resource_count:
        assert_empty_runner(resources, 'CLEANUP_WITHOUT_RESOURCES')
        safe_remove_directory(project, directory, identity_doc)
        print(json.dumps({'phase': 'cleanup', 'project': project, 'containers': 0,
                          'volumes': 0, 'custom_networks': 0, 'directory_removed': True,
                          'resources_absent': True}), flush=True)
        return
    assert_directory(project, directory, identity_doc, require_copy=True)
    assert_owned_resources(project, resources, directory, require_complete=False)
    if resources['containers']:
        command([cli_path(), 'stop', '--no-backup', '--workdir', str(directory)], timeout=180)
    resources = inventory()
    assert_owned_resources(project, resources, directory, require_complete=False)
    require(not resources['containers'], 'CLEANUP_PROJECT_CONTAINERS_REMAIN')
    if resources['volumes']:
        # `stop --no-backup` should delete project data volumes. If any remain,
        # remove only exact allowlisted names with verified project labels; never prune.
        volume_names = sorted(volume['Name'] for volume in resources['volumes'])
        command(['docker', 'volume', 'rm', *volume_names])
    resources = inventory()
    assert_owned_resources(project, resources, directory, require_complete=False)
    require(not resources['containers'] and not resources['volumes'], 'CLEANUP_PROJECT_RESOURCES_REMAIN')
    custom_networks = [n for n in resources['networks'] if n.get('Name') not in SYSTEM_NETWORKS]
    if custom_networks:
        command(['docker', 'network', 'rm', network_name(project)])
    resources = inventory()
    assert_empty_runner(resources, 'CLEANUP_NOT_EMPTY')
    safe_remove_directory(project, directory, identity_doc)
    print(json.dumps({'phase': 'cleanup', 'project': project, 'containers': 0,
                      'volumes': 0, 'custom_networks': 0, 'directory_removed': True}), flush=True)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('prepare', 'stop'))
    action = parser.parse_args().action
    prepare() if action == 'prepare' else stop()
