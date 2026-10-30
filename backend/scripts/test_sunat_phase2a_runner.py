"""Unit coverage of preflight and SQL composition; no database connections."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import tomllib
from types import SimpleNamespace
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    'sunat_phase2a_runner', Path(__file__).with_name('test-sunat-phase2a.py'))
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)
CI_SPEC = importlib.util.spec_from_file_location(
    'sunat_phase2a_ci', Path(__file__).with_name('sunat_phase2a_ci.py'))
ci = importlib.util.module_from_spec(CI_SPEC)
CI_SPEC.loader.exec_module(ci)
NORMAL_CI_SPEC = importlib.util.spec_from_file_location(
    'sunat_phase2a_normal_ci', Path(__file__).with_name('sunat_phase2a_normal_ci.py'))
normal_ci = importlib.util.module_from_spec(NORMAL_CI_SPEC)
sys.modules[NORMAL_CI_SPEC.name] = normal_ci
NORMAL_CI_SPEC.loader.exec_module(normal_ci)


class TransactionalRunnerTests(unittest.TestCase):
    def setUp(self):
        self.files = sorted(p.name.split('_')[0]
                            for p in runner.MIGRATIONS[0].parent.glob('*.sql'))
        self.candidate_start = runner.candidate_start(self.files)
        self.base = self.files[:self.candidate_start]

    def test_exact_candidate_versions_and_base(self):
        self.assertEqual(runner.VERSIONS, ('20261023061225', '20261023135019'))
        self.assertEqual(tuple(self.files[self.candidate_start:self.candidate_start + len(runner.VERSIONS)]),
                         runner.VERSIONS)
        self.assertGreater(len(self.files), self.candidate_start + len(runner.VERSIONS))

    def test_accepts_only_expected_history_for_each_mode(self):
        runner.validate_history(self.base, self.files, True)
        runner.validate_history(self.files, self.files, False)

    def test_rejects_unexpected_transactional_histories(self):
        histories = [self.base[:-1], self.base + [runner.VERSIONS[0]],
                     self.base + [runner.VERSIONS[1]], self.files,
                     self.base + ['20990101000000'], self.base + [self.base[-1]],
                     list(reversed(self.base)), ['19000101000000'] + self.base[1:]]
        for history in histories:
            with self.subTest(history_size=len(history)):
                with self.assertRaisesRegex(ValueError, 'CPE_TEST_MIGRATION_HISTORY_MISMATCH'):
                    runner.validate_history(history, self.files, True)

    def test_rejects_unexpected_normal_histories(self):
        histories = [self.base, self.files[:-1], self.files + ['20990101000000'],
                     self.files + [self.files[-1]], list(reversed(self.files)),
                     ['19000101000000'] + self.files[1:]]
        for history in histories:
            with self.subTest(history_size=len(history)):
                with self.assertRaisesRegex(ValueError, 'CPE_TEST_MIGRATION_HISTORY_MISMATCH'):
                    runner.validate_history(history, self.files, False)

    def test_rejects_unexpected_repository_manifest(self):
        manifests = [self.files[:-1], self.files + ['20990101000000'],
                     self.files[:-1] + [self.files[-2]], list(reversed(self.files)),
                     self.base + [runner.VERSIONS[0], '20261023135020']]
        for files in manifests:
            with self.subTest(manifest_size=len(files)):
                with self.assertRaisesRegex(ValueError, 'CPE_TEST_MIGRATION_FILES_MISMATCH'):
                    runner.validate_history(self.base, files, True)

    def test_transactional_script_orders_both_candidates_before_fixture(self):
        before = [hashlib.sha256(p.read_bytes()).hexdigest() for p in runner.MIGRATIONS]
        source = runner.serial_script(True)
        first, second = [runner.candidate_sql(p) for p in runner.MIGRATIONS]
        self.assertTrue(source.startswith('begin;\n'))
        self.assertTrue(source.endswith('\nrollback;'))
        self.assertLess(source.index(first), source.index(second))
        self.assertLess(source.index(second), source.index(runner.SUITE.read_text(encoding='utf8')))
        self.assertEqual(source.count(first), 1)
        self.assertEqual(source.count(second), 1)
        self.assertIn(runner.transaction_probe('candidate-1'), source)
        self.assertIn(runner.transaction_probe('candidate-2', verify_helpers=True), source)
        self.assertIn(runner.transaction_probe('serial', verify_helpers=True), source)
        self.assertIn('txid_current()', source)
        self.assertIn('pg_backend_pid()', source)
        controls = re.findall(r'^\s*(begin|commit|rollback)\s*;', source, re.I | re.M)
        self.assertEqual([c.lower() for c in controls], ['begin', 'rollback'])
        self.assertIn('alter function electronic_private.date_value', second.lower())
        self.assertIn('stable', second.lower())
        self.assertEqual(before, [hashlib.sha256(p.read_bytes()).hexdigest()
                                  for p in runner.MIGRATIONS])

    def test_normal_script_does_not_compile_candidates(self):
        with patch.object(runner, 'candidate_sql', side_effect=AssertionError('unexpected DDL')):
            self.assertEqual(runner.serial_script(False), 'begin;\n\n'
                             + runner.SUITE.read_text(encoding='utf8') + '\nrollback;')

    def test_strips_only_balanced_outer_wrapper(self):
        with patch.object(Path, 'read_text', return_value='-- comment\nBEGIN;\nselect 1;\nCOMMIT;\n-- end\n'):
            self.assertEqual(runner.candidate_sql(runner.MIGRATIONS[1]),
                             '-- comment\nselect 1;\n-- end\n')

    def test_rejects_unbalanced_or_internal_transaction_control(self):
        sources = ['begin;\nselect 1;', 'begin;', 'select 1;\ncommit;',
                   'begin;\nselect 1;\ncommit;',
                   'begin;\ncommit;\nselect 1;\ncommit;', 'select 1;\nrollback;',
                   'start transaction;\nselect 1;', 'select 1;\nend;', 'abort;']
        for source in sources:
            with self.subTest(source=source):
                with patch.object(Path, 'read_text', return_value=source):
                    with self.assertRaisesRegex(ValueError, 'CPE_TEST_CANDIDATE_TRANSACTION_CONTROL'):
                        runner.candidate_sql(runner.MIGRATIONS[0])
        for source in ['select 1;', 'begin;\nselect 1;', 'select 1;\ncommit;',
                       'begin;\ncommit;\nselect 1;\ncommit;']:
            with self.subTest(candidate='second', source=source):
                with patch.object(Path, 'read_text', return_value=source):
                    with self.assertRaisesRegex(ValueError, 'CPE_TEST_CANDIDATE_TRANSACTION_CONTROL'):
                        runner.candidate_sql(runner.MIGRATIONS[1])

    def test_preserves_plpgsql_body(self):
        source = 'create function f() returns void language plpgsql as $$\nbegin\nnull;\nend $$;\n'
        with patch.object(Path, 'read_text', return_value=source):
            self.assertEqual(runner.candidate_sql(runner.MIGRATIONS[0]), source)

    def test_rejects_empty_candidate(self):
        with patch.object(Path, 'read_text', return_value='-- comment\n'):
            with self.assertRaisesRegex(ValueError, 'CPE_TEST_EMPTY_CANDIDATE'):
                runner.candidate_sql(runner.MIGRATIONS[0])

    def test_rejects_unapproved_candidate_path(self):
        with self.assertRaisesRegex(ValueError, 'CPE_TEST_UNEXPECTED_CANDIDATE'):
            runner.candidate_sql(Path('unexpected.sql'))

    def test_serial_requires_all_assertions_and_postgres_stage_markers(self):
        notices = ''.join(f'NOTICE:  PASS: case-{n}\n' for n in range(97))
        markers = ''.join(f'NOTICE:  CPE_TRANSACTIONAL:{stage}\n'
                          for stage in ('candidate-1', 'candidate-2', 'serial'))
        with patch.object(runner, 'sql', return_value=SimpleNamespace(stderr=notices + markers)), \
                patch.object(runner, 'check') as checked:
            runner.serial(True)
            self.assertEqual(checked.call_count, 97)
        for stderr in (notices, notices + markers.replace('candidate-2', 'candidate-1'),
                       notices.replace('NOTICE:  PASS: case-0\n', '') + markers):
            with self.subTest(stderr_length=len(stderr)), \
                    patch.object(runner, 'sql', return_value=SimpleNamespace(stderr=stderr)):
                with self.assertRaises(AssertionError):
                    runner.serial(True)


class HostedCIGuardTests(unittest.TestCase):
    def setUp(self):
        self.env = dict(CI='true', GITHUB_ACTIONS='true', RUNNER_OS='Linux',
                        RUNNER_ENVIRONMENT='github-hosted', GITHUB_REPOSITORY='Diegx2801/silsanplex',
                        GITHUB_RUN_ID='123456', GITHUB_RUN_ATTEMPT='2',
                        RUNNER_TEMP='/home/runner/work/_temp',
                        GITHUB_WORKSPACE='/home/runner/work/silsanplex/silsanplex')
        self.root = Path(self.env['GITHUB_WORKSPACE']).resolve()

    def test_derives_exclusive_destination_from_hosted_identity(self):
        with patch.dict(os.environ, self.env, clear=True), patch.object(ci.sys, 'platform', 'linux'), \
                patch.object(ci, 'ROOT', self.root):
            project, directory = ci.context()
            self.assertEqual(project, 'silsan-cpe-tx-123456-2')
            self.assertEqual(directory.parent, Path(self.env['RUNNER_TEMP']).resolve())
            self.assertEqual(directory.name, project)

    def test_rejects_local_self_hosted_foreign_or_redirected_context(self):
        changes = [dict(CI='false'), dict(GITHUB_ACTIONS='false'), dict(RUNNER_OS='Windows'),
                   dict(RUNNER_ENVIRONMENT='self-hosted'), dict(GITHUB_REPOSITORY='other/repo'),
                   dict(GITHUB_RUN_ID='../backend'), dict(GITHUB_RUN_ATTEMPT='0'),
                   dict(RUNNER_TEMP='/tmp/backend'), dict(GITHUB_WORKSPACE='/tmp/backend'),
                   dict(DOCKER_HOST='tcp://production:2375'), dict(DOCKER_CONTEXT='remote')]
        for change in changes:
            with self.subTest(change=change), patch.dict(os.environ, {**self.env, **change}, clear=True), \
                    patch.object(ci.sys, 'platform', 'linux'), patch.object(ci, 'ROOT', self.root):
                with self.assertRaisesRegex(ValueError, 'CPE_CI_'):
                    ci.context()

    def test_local_prepare_rejected_before_any_command(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(ci, 'command') as command:
            with self.assertRaises(ValueError):
                ci.prepare()
            command.assert_not_called()

    def test_preexisting_container_or_volume_aborts_preparation(self):
        for containers, volumes in [('existing-container', ''), ('', 'existing-volume')]:
            with self.subTest(containers=containers, volumes=volumes), \
                    patch.object(ci, 'context', return_value=('unused', Path('never-created'))), \
                    patch.object(ci, 'docker_guard'), \
                    patch.object(ci, 'command', side_effect=[containers, volumes]):
                with self.assertRaisesRegex(ValueError, 'CPE_CI_EXISTING_'):
                    ci.prepare()

    def test_rejects_remote_docker_context(self):
        with patch.object(ci, 'command', return_value=json.dumps([
                {'Endpoints': {'docker': {'Host': 'tcp://remote:2375'}}}])):
            with self.assertRaisesRegex(ValueError, 'CPE_CI_DOCKER_ENDPOINT'):
                ci.docker_guard()

    def test_preparation_copies_only_pre_candidate_history_without_reset_or_repo_changes(self):
        manifest = ci.repository_manifest()
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / 'unique-job'
            observed = []

            def command(args):
                observed.append(args)
                return ''

            with patch.object(ci, 'context', return_value=('unique-job', directory)), \
                    patch.object(ci, 'docker_guard'), patch.object(ci, 'command', side_effect=command), \
                    patch.object(ci, 'verify_target', return_value='verified'), patch.object(ci.socket, 'socket'), \
                    patch('builtins.print'):
                ci.prepare()
                ci.verify_copy('unique-job', directory)
            self.assertEqual(len(list((directory / 'supabase/migrations').iterdir())),
                             len(ci.pre_candidate_migrations(manifest)))
            self.assertEqual(ci.repository_manifest(), manifest)
            cli_commands = [args[1:] for args in observed if args[0] != 'docker']
            self.assertEqual(len(cli_commands), 2)
            self.assertEqual(cli_commands[0][0], 'start')
            self.assertEqual(cli_commands[1][:3], ['migration', 'up', '--local'])
            self.assertNotIn('reset', str(observed))
            self.assertNotIn('--linked', str(observed))
            self.assertIn('enabled = false\nsql_paths = []', ci.config('unique-job'))
            configuration = tomllib.loads(ci.config('unique-job'))
            self.assertEqual(configuration['project_id'], 'unique-job')
            self.assertEqual(configuration['api']['port'], 59121)
            self.assertEqual(configuration['db']['port'], 59122)
            self.assertEqual(configuration['db']['major_version'], 17)
            self.assertFalse(configuration['db']['seed']['enabled'])
            copied = next((directory / 'supabase/migrations').iterdir())
            copied.write_text('-- changed test copy', encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'CPE_CI_COPIED_HASH'):
                ci.verify_copy('unique-job', directory)

    def test_candidate_hash_or_manifest_drift_rejected(self):
        with patch.object(ci, 'CANDIDATE_HASHES', {name: '0' * 64 for name in ci.CANDIDATE_HASHES}):
            with self.assertRaisesRegex(ValueError, 'CPE_CI_CANDIDATE_HASH'):
                ci.repository_manifest()

    def test_target_requires_project_ports_and_real_volume(self):
        project = 'silsan-cpe-tx-123456-2'
        labels = {'com.supabase.cli.project': project, 'com.docker.compose.project': project}
        containers = [dict(Name=f'/supabase_db_{project}', Config={'Labels': labels},
                           State={'Running': True}, NetworkSettings={'Ports': {'5432/tcp': [{'HostPort': '59122'}]}},
                           Mounts=[dict(Type='volume', Name=f'supabase_db_{project}', Destination='/var/lib/postgresql/data')]),
                      dict(Name=f'/supabase_kong_{project}', Config={'Labels': labels},
                           State={'Running': True}, NetworkSettings={'Ports': {'8000/tcp': [{'HostPort': '59121'}]}})]
        volumes = [dict(Name=f'supabase_db_{project}', Labels={'com.supabase.cli.project': project})]
        for defect in ('none', 'project', 'port', 'mount', 'volume', 'missing'):
            values = json.loads(json.dumps(containers))
            disks = json.loads(json.dumps(volumes))
            if defect == 'project':
                values[0]['Config']['Labels']['com.supabase.cli.project'] = 'backend'
            elif defect == 'port':
                values[0]['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort'] = '54322'
            elif defect == 'mount':
                values[0]['Mounts'][0]['Name'] = 'supabase_db_backend'
            elif defect == 'volume':
                disks[0]['Labels']['com.supabase.cli.project'] = 'backend'
            elif defect == 'missing':
                values.pop()

            def command(args):
                if args[1:3] == ['ps', '-aq']:
                    return 'db\nkong'
                if args[1] == 'inspect':
                    return json.dumps(values)
                if args[1:3] == ['volume', 'ls']:
                    return 'db-volume'
                return json.dumps(disks)

            with self.subTest(defect=defect), \
                    patch.object(ci, 'context', return_value=(project, Path('verified-temp'))), \
                    patch.object(ci, 'docker_guard'), patch.object(ci, 'verify_copy'), \
                    patch.object(ci, 'command', side_effect=command):
                if defect == 'none':
                    self.assertEqual(ci.verify_target(), f'supabase_db_{project}')
                else:
                    with self.assertRaisesRegex(ValueError, 'CPE_CI_'):
                        ci.verify_target()

    def test_residual_candidate_objects_or_billing_permissions_fail(self):
        for field in ('schemas', 'relations', 'rpcs', 'permissions'):
            result = dict(schemas=0, relations=0, rpcs=0, permissions=0)
            with patch.object(runner, 'read', return_value=result):
                self.assertEqual(ci.absent_candidates(runner), result)
                result[field] = 1
                with self.assertRaisesRegex(ValueError, 'CPE_CI_RESIDUAL_FISCAL_OBJECTS'):
                    ci.absent_candidates(runner)

    def test_schema_dump_normalizes_only_random_restrict_keys(self):
        source = '\\restrict random\ncreate table t(id int);\ngrant select on t to a;\n\\unrestrict random\n'
        self.assertEqual(ci.normalize_dump(source), 'create table t(id int);\ngrant select on t to a;')

    def test_cli_error_does_not_log_secret_output(self):
        with patch.object(ci.subprocess, 'run', return_value=subprocess.CompletedProcess(
                ['supabase'], 1, stdout='fake-secret', stderr='fake-secret')):
            with self.assertRaisesRegex(RuntimeError, '^CPE_CI_COMMAND_FAILED: supabase$'):
                ci.command(['supabase', 'start'])

    def test_cleanup_handles_partial_startup_without_health_or_deleting_volumes(self):
        with tempfile.TemporaryDirectory() as temporary, \
                patch.object(ci, 'context', return_value=('unique-job', Path(temporary))), \
                patch.object(ci, 'docker_guard'), patch.object(ci, 'verify_copy'), \
                patch.object(ci, 'owned_resources', return_value=([{'stopped': True}], [])), \
                patch.object(ci, 'command') as command:
            ci.stop()
            args = command.call_args.args[0]
            self.assertEqual(args[1:], ['stop', '--workdir', temporary])
            self.assertEqual(command.call_args.kwargs, {'timeout': 120})
            self.assertNotIn('--all', args)
            self.assertNotIn('--no-backup', args)

    def test_cleanup_refuses_foreign_resources(self):
        with tempfile.TemporaryDirectory() as temporary, \
                patch.object(ci, 'context', return_value=('unique-job', Path(temporary))), \
                patch.object(ci, 'docker_guard'), patch.object(ci, 'verify_copy'), \
                patch.object(ci, 'owned_resources', side_effect=ValueError('CPE_CI_CONTAINER_PROJECT')), \
                patch.object(ci, 'command') as command:
            with self.assertRaisesRegex(ValueError, 'CPE_CI_CONTAINER_PROJECT'):
                ci.stop()
            command.assert_not_called()

    def test_rollback_evidence_requires_exact_equality_for_every_category(self):
        baseline = dict(schema='schema-hash', security={'acl': 'acl-hash'},
                        rows={'table': ['row-hash']}, candidates={'relations': 0},
                        manifest={'migration': 'original-hash'},
                        history=sorted(p.name.split('_')[0]
                                       for p in runner.MIGRATIONS[0].parent.glob('*.sql'))[:runner.candidate_start(
                                           sorted(p.name.split('_')[0]
                                                  for p in runner.MIGRATIONS[0].parent.glob('*.sql')))])
        for changed in (None, *baseline.keys()):
            after = {**baseline}
            if changed:
                after[changed] = 'unexpected-change'
            fake_ci = SimpleNamespace(verify_target=lambda: 'verified-ci-only',
                                      snapshot=unittest.mock.Mock(side_effect=[baseline, after]))
            with self.subTest(changed=changed), patch.object(runner, 'CONTAINER', runner.CONTAINER), \
                    patch.object(runner, 'CHECKS', []), patch('builtins.print'), \
                    patch.object(runner, 'sql', return_value=SimpleNamespace(stdout='postgres|5432\n')), \
                    patch.object(runner, 'serial') as serial:
                if changed:
                    with self.assertRaises(AssertionError):
                        runner.ci_transactional(fake_ci)
                else:
                    runner.ci_transactional(fake_ci)
                serial.assert_called_once_with(True)
                self.assertEqual(fake_ci.snapshot.call_count, 2)

    def test_rollback_snapshot_still_checked_after_sql_failure(self):
        baseline = dict(schema='schema-hash', security={}, rows={}, candidates={}, manifest={},
                        history=sorted(p.name.split('_')[0]
                                       for p in runner.MIGRATIONS[0].parent.glob('*.sql'))[:runner.candidate_start(
                                           sorted(p.name.split('_')[0]
                                                  for p in runner.MIGRATIONS[0].parent.glob('*.sql')))])
        fake_ci = SimpleNamespace(verify_target=lambda: 'verified-ci-only',
                                  snapshot=unittest.mock.Mock(return_value=baseline))
        with patch.object(runner, 'CONTAINER', runner.CONTAINER), patch.object(runner, 'CHECKS', []), \
                patch('builtins.print'), \
                patch.object(runner, 'sql', return_value=SimpleNamespace(stdout='postgres|5432')), \
                patch.object(runner, 'serial', side_effect=RuntimeError('SQL failure')):
            with self.assertRaisesRegex(RuntimeError, 'SQL failure'):
                runner.ci_transactional(fake_ci)
            self.assertEqual(fake_ci.snapshot.call_count, 2)


class NormalCIIdentityTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix='silsan-normal-ci-test-')
        self.addCleanup(self.scratch.cleanup)
        self.base = Path(self.scratch.name).resolve()
        self.runner_temp = self.base / 'runner-temp'
        self.runner_temp.mkdir()
        self.runner_work = self.base / 'runner-work'
        self.workspace = self.runner_work / 'silsanplex' / 'silsanplex'
        self.workspace.mkdir(parents=True)
        self.env = {
            'CI': 'true', 'GITHUB_ACTIONS': 'true', 'RUNNER_OS': 'Linux',
            'RUNNER_ENVIRONMENT': 'github-hosted', 'GITHUB_REPOSITORY': 'Diegx2801/silsanplex',
            'GITHUB_WORKFLOW': 'Flujos E2E',
            'GITHUB_WORKFLOW_REF': 'Diegx2801/silsanplex/.github/workflows/inventory-e2e.yml@refs/pull/72/merge',
            'GITHUB_JOB': 'sunat-python-normal', 'GITHUB_EVENT_NAME': 'pull_request',
            'GITHUB_RUN_ID': '123456', 'GITHUB_RUN_ATTEMPT': '2',
            'RUNNER_TEMP': str(self.runner_temp), 'GITHUB_WORKSPACE': str(self.workspace),
        }
        self.identity = {
            'repository': 'Diegx2801/silsanplex',
            'workflow_path': '.github/workflows/inventory-e2e.yml',
            'workflow_name': 'Flujos E2E',
            'workflow_ref': self.env['GITHUB_WORKFLOW_REF'],
            'job': 'sunat-python-normal', 'run_id': '123456', 'attempt': '2',
            'project_id': 'silsan-py-test-project',
        }
        self.project = self.identity['project_id']
        self.directory = self.runner_temp / self.project

    def fixed_target(self):
        return self.project, self.directory, self.identity

    @staticmethod
    def empty_inventory():
        return {'containers': [], 'volumes': [], 'networks': [
            {'Name': name, 'Driver': driver}
            for name, driver in normal_ci.SYSTEM_NETWORKS.items()]}

    def owned_inventory(self, include_db=True, include_kong=True, include_volume=True,
                        include_network=True):
        labels = {'com.supabase.cli.project': self.project,
                  'com.docker.compose.project': self.project}
        network_name = f'supabase_network_{self.project}'
        containers = []
        if include_db:
            containers.append({
                'Name': f'/supabase_db_{self.project}',
                'Config': {'Labels': labels}, 'State': {'Running': True},
                'NetworkSettings': {'Ports': {'5432/tcp': [{'HostIp': '127.0.0.1',
                                                             'HostPort': str(normal_ci.PORTS['db'])}]},
                                    'Networks': {network_name: {}}},
                'Mounts': [{'Type': 'volume', 'Name': f'supabase_db_{self.project}',
                            'Destination': '/var/lib/postgresql/data'}],
            })
        if include_kong:
            containers.append({
                'Name': f'/supabase_kong_{self.project}',
                'Config': {'Labels': labels}, 'State': {'Running': True},
                'NetworkSettings': {'Ports': {'8000/tcp': [{'HostIp': '127.0.0.1',
                                                             'HostPort': str(normal_ci.PORTS['api'])}]},
                                    'Networks': {network_name: {}}},
                'Mounts': [],
            })
        volumes = ([{'Name': f'supabase_db_{self.project}',
                     'Labels': {'com.supabase.cli.project': self.project}}]
                   if include_volume else [])
        networks = [{'Name': name, 'Driver': driver}
                    for name, driver in normal_ci.SYSTEM_NETWORKS.items()]
        if include_network:
            networks.append({'Name': network_name, 'Driver': 'bridge', 'Internal': True,
                             'Options': dict(normal_ci.NETWORK_OPTIONS), 'Labels': labels})
        return {'containers': containers, 'volumes': volumes, 'networks': networks}

    def test_identity_uses_hosted_workflow_run_attempt_and_job(self):
        with patch.dict(os.environ, self.env, clear=True), \
                patch.object(normal_ci.sys, 'platform', 'linux'), \
                patch.object(normal_ci, 'ROOT', self.workspace), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'RUNNER_WORK_ROOT', self.runner_work):
            project, directory, identity = normal_ci.identity()
            self.assertEqual(directory.parent, self.runner_temp)
            self.assertEqual(directory.name, project)
            self.assertEqual(identity['workflow_path'], normal_ci.WORKFLOW_PATH)
            self.assertEqual(identity['job'], normal_ci.JOB_ID)
            self.assertRegex(project, r'^silsan-py-123456-2-[a-f0-9]{10}$')
            changed = {**self.env, 'GITHUB_RUN_ATTEMPT': '3'}
            with patch.dict(os.environ, changed, clear=True):
                other_project, _, _ = normal_ci.identity()
            self.assertNotEqual(project, other_project)

    def test_workflow_runs_normal_runner_and_gates_existing_required_fiscal_check(self):
        workflow = (normal_ci.ROOT / '.github/workflows/inventory-e2e.yml').read_text(encoding='utf8')
        normal_match = re.search(r'(?ms)^  sunat-python-normal:\n(.*?)(?=^  [a-z0-9-]+:|\Z)', workflow)
        fiscal_match = re.search(r'(?ms)^  sunat-fiscal-integration:\n(.*?)(?=^  [a-z0-9-]+:|\Z)', workflow)
        self.assertIsNotNone(normal_match)
        self.assertIsNotNone(fiscal_match)
        normal_job, fiscal_job = normal_match.group(1), fiscal_match.group(1)
        for required in (
            'name: SUNAT runner Python normal — concurrencia PostgreSQL aislada',
            'runs-on: ubuntu-24.04',
            'contents: read',
            'persist-credentials: false',
            'backend/scripts/sunat_phase2a_normal_ci.py prepare',
            'backend/scripts/test-sunat-phase2a.py --ci-normal',
            'if: always()',
            'backend/scripts/sunat_phase2a_normal_ci.py stop',
        ):
            self.assertIn(required, normal_job)
        self.assertIn('needs: sunat-python-normal', fiscal_job)
        self.assertIn('if: ${{ always() }}', fiscal_job)
        self.assertIn('needs.sunat-python-normal.result', fiscal_job)
        self.assertIn('if [ "${{ needs.sunat-python-normal.result }}" != "success" ]', fiscal_job)
        for existing_check in (
            'name: Inventario y Reparaciones E2E',
            'name: SUNAT Fase 2B — consulta fiscal aislada real',
            'name: SUNAT 149 y 150 — compilación y rollback real',
        ):
            self.assertIn(existing_check, workflow)
        cli_services = {
            'gotrue', 'realtime', 'storage-api', 'imgproxy', 'kong', 'mailpit',
            'postgrest', 'postgres-meta', 'studio', 'edge-runtime', 'logflare',
            'vector', 'supavisor',
        }
        excluded_services = set(normal_ci.EXCLUDED_SERVICES.split(','))
        self.assertTrue(excluded_services <= cli_services)
        self.assertNotIn('kong', excluded_services)

    def test_identity_rejects_unauthorized_hosts_workflows_and_destinations(self):
        invalid = [
            ('platform', None, 'HOSTED_LINUX_REQUIRED'),
            ('environment', {'RUNNER_ENVIRONMENT': 'self-hosted'}, 'HOSTED_RUNNER_REQUIRED'),
            ('repository', {'GITHUB_REPOSITORY': 'another/repository'}, 'REPOSITORY'),
            ('workflow', {'GITHUB_WORKFLOW': 'Other workflow'}, 'WORKFLOW_NAME'),
            ('workflow-ref', {'GITHUB_WORKFLOW_REF': 'other/repo/.github/workflows/x.yml@refs/heads/main'}, 'WORKFLOW_REF'),
            ('job', {'GITHUB_JOB': 'playwright'}, 'JOB_ID'),
            ('event', {'GITHUB_EVENT_NAME': 'workflow_dispatch'}, 'EVENT_REF'),
            ('event-main-ref', {'GITHUB_EVENT_NAME': 'pull_request', 'GITHUB_WORKFLOW_REF': 'Diegx2801/silsanplex/.github/workflows/inventory-e2e.yml@refs/heads/main'}, 'EVENT_REF'),
            ('event-pull-ref', {'GITHUB_EVENT_NAME': 'push', 'GITHUB_WORKFLOW_REF': 'Diegx2801/silsanplex/.github/workflows/inventory-e2e.yml@refs/pull/72/merge'}, 'EVENT_REF'),
            ('run-id', {'GITHUB_RUN_ID': '../persistent'}, 'RUN_ID'),
            ('attempt', {'GITHUB_RUN_ATTEMPT': '0'}, 'RUN_ID'),
            ('temp-root', {'RUNNER_TEMP': '/tmp/untrusted'}, 'TEMP_ROOT'),
            ('workspace', {'GITHUB_WORKSPACE': str(self.base)}, 'WORKSPACE'),
            ('docker-host', {'DOCKER_HOST': 'tcp://remote:2375'}, 'DOCKER_OVERRIDE'),
            ('docker-context', {'DOCKER_CONTEXT': 'remote'}, 'DOCKER_OVERRIDE'),
            ('docker-config', {'DOCKER_CONFIG': '/tmp/remote-docker'}, 'DOCKER_OVERRIDE'),
            ('docker-tls', {'DOCKER_TLS_VERIFY': '1'}, 'DOCKER_OVERRIDE'),
            ('docker-api-version', {'DOCKER_API_VERSION': '1.42'}, 'DOCKER_OVERRIDE'),
            ('database-url', {'DATABASE_URL': 'postgres://private'}, 'REMOTE_CREDENTIAL_OR_URL'),
            ('service-role', {'SUPABASE_SERVICE_ROLE_KEY': 'private'}, 'REMOTE_CREDENTIAL_OR_URL'),
            ('supabase-url', {'SUPABASE_URL': 'https://project.supabase.co'}, 'REMOTE_CREDENTIAL_OR_URL'),
        ]
        for name, change, expected in invalid:
            with self.subTest(name=name):
                values = dict(self.env)
                if change:
                    values.update(change)
                platform = 'win32' if name == 'platform' else 'linux'
                with patch.dict(os.environ, values, clear=True), \
                        patch.object(normal_ci.sys, 'platform', platform), \
                        patch.object(normal_ci, 'ROOT', self.workspace), \
                        patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                        patch.object(normal_ci, 'RUNNER_WORK_ROOT', self.runner_work):
                    with self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_' + expected):
                        normal_ci.identity()

    def test_prepare_rejects_identity_before_touching_docker_or_filesystem(self):
        with patch.dict(os.environ, {}, clear=True), \
                patch.object(normal_ci.sys, 'platform', 'linux'), \
                patch.object(normal_ci, 'docker_guard') as docker_guard:
            with self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_'):
                normal_ci.prepare()
        docker_guard.assert_not_called()
        self.assertFalse(self.directory.exists())

    def test_prepare_aborts_on_any_preexisting_docker_resource(self):
        foreign = {'containers': [{'Name': '/supabase_db_backend'}], 'volumes': [],
                   'networks': self.empty_inventory()['networks']}
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', return_value=foreign), \
                patch.object(normal_ci, 'command') as command:
            with self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_EXISTING_RESOURCES_CONTAINERS'):
                normal_ci.prepare()
        command.assert_not_called()
        self.assertFalse(self.directory.exists())

    def test_inventory_uses_allowlisted_compact_docker_ps_flags(self):
        result = subprocess.CompletedProcess(
            ['docker', 'ps', '-aq'], 0, stdout='container-id\n', stderr='')
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci.subprocess, 'run', return_value=result) as run:
            self.assertEqual(normal_ci.command(['docker', 'ps', '-aq']).strip(), 'container-id')

        run.assert_called_once()
        self.assertEqual(run.call_args.args[0], ['docker', 'ps', '-aq'])
        self.assertFalse(Path(run.call_args.kwargs['env']['DOCKER_CONFIG']).exists())

    def test_supabase_start_failure_logs_only_allowlisted_diagnostic_category(self):
        self.directory.mkdir(mode=0o700)
        home = self.directory / normal_ci.SUPABASE_HOME_NAME
        home.mkdir(mode=0o700)
        (home / normal_ci.DOCKER_CONFIG_NAME).mkdir(mode=0o700)
        fake_cli = self.base / 'supabase'
        command = [str(fake_cli), 'start', '--workdir', str(self.directory),
                   '--exclude', normal_ci.EXCLUDED_SERVICES,
                   '--network-id', normal_ci.network_name(self.project)]
        result = subprocess.CompletedProcess(
            command, 1, stdout='private-sentinel',
            stderr='Cannot start Supabase because container startup failed: private-sentinel')
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'cli_path', return_value=str(fake_cli)), \
                patch.object(normal_ci.subprocess, 'run', return_value=result), \
                patch('builtins.print') as log:
            with self.assertRaisesRegex(RuntimeError, '^CPE_NORMAL_CI_COMMAND_FAILED:supabase$'):
                normal_ci.command(command)

        diagnostic = json.loads(log.call_args.args[0])
        self.assertEqual(diagnostic, {
            'phase': 'supabase-start-failed', 'exit_code': 1,
            'categories': ['UNCLASSIFIED'],
            'hints': ['cannot', 'start', 'supabase', 'because', 'container', 'startup', 'failed'],
        })
        self.assertNotIn('private-sentinel', json.dumps(diagnostic))

    def test_docker_guard_requires_default_context_and_local_socket(self):
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'command', side_effect=['default', json.dumps([
                    {'Endpoints': {'docker': {'Host': 'tcp://remote.example:2375'}}}])]):
            with self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_DOCKER_ENDPOINT'):
                normal_ci.docker_guard()

    def test_docker_network_mutations_are_limited_to_the_derived_loopback_network(self):
        expected_create = ['docker', 'network', 'create', '--driver', 'bridge', '--internal',
                           '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
                           '--label', 'com.docker.compose.project=' + self.project,
                           '--label', 'com.supabase.cli.project=' + self.project,
                           normal_ci.network_name(self.project)]
        expected_remove = ['docker', 'network', 'rm', normal_ci.network_name(self.project)]
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci.subprocess, 'run', return_value=subprocess.CompletedProcess(
                    ['docker'], 0, stdout='network-id', stderr='')) as run:
            self.assertEqual(normal_ci.command(expected_create), 'network-id')
            self.assertEqual(normal_ci.command(expected_remove), 'network-id')
            self.assertEqual(run.call_count, 2)

    def test_docker_volume_removal_accepts_only_unique_names_bound_to_derived_project(self):
        own_volume = f'supabase_db_{self.project}'
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci.subprocess, 'run', return_value=subprocess.CompletedProcess(
                    ['docker'], 0, stdout=own_volume, stderr='')) as run:
            self.assertEqual(normal_ci.command(['docker', 'volume', 'rm', own_volume]), own_volume)
            storage_volume = f'supabase_storage_{self.project}'
            self.assertEqual(normal_ci.command(['docker', 'volume', 'rm', storage_volume]), own_volume)
            self.assertEqual(run.call_count, 2)
            for args in (
                ['docker', 'volume', 'rm', 'supabase_db_backend'],
                ['docker', 'volume', 'rm', own_volume, own_volume],
                ['docker', 'volume', 'rm'],
                ['docker', 'volume', 'rm', f'supabase_unknown_{self.project}'],
            ):
                with self.subTest(args=args), self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_'):
                    normal_ci.command(args)
            self.assertEqual(run.call_count, 2)
            unsafe = [
                ['docker', 'network', 'create', '--driver', 'bridge', 'foreign'],
                ['docker', 'network', 'rm', 'foreign'],
                ['docker', 'network', 'create', '--driver', 'bridge', '--internal',
                 '--opt', 'com.docker.network.bridge.host_binding_ipv4=0.0.0.0',
                 '--label', 'com.docker.compose.project=' + self.project,
                 '--label', 'com.supabase.cli.project=' + self.project,
                 normal_ci.network_name(self.project)],
            ]
            for args in unsafe:
                with self.subTest(args=args), self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_'):
                    normal_ci.command(args)
            self.assertEqual(run.call_count, 2)

    def test_cli_version_must_match_the_backend_lockfile(self):
        lock = json.loads((normal_ci.ROOT / 'backend/package-lock.json').read_text(encoding='utf8'))
        expected = lock['packages']['node_modules/supabase']['version']
        with patch.object(normal_ci, 'command', return_value=expected):
            self.assertEqual(normal_ci.cli_version(), expected)
        with patch.object(normal_ci, 'command', return_value='0.0.0'):
            with self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_CLI_VERSION'):
                normal_ci.cli_version()

    def test_cli_version_command_uses_only_isolated_state_and_disables_telemetry(self):
        self.directory.mkdir(mode=0o700)
        home = self.directory / normal_ci.SUPABASE_HOME_NAME
        home.mkdir(mode=0o700)
        (home / normal_ci.DOCKER_CONFIG_NAME).mkdir(mode=0o700)
        fake_cli = self.base / 'supabase'
        ambient = {
            'PATH': os.environ.get('PATH', ''), 'HOME': str(self.base),
            'SUPABASE_PROJECT_ID': 'untrusted-project',
            'SUPABASE_ACCESS_TOKEN': 'untrusted-token',
            'SUPABASE_HOME': str(self.base / 'foreign-home'),
            'DOCKER_AUTH_CONFIG': '{"auths":{"registry.invalid":{}}}',
            'HTTP_PROXY': 'http://proxy.invalid:8080',
        }
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'cli_path', return_value=str(fake_cli)), \
                patch.dict(os.environ, ambient, clear=True), \
                patch.object(normal_ci.subprocess, 'run', return_value=subprocess.CompletedProcess(
                    [str(fake_cli), '--version'], 0, stdout='2.115.0', stderr='')) as run:
            self.assertEqual(normal_ci.command([str(fake_cli), '--version']), '2.115.0')

        child_env = run.call_args.kwargs['env']
        self.assertEqual(child_env['SUPABASE_HOME'], str(home))
        self.assertEqual(child_env['HOME'], str(home))
        self.assertEqual(child_env['DOCKER_CONFIG'], str(home / normal_ci.DOCKER_CONFIG_NAME))
        self.assertEqual(child_env['SUPABASE_NO_UPDATE_NOTIFIER'], '1')
        self.assertEqual(child_env['SUPABASE_TELEMETRY_DISABLED'], '1')
        self.assertEqual(child_env['DO_NOT_TRACK'], '1')
        self.assertNotIn('SUPABASE_PROJECT_ID', child_env)
        self.assertNotIn('SUPABASE_ACCESS_TOKEN', child_env)
        self.assertNotIn('DOCKER_AUTH_CONFIG', child_env)
        self.assertNotEqual(child_env['SUPABASE_HOME'], ambient['SUPABASE_HOME'])
        self.assertNotIn('HTTP_PROXY', child_env)

    def test_docker_commands_use_ephemeral_empty_config_not_ambient_registry_credentials(self):
        ambient = {
            'PATH': os.environ.get('PATH', ''), 'HOME': str(self.base),
            'DOCKER_AUTH_CONFIG': '{"auths":{"registry.invalid":{"auth":"private"}}}',
            'HTTP_PROXY': 'http://proxy.invalid:8080',
        }
        captured = {}

        def inspect_env(args, **kwargs):
            captured.update(kwargs['env'])
            config_dir = Path(kwargs['env']['DOCKER_CONFIG'])
            self.assertTrue(config_dir.is_dir())
            self.assertEqual(list(config_dir.iterdir()), [])
            return subprocess.CompletedProcess(args, 0, stdout='default', stderr='')

        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci.subprocess, 'run', side_effect=inspect_env), \
                patch.dict(os.environ, ambient, clear=True):
            self.assertEqual(normal_ci.command(['docker', 'context', 'show']), 'default')

        self.assertEqual(set(captured), {'PATH', 'HOME', 'DOCKER_CONFIG'})
        self.assertNotIn('DOCKER_AUTH_CONFIG', captured)
        self.assertNotIn('HTTP_PROXY', captured)
        self.assertFalse(Path(captured['DOCKER_CONFIG']).exists())

    def test_runner_psql_client_uses_only_its_empty_docker_context(self):
        with patch.dict(os.environ, {**self.env, 'PATH': 'hosted-path', 'GITHUB_TOKEN': 'unused-secret'}, clear=True), \
                patch.object(normal_ci.sys, 'platform', 'linux'), \
                patch.object(normal_ci, 'ROOT', self.workspace), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'RUNNER_WORK_ROOT', self.runner_work):
            project, directory, identity_doc = normal_ci.identity()
            directory.mkdir(mode=0o700)
            (directory / 'owner.json').write_text(json.dumps(normal_ci.owner_doc(identity_doc)), encoding='utf8')
            home = directory / normal_ci.SUPABASE_HOME_NAME
            home.mkdir(mode=0o700)
            docker_config = home / normal_ci.DOCKER_CONFIG_NAME
            docker_config.mkdir(mode=0o700)
            child_env = normal_ci.docker_client_env()
        self.assertEqual(child_env['HOME'], str(home))
        self.assertEqual(child_env['DOCKER_CONFIG'], str(docker_config))
        self.assertNotIn('DOCKER_HOST', child_env)
        self.assertNotIn('DOCKER_CONTEXT', child_env)
        self.assertNotIn('GITHUB_TOKEN', child_env)
        self.assertEqual(child_env['PATH'], 'hosted-path')
        self.assertEqual(list(docker_config.iterdir()), [])

    def test_prepare_installs_dynamic_manifest_in_exclusive_directory(self):
        observed = []
        inventories = [self.empty_inventory(), self.owned_inventory(include_db=False,
                                                                      include_kong=False,
                                                                      include_volume=False)]
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', side_effect=inventories), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'cli_version', return_value='2.115.0'), \
                patch.object(normal_ci, 'command', side_effect=lambda args, **kwargs: observed.append(args) or ''), \
                patch.object(normal_ci, 'verify_target', return_value=f'supabase_db_{self.project}'), \
                patch('builtins.print'):
            normal_ci.prepare()
        manifest = normal_ci.repository_manifest()
        copied = sorted(path.name for path in (self.directory / 'supabase/migrations').glob('*.sql'))
        self.assertEqual(copied, list(manifest))
        self.assertEqual(json.loads((self.directory / 'manifest.json').read_text())['migrations'], manifest)
        self.assertEqual([Path(args[0]).name for args in observed], ['docker', 'supabase', 'supabase'])
        self.assertEqual([args[1] for args in observed], ['network', 'start', 'migration'])
        self.assertEqual(observed[0][2:], ['create', '--driver', 'bridge', '--internal',
                                           '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
                                           '--label', 'com.docker.compose.project=' + self.project,
                                           '--label', 'com.supabase.cli.project=' + self.project,
                                           normal_ci.network_name(self.project)])
        self.assertEqual(observed[1][observed[1].index('--network-id') + 1],
                         normal_ci.network_name(self.project))
        self.assertTrue(all(args[args.index('--workdir') + 1] == str(self.directory)
                            for args in observed[1:]))
        self.assertNotIn('reset', str(observed))
        self.assertNotIn('--linked', str(observed))
        local_temp = self.directory / 'supabase/.temp'
        local_temp.mkdir()
        (local_temp / 'cli-latest').write_text('2.115.0', encoding='utf8')
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp):
            normal_ci.assert_directory(self.project, self.directory, self.identity)
            (local_temp / 'project-ref').write_text('remote-project', encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_LINK_SEED_OR_FUNCTIONS'):
                normal_ci.assert_directory(self.project, self.directory, self.identity)
            (local_temp / 'project-ref').unlink()
            (local_temp / 'cli-latest').unlink()
        local_temp.rmdir()

    def test_verify_target_requires_owned_db_api_ports_volumes_and_internal_binds(self):
        valid = self.owned_inventory()
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'docker_guard'), patch.object(normal_ci, 'assert_directory'), \
                patch.object(normal_ci, 'inventory', return_value=valid):
            self.assertEqual(normal_ci.verify_target(), f'supabase_db_{self.project}')

        cases = [
            ('missing volume', self.owned_inventory(include_volume=False), 'PROJECT_VOLUMES_MISSING'),
            ('missing network', self.owned_inventory(include_network=False), 'PROJECT_NETWORK_MISSING'),
        ]
        wrong_port = self.owned_inventory()
        wrong_port['containers'][0]['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort'] = '54322'
        cases.append(('wrong port', wrong_port, 'CONTAINER_PORT_OR_BIND'))
        non_loopback = self.owned_inventory()
        non_loopback['containers'][0]['NetworkSettings']['Ports']['5432/tcp'][0]['HostIp'] = '0.0.0.0'
        cases.append(('wildcard host binding', non_loopback, 'CONTAINER_PORT_OR_BIND'))
        external = self.owned_inventory()
        external['networks'][-1]['Internal'] = False
        cases.append(('non-internal network', external, 'NETWORK_ISOLATION'))
        wrong_option = self.owned_inventory()
        wrong_option['networks'][-1]['Options']['com.docker.network.bridge.host_binding_ipv4'] = '0.0.0.0'
        cases.append(('wildcard network binding', wrong_option, 'NETWORK_BIND_ADDRESS'))
        foreign_network = self.owned_inventory()
        foreign_network['networks'].append({'Name': 'foreign', 'Driver': 'bridge', 'Internal': False,
                                            'Options': {}, 'Labels': {}})
        cases.append(('additional network', foreign_network, 'NETWORK_OWNER'))
        outside_bind = self.owned_inventory()
        outside_bind['containers'][0]['Mounts'].append(
            {'Type': 'bind', 'Source': str(self.base), 'Destination': '/foreign'})
        cases.append(('outside bind', outside_bind, 'HOST_BIND_OUTSIDE_TEMP'))
        for name, resources, expected in cases:
            with self.subTest(name=name), \
                    patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                    patch.object(normal_ci, 'docker_guard'), patch.object(normal_ci, 'assert_directory'), \
                    patch.object(normal_ci, 'inventory', return_value=resources):
                with self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_' + expected):
                    normal_ci.verify_target()

    def test_prepare_failure_before_start_removes_only_its_created_directory(self):
        original_write = normal_ci.write_exclusive

        def fail_on_config(path, content):
            if Path(path).name == 'config.toml':
                raise OSError('injected config write failure')
            return original_write(path, content)

        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', return_value=self.empty_inventory()), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'write_exclusive', side_effect=fail_on_config), \
                patch('builtins.print'):
            with self.assertRaisesRegex(OSError, 'injected config'):
                normal_ci.prepare()
            self.assertFalse(self.directory.exists())
            normal_ci.stop()
        self.assertFalse(self.directory.exists())

    def test_finalizer_removes_owned_partial_directory_when_no_docker_resources_exist(self):
        self.directory.mkdir(mode=0o700)
        (self.directory / 'owner.json').write_text(
            json.dumps(normal_ci.owner_doc(self.identity), sort_keys=True), encoding='utf8')
        (self.directory / 'supabase').mkdir()
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', return_value=self.empty_inventory()), \
                patch('builtins.print'):
            normal_ci.stop()
        self.assertFalse(self.directory.exists())

    def test_partial_start_failure_stops_only_its_owned_project_and_removes_it(self):
        network_only = self.owned_inventory(include_db=False, include_kong=False, include_volume=False)
        network_and_volume = self.owned_inventory(include_db=False, include_kong=False)
        partial = self.owned_inventory(include_kong=False)
        inventories = [self.empty_inventory(), network_only, partial, network_and_volume,
                       network_only, self.empty_inventory()]
        called = []

        def command(args, **kwargs):
            called.append(args)
            if args[1] == 'start':
                raise RuntimeError('injected partial start failure')
            return ''

        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', side_effect=inventories), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'cli_version', return_value='2.115.0'), \
                patch.object(normal_ci, 'command', side_effect=command), \
                patch('builtins.print'):
            with self.assertRaisesRegex(RuntimeError, 'injected partial start'):
                normal_ci.prepare()
            self.assertTrue(self.directory.exists())
            normal_ci.stop()
        stop_calls = [args for args in called if len(args) > 1 and args[1] == 'stop']
        self.assertEqual(len(stop_calls), 1)
        self.assertIn('--no-backup', stop_calls[0])
        self.assertEqual(stop_calls[0][stop_calls[0].index('--workdir') + 1], str(self.directory))
        self.assertEqual([args for args in called if args[1:3] == ['volume', 'rm']],
                         [['docker', 'volume', 'rm', f'supabase_db_{self.project}']])
        network_rm_calls = [args for args in called if args[1:3] == ['network', 'rm']]
        self.assertEqual(network_rm_calls, [['docker', 'network', 'rm', normal_ci.network_name(self.project)]])
        self.assertFalse(self.directory.exists())

    def test_start_failure_before_containers_removes_only_the_owned_network(self):
        network_only = self.owned_inventory(include_db=False, include_kong=False, include_volume=False)
        inventories = [self.empty_inventory(), network_only, network_only, network_only, network_only,
                       self.empty_inventory()]
        called = []

        def command(args, **kwargs):
            called.append(args)
            if args[1] == 'start':
                raise RuntimeError('injected start failure before containers')
            return ''

        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', side_effect=inventories), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'cli_version', return_value='2.115.0'), \
                patch.object(normal_ci, 'command', side_effect=command), \
                patch('builtins.print'):
            with self.assertRaisesRegex(RuntimeError, 'injected start failure'):
                normal_ci.prepare()
            normal_ci.stop()

        self.assertFalse(any(args[1] == 'stop' for args in called))
        self.assertEqual([args for args in called if args[1:3] == ['network', 'rm']],
                         [['docker', 'network', 'rm', normal_ci.network_name(self.project)]])
        self.assertFalse(self.directory.exists())

    def test_migration_failure_after_start_is_cleaned_by_finalizer(self):
        network_only = self.owned_inventory(include_db=False, include_kong=False, include_volume=False)
        network_and_volume = self.owned_inventory(include_db=False, include_kong=False)
        inventories = [self.empty_inventory(), network_only, self.owned_inventory(),
                       network_and_volume, network_only, self.empty_inventory()]
        called = []

        def command(args, **kwargs):
            called.append(args)
            if args[1:3] == ['migration', 'up']:
                raise RuntimeError('injected migration failure')
            return ''

        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', side_effect=inventories), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'cli_version', return_value='2.115.0'), \
                patch.object(normal_ci, 'command', side_effect=command), \
                patch.object(normal_ci, 'verify_target', return_value=f'supabase_db_{self.project}'), \
                patch('builtins.print'):
            with self.assertRaisesRegex(RuntimeError, 'injected migration failure'):
                normal_ci.prepare()
            normal_ci.stop()

        self.assertEqual(len([args for args in called if args[1] == 'stop']), 1)
        self.assertEqual([args for args in called if args[1:3] == ['volume', 'rm']],
                         [['docker', 'volume', 'rm', f'supabase_db_{self.project}']])
        self.assertEqual([args for args in called if args[1:3] == ['network', 'rm']],
                         [['docker', 'network', 'rm', normal_ci.network_name(self.project)]])
        self.assertFalse(self.directory.exists())

    def test_cleanup_failure_keeps_owner_directory_and_does_not_claim_success(self):
        inventories = [self.empty_inventory(),
                       self.owned_inventory(include_db=False, include_kong=False, include_volume=False)]
        called = []

        def fail_stop(args, **kwargs):
            called.append(args)
            if args[1] == 'stop':
                raise RuntimeError('injected stop failure')
            return ''

        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', side_effect=inventories), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'cli_version', return_value='2.115.0'), \
                patch.object(normal_ci, 'command', side_effect=fail_stop), \
                patch.object(normal_ci, 'verify_target', return_value=f'supabase_db_{self.project}'), \
                patch('builtins.print'):
            normal_ci.prepare()
            with patch.object(normal_ci, 'inventory', return_value=self.owned_inventory()):
                with self.assertRaisesRegex(RuntimeError, 'injected stop failure'):
                    normal_ci.stop()
        self.assertFalse(any(args[1:3] == ['network', 'rm'] for args in called))
        self.assertTrue(self.directory.exists())

    def test_finalizer_removes_only_its_verified_network_after_cli_resources_are_gone(self):
        inventories = [self.empty_inventory(),
                       self.owned_inventory(include_db=False, include_kong=False, include_volume=False),
                       self.owned_inventory(include_db=False, include_kong=False, include_volume=False),
                       self.owned_inventory(include_db=False, include_kong=False, include_volume=False),
                       self.owned_inventory(include_db=False, include_kong=False, include_volume=False),
                       self.empty_inventory()]
        called = []

        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', side_effect=inventories), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'cli_version', return_value='2.115.0'), \
                patch.object(normal_ci, 'command', side_effect=lambda args, **kwargs: called.append(args) or ''), \
                patch.object(normal_ci, 'verify_target', return_value=f'supabase_db_{self.project}'), \
                patch('builtins.print'):
            normal_ci.prepare()
            normal_ci.stop()

        self.assertEqual([args for args in called if args[1:3] == ['network', 'rm']],
                         [['docker', 'network', 'rm', normal_ci.network_name(self.project)]])
        self.assertFalse(self.directory.exists())

    def test_finalizer_removes_residual_owned_volume_before_network_and_directory(self):
        network_only = self.owned_inventory(include_db=False, include_kong=False, include_volume=False)
        volume_only = self.owned_inventory(include_db=False, include_kong=False)
        inventories = [self.empty_inventory(), network_only, volume_only, volume_only,
                       network_only, self.empty_inventory()]
        called = []

        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', side_effect=inventories), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'cli_version', return_value='2.115.0'), \
                patch.object(normal_ci, 'command', side_effect=lambda args, **kwargs: called.append(args) or ''), \
                patch.object(normal_ci, 'verify_target', return_value=f'supabase_db_{self.project}'), \
                patch('builtins.print'):
            normal_ci.prepare()
            normal_ci.stop()

        self.assertFalse(any(args[1] == 'stop' for args in called))
        volume_rm_index = next(i for i, args in enumerate(called) if args[1:3] == ['volume', 'rm'])
        network_rm_index = next(i for i, args in enumerate(called) if args[1:3] == ['network', 'rm'])
        self.assertLess(volume_rm_index, network_rm_index)
        self.assertEqual(called[volume_rm_index],
                         ['docker', 'volume', 'rm', f'supabase_db_{self.project}'])
        self.assertFalse(self.directory.exists())

    def test_finalizer_preserves_directory_when_residual_volume_ownership_is_uncertain(self):
        network_only = self.owned_inventory(include_db=False, include_kong=False, include_volume=False)
        foreign_volume = self.owned_inventory(include_db=False, include_kong=False,
                                              include_network=False)
        foreign_volume['volumes'][0]['Labels']['com.supabase.cli.project'] = 'another-project'
        inventories = [self.empty_inventory(), network_only, foreign_volume]
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', side_effect=inventories), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'cli_version', return_value='2.115.0'), \
                patch.object(normal_ci, 'command') as command, \
                patch.object(normal_ci, 'verify_target', return_value=f'supabase_db_{self.project}'), \
                patch('builtins.print'):
            normal_ci.prepare()
            command.reset_mock()
            with self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_VOLUME_OWNER'):
                normal_ci.stop()
        command.assert_not_called()
        self.assertTrue(self.directory.exists())

    def test_finalizer_volume_removal_failure_preserves_network_and_owner_directory(self):
        network_only = self.owned_inventory(include_db=False, include_kong=False, include_volume=False)
        network_and_volume = self.owned_inventory(include_db=False, include_kong=False)
        inventories = [self.empty_inventory(), network_only, network_and_volume, network_and_volume]
        called = []

        def fail_volume_removal(args, **kwargs):
            called.append(args)
            if args[1:3] == ['volume', 'rm']:
                raise RuntimeError('injected volume removal failure')
            return ''

        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', side_effect=inventories), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'cli_version', return_value='2.115.0'), \
                patch.object(normal_ci, 'command', side_effect=fail_volume_removal), \
                patch.object(normal_ci, 'verify_target', return_value=f'supabase_db_{self.project}'), \
                patch('builtins.print'):
            normal_ci.prepare()
            with self.assertRaisesRegex(RuntimeError, 'injected volume removal'):
                normal_ci.stop()

        self.assertTrue(self.directory.exists())
        self.assertFalse(any(args[1:3] == ['network', 'rm'] for args in called))
        self.assertEqual([args for args in called if args[1:3] == ['volume', 'rm']],
                         [['docker', 'volume', 'rm', f'supabase_db_{self.project}']])

    def test_cleanup_refuses_ambiguous_resources_without_stopping_or_deleting(self):
        foreign = {'containers': [{'Name': '/supabase_db_backend'}], 'volumes': [],
                   'networks': self.empty_inventory()['networks']}
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'inventory', return_value=self.empty_inventory()), \
                patch.object(normal_ci, 'assert_ports_free'), \
                patch.object(normal_ci, 'cli_version', return_value='2.115.0'), \
                patch.object(normal_ci, 'command') as command, \
                patch.object(normal_ci, 'verify_target', return_value=f'supabase_db_{self.project}'), \
                patch('builtins.print'):
            normal_ci.prepare()
            command.reset_mock()
            with patch.object(normal_ci, 'inventory', return_value=foreign):
                with self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_CONTAINER_OWNER'):
                    normal_ci.stop()
            command.assert_not_called()
        self.assertTrue(self.directory.exists())
        # Test teardown owns this TemporaryDirectory; no recursive repository cleanup is used.

    def test_supabase_commands_reject_reset_link_and_arbitrary_workdir(self):
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target):
            for args in (
                ['supabase', 'db', 'reset', '--workdir', str(self.directory)],
                ['supabase', 'migration', 'up', '--linked', '--workdir', str(self.directory)],
                ['supabase', 'migration', 'up', '--local', '--workdir', '/tmp/persistent'],
                ['supabase', 'start', '--workdir', str(self.directory), '--exclude',
                 normal_ci.EXCLUDED_SERVICES, '--network-id', 'foreign'],
            ):
                with self.subTest(args=args), self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_'):
                    normal_ci.command(args)
            for args in (['docker', 'rm', 'supabase_db_backend'],
                         ['docker', 'network', 'rm', 'supabase_network_backend'],
                         ['docker', 'network', 'create', '--driver', 'bridge', 'foreign']):
                with self.subTest(args=args), self.assertRaisesRegex(ValueError, 'CPE_NORMAL_CI_'):
                    normal_ci.command(args)

    def test_repository_manifest_is_complete_unique_and_hashed(self):
        manifest = normal_ci.repository_manifest()
        versions = [name.split('_')[0] for name in manifest]
        files = sorted(path.name for path in (normal_ci.ROOT / 'backend/supabase/migrations').glob('*.sql'))
        self.assertEqual(list(manifest), files)
        self.assertEqual(versions, sorted(set(versions)))
        self.assertTrue(all(re.fullmatch(r'[a-f0-9]{64}', digest) for digest in manifest.values()))


class NetworkTopologyProbeTests(unittest.TestCase):
    setUp = NormalCIIdentityTests.setUp
    fixed_target = NormalCIIdentityTests.fixed_target
    owned_inventory = NormalCIIdentityTests.owned_inventory
    def test_probe_cases_have_distinct_fixed_derived_identities(self):
        projects = []
        with patch.dict(os.environ, self.env, clear=True), \
                patch.object(normal_ci.sys, 'platform', 'linux'), \
                patch.object(normal_ci, 'ROOT', self.workspace), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'RUNNER_WORK_ROOT', self.runner_work):
            for case in (None, 'internal', 'bridge'):
                with patch.object(normal_ci, '_PROBE_CASE', case):
                    project, directory, doc = normal_ci.identity()
                    projects.append(project)
                    self.assertEqual(directory.name, project)
                    self.assertEqual(doc['project_id'], project)
        self.assertEqual(len(set(projects)), 3)
        self.assertTrue(projects[1].endswith('-i'))
        self.assertTrue(projects[2].endswith('-b'))
        self.assertTrue(all(len(project) <= 40 for project in projects))

    def test_probe_identity_is_deterministic_unique_and_consistent_everywhere(self):
        config_path = self.workspace / 'backend/supabase/config.toml'
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text('[db]\nmajor_version = 17\n', encoding='utf8')
        projects = set()
        for run_id in ('41111723586', '41111723587'):
            for attempt in ('1', '2'):
                for case in ('internal', 'bridge'):
                    env = {**self.env, 'GITHUB_RUN_ID': run_id, 'GITHUB_RUN_ATTEMPT': attempt}
                    with patch.dict(os.environ, env, clear=True), \
                            patch.object(normal_ci.sys, 'platform', 'linux'), \
                            patch.object(normal_ci, 'ROOT', self.workspace), \
                            patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                            patch.object(normal_ci, 'RUNNER_WORK_ROOT', self.runner_work), \
                            patch.object(normal_ci, '_PROBE_CASE', case):
                        target = normal_ci.identity()
                        self.assertEqual(target, normal_ci.identity())
                        project, directory, doc = target
                        self.assertNotIn(project, projects)
                        projects.add(project)
                        self.assertLessEqual(len(project), 40)
                        self.assertEqual(directory.name, project)
                        self.assertEqual(doc['project_id'], project)
                        self.assertEqual(tomllib.loads(normal_ci.config(project))['project_id'], project)
                        args = normal_ci.network_create_args(project)
                        self.assertIn('com.supabase.cli.project=' + project, args)
                        self.assertIn('com.docker.compose.project=' + project, args)
                        self.assertEqual(args[-1], 'supabase_network_' + project)
                        container = {'Name': '/supabase_db_' + project, 'Config': {'Labels': {
                            'com.supabase.cli.project': project, 'com.docker.compose.project': project}}}
                        diagnostic = normal_ci.container_owner_diagnostic(container, project,
                                                                           'RESOURCE_VERIFICATION')
                        self.assertEqual(diagnostic['supabase_project_label'], 'MATCH')
                        self.assertEqual(diagnostic['compose_project_label'], 'MATCH')
                        self.assertTrue(diagnostic['name_matches_expected_pattern'])
        self.assertEqual(len(projects), 8)

    def test_project_validator_rejects_cli_sanitization_or_truncation(self):
        normal_ci.validate_project_id('a' * 40)
        for project in ('a' * 41, '', '-abc', '_abc', '.abc', 'a/b', 'a b', 'ábc', None):
            with self.subTest(project=project), self.assertRaisesRegex(ValueError, 'PROJECT_ID'):
                normal_ci.validate_project_id(project)
        with patch.dict(os.environ, self.env, clear=True), \
                patch.object(normal_ci.sys, 'platform', 'linux'), \
                patch.object(normal_ci, 'ROOT', self.workspace), \
                patch.object(normal_ci, 'RUNNER_TEMP_ROOT', self.runner_temp), \
                patch.object(normal_ci, 'RUNNER_WORK_ROOT', self.runner_work), \
                patch.object(normal_ci, '_PROBE_CASE', 'internal'):
            with patch.dict(os.environ, {'GITHUB_RUN_ID': '1' * 40}), \
                    patch.object(normal_ci, 'docker_guard') as docker_guard:
                with self.assertRaisesRegex(ValueError, 'PROJECT_ID'):
                    normal_ci.prepare()
                docker_guard.assert_not_called()

    @staticmethod
    def proof(case):
        return {'cli_start_success': case == 'bridge', 'cleanup_verified': True,
                'sample': {'owner_labels_verified': True, 'postgres_internal_healthy': True,
                           'internal': case == 'internal',
                           'ipam': [{'subnet': '172.22.0.0/16', 'gateway': '172.22.0.1'}],
                           'requested_bindings': [{'HostIp': '', 'HostPort': str(normal_ci.PORTS['db'])}],
                           'effective_bindings': ([{'HostIp': '127.0.0.1',
                                                    'HostPort': str(normal_ci.PORTS['db'])}]
                                                  if case == 'bridge' else []),
                           'localhost_tcp_connected': case == 'bridge'}}

    def test_proof_requires_actual_health_ports_tcp_cli_and_cleanup(self):
        for case in ('internal', 'bridge'):
            normal_ci.validate_network_probe(case, self.proof(case))
            mutations = (
                lambda p: p.update(cleanup_verified=False),
                lambda p: p.update(observer_error='ValueError'),
                lambda p: p['sample'].update(postgres_internal_healthy=False),
                lambda p: p['sample'].update(internal=case != 'internal'),
                lambda p: p['sample'].update(localhost_tcp_connected=case != 'bridge'),
                lambda p: p.update(cli_start_success=case != 'bridge'),
                lambda p: p['sample'].update(ipam=[]),
            )
            for mutate in mutations:
                proof = self.proof(case)
                mutate(proof)
                with self.assertRaises(ValueError):
                    normal_ci.validate_network_probe(case, proof)

    def test_probe_sample_uses_owned_internal_health_and_loopback_only(self):
        resources = self.owned_inventory()
        db = resources['containers'][0]
        db['Config']['Healthcheck'] = {'Test': ['CMD', 'pg_isready', '-h', '127.0.0.1']}
        db['State']['Health'] = {'Status': 'healthy'}
        db['HostConfig'] = {'PortBindings': {'5432/tcp': [{'HostIp': '', 'HostPort': str(normal_ci.PORTS['db'])}]}}
        resources['networks'][-1]['IPAM'] = {'Config': [{'Subnet': '172.22.0.0/16', 'Gateway': '172.22.0.1'}]}
        for case in ('internal', 'bridge'):
            resources['networks'][-1]['Internal'] = case == 'internal'
            db['NetworkSettings']['Ports']['5432/tcp'] = self.proof(case)['sample']['effective_bindings']
            with patch.object(normal_ci, '_PROBE_CASE', case), \
                    patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                    patch.object(normal_ci, 'assert_owner'), \
                    patch.object(normal_ci, 'inventory', return_value=resources), \
                    patch.object(normal_ci.socket, 'create_connection') as connect:
                if case == 'internal':
                    connect.side_effect = OSError('unpublished')
                sample = normal_ci.sample_network_probe()
                self.assertTrue(sample['postgres_internal_healthy'])
                self.assertEqual(sample['localhost_tcp_connected'], case == 'bridge')
                connect.assert_called_once_with(('127.0.0.1', normal_ci.PORTS['db']), timeout=0.25)
        for host in ('0.0.0.0', '::', '::1', '192.0.2.1'):
            db['NetworkSettings']['Ports']['5432/tcp'][0]['HostIp'] = host
            with patch.object(normal_ci, '_PROBE_CASE', 'bridge'), \
                    patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                    patch.object(normal_ci, 'assert_owner'), \
                    patch.object(normal_ci, 'inventory', return_value=resources), \
                    patch.object(normal_ci.socket, 'create_connection') as connect:
                with self.assertRaisesRegex(ValueError, 'PROBE_NON_LOOPBACK_BIND'):
                    normal_ci.sample_network_probe()
                connect.assert_not_called()

    def test_cases_are_sequential_and_cleanup_precedes_next_case(self):
        events = []

        def prepare():
            case = normal_ci._PROBE_CASE
            events.append(('prepare', case))
            normal_ci._PROBE_EVIDENCE.update(self.proof(case))
            normal_ci._PROBE_EVIDENCE.pop('cleanup_verified')
            if case == 'internal':
                raise RuntimeError('CPE_NORMAL_CI_COMMAND_FAILED:supabase')

        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'prepare', side_effect=prepare), \
                patch.object(normal_ci, 'stop', side_effect=lambda: events.append(('stop', normal_ci._PROBE_CASE))), \
                patch('builtins.print'):
            normal_ci.network_ab()
        self.assertEqual(events, [('prepare', 'internal'), ('stop', 'internal'),
                                  ('prepare', 'bridge'), ('stop', 'bridge')])
        self.assertIsNone(normal_ci._PROBE_CASE)
        self.assertIsNone(normal_ci._PROBE_EVIDENCE)

    def test_probe_failure_still_cleans_and_cannot_claim_reproduction(self):
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'prepare', side_effect=ValueError('identity failure')), \
                patch.object(normal_ci, 'stop') as stop, patch('builtins.print'):
            with self.assertRaisesRegex(ValueError, 'identity failure'):
                normal_ci.network_ab()
            stop.assert_called_once()
        self.assertIsNone(normal_ci._PROBE_CASE)
        self.assertIsNone(normal_ci._PROBE_EVIDENCE)

    def test_observer_closes_after_start_failure(self):
        with patch.object(normal_ci, '_PROBE_EVIDENCE', {}), \
                patch.object(normal_ci, 'sample_network_probe', return_value=None), \
                patch.object(normal_ci, 'command', side_effect=RuntimeError('start failed')):
            with self.assertRaisesRegex(RuntimeError, 'start failed'):
                normal_ci.start_and_observe(['approved-command'])
        self.assertFalse(any(t.name == 'owned-supabase-network-probe' for t in normal_ci.threading.enumerate()))

    def test_observer_reports_only_fixed_guard_codes(self):
        for message in ('CPE_NORMAL_CI_PROBE_REQUESTED_BIND', 'private credential sentinel'):
            observed = normal_ci.threading.Event()
            evidence = {}

            def sample():
                observed.set()
                raise ValueError(message)

            def start(*args, **kwargs):
                self.assertTrue(observed.wait(2))
                return ''

            with patch.object(normal_ci, '_PROBE_EVIDENCE', evidence), \
                    patch.object(normal_ci, 'sample_network_probe', side_effect=sample), \
                    patch.object(normal_ci, 'command', side_effect=start):
                normal_ci.start_and_observe(['approved-command'])
            self.assertEqual(evidence['observer_error'], 'ValueError')
            if message.startswith('CPE_NORMAL_CI_'):
                self.assertEqual(evidence['observer_guard'], message)
            else:
                self.assertNotIn('observer_guard', evidence)
                self.assertNotIn(message, json.dumps(evidence))

    def test_finalizer_attempts_all_fixed_cases_after_one_cleanup_failure(self):
        events = []
        for case in ('internal', 'bridge', 'normal'):
            (self.base / case).mkdir()

        def target():
            case = normal_ci._PROBE_CASE or 'normal'
            return case, self.base / case, {}

        def stop():
            events.append(normal_ci._PROBE_CASE)
            if normal_ci._PROBE_CASE == 'internal':
                raise ValueError('unowned resource')

        with patch.object(normal_ci, 'identity', side_effect=target), \
                patch.object(normal_ci, 'stop', side_effect=stop):
            with self.assertRaisesRegex(ValueError, 'FINALIZER_FAILED_CLOSED'):
                normal_ci.stop_all()
        self.assertEqual(events, ['internal', 'bridge', None])
        self.assertIsNone(normal_ci._PROBE_CASE)


class ContainerOwnerDiagnosticTests(unittest.TestCase):
    setUp = NormalCIIdentityTests.setUp
    fixed_target = NormalCIIdentityTests.fixed_target
    owned_inventory = NormalCIIdentityTests.owned_inventory

    def test_valid_labels_preserve_verification_without_rejection_log(self):
        resources = self.owned_inventory()
        with patch('builtins.print') as log:
            normal_ci.assert_owned_resources(self.project, resources, self.directory)
        log.assert_not_called()
        diagnostic = normal_ci.container_owner_diagnostic(resources['containers'][0], self.project,
                                                           'SUPABASE_START_OBSERVATION')
        self.assertEqual(diagnostic['supabase_project_label'], 'MATCH')
        self.assertEqual(diagnostic['compose_project_label'], 'MATCH')

    def test_each_label_failure_is_sanitized_and_still_rejected(self):
        first, second = 'com.supabase.cli.project', 'com.docker.compose.project'
        cases = [
            ({second: self.project}, ('MISSING', 'MATCH')),
            ({first: self.project}, ('MATCH', 'MISSING')),
            ({first: 'private-sentinel', second: self.project}, ('MISMATCH', 'MATCH')),
            ({first: self.project, second: 'private-sentinel'}, ('MATCH', 'MISMATCH')),
            ({first: None, second: 7}, ('INVALID', 'INVALID')),
            ('private-sentinel', ('INVALID', 'INVALID')),
            (None, ('MISSING', 'MISSING')),
        ]
        for labels, expected in cases:
            with self.subTest(expected=expected):
                resources = self.owned_inventory()
                resources['containers'][0]['Config']['Labels'] = labels
                with patch('builtins.print') as log, \
                        self.assertRaisesRegex(ValueError, '^CPE_NORMAL_CI_CONTAINER_OWNER$'):
                    normal_ci.assert_owned_resources(self.project, resources, self.directory,
                                                     stage='SUPABASE_START_OBSERVATION')
                diagnostic = json.loads(log.call_args.args[0])
                self.assertEqual((diagnostic['supabase_project_label'],
                                  diagnostic['compose_project_label']), expected)
                self.assertEqual(diagnostic['lifecycle_stage'], 'SUPABASE_START_OBSERVATION')
                self.assertEqual(diagnostic['failed_check'], 'CPE_NORMAL_CI_CONTAINER_OWNER')
                self.assertNotIn('private-sentinel', json.dumps(diagnostic))
                self.assertNotIn(self.project, json.dumps(diagnostic))

    def test_foreign_auxiliary_and_incomplete_resources_never_allow_probe_connection(self):
        for name, labels, role, name_matches in (
                ('/supabase_db_private-sentinel', {}, 'POSTGRESQL', False),
                ('/temporary-private-sentinel', {}, 'OTHER', False),
                ('/supabase_db_' + self.project, None, 'POSTGRESQL', True)):
            resources = self.owned_inventory()
            resources['containers'][0].update(Name=name, Config={'Labels': labels})
            with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                    patch.object(normal_ci, 'assert_owner'), \
                    patch.object(normal_ci, 'inventory', return_value=resources), \
                    patch.object(normal_ci.socket, 'create_connection') as connect, \
                    patch('builtins.print') as log:
                with self.assertRaisesRegex(ValueError, 'CONTAINER_OWNER'):
                    normal_ci.sample_network_probe()
                connect.assert_not_called()
            diagnostic = json.loads(log.call_args.args[0])
            self.assertEqual(diagnostic['role'], role)
            self.assertIs(diagnostic['name_matches_expected_pattern'], name_matches)
            self.assertNotIn('private-sentinel', json.dumps(diagnostic))

    def test_unverified_container_blocks_cleanup_without_deletion(self):
        resources = self.owned_inventory()
        resources['containers'][0]['Config']['Labels'] = {}
        self.directory.mkdir()
        with patch.object(normal_ci, 'identity', side_effect=self.fixed_target), \
                patch.object(normal_ci, 'docker_guard'), \
                patch.object(normal_ci, 'assert_owner'), \
                patch.object(normal_ci, 'assert_directory'), \
                patch.object(normal_ci, 'inventory', return_value=resources), \
                patch.object(normal_ci, 'command') as command, \
                patch.object(normal_ci, 'safe_remove_directory') as remove, \
                patch('builtins.print') as log:
            with self.assertRaisesRegex(ValueError, 'CONTAINER_OWNER'):
                normal_ci.stop()
            command.assert_not_called()
            remove.assert_not_called()
        self.assertTrue(self.directory.exists())
        self.assertEqual(json.loads(log.call_args.args[0])['lifecycle_stage'], 'CLEANUP')

    def test_metadata_cannot_inject_diagnostic_fields_or_values(self):
        result = normal_ci.container_owner_diagnostic(
            {'Name': 'private-sentinel', 'Config': {'Labels': []},
             'Env': ['private-sentinel']}, self.project, 'private-sentinel')
        self.assertEqual(set(result), {'phase', 'resource_type', 'role', 'supabase_project_label',
                                      'compose_project_label', 'name_matches_expected_pattern',
                                      'lifecycle_stage', 'failed_check'})
        self.assertNotIn('private-sentinel', json.dumps(result))


class NormalRunnerCoverageTests(unittest.TestCase):
    def test_declared_race_manifest_matches_all_real_runner_call_sites(self):
        source = Path(runner.__file__).read_text(encoding='utf8')
        actual = re.findall(r"\brace\('([^']+)'", source)
        self.assertEqual(tuple(actual), runner.EXPECTED_RACES)
        self.assertEqual(len(runner.EXPECTED_RACES), 11)

    def test_ci_mode_rejects_sql_outside_verified_container(self):
        safe_env = {'PATH': 'hosted-path', 'HOME': '/job/home', 'DOCKER_CONFIG': '/job/home/docker-config'}
        with patch.object(runner, 'CI_CONTAINER', 'supabase_db_owned') as target, \
                patch.object(runner, 'CI_RUNNER_ENV', safe_env), \
                patch.object(runner.subprocess, 'run', return_value=SimpleNamespace(
                    returncode=0, stderr='', stdout='')) as process:
            with self.assertRaisesRegex(ValueError, 'CPE_TEST_CI_CONTAINER_TARGET'):
                runner.run(['docker', 'exec', '-i', 'supabase_db_backend', 'psql'])
            with self.assertRaisesRegex(ValueError, 'CPE_TEST_CI_CONTAINER_TARGET'):
                runner.run(['docker', 'exec', '-i', target, '/bin/sh'])
            process.assert_not_called()
            runner.run(['docker', 'exec', '-i', target, 'psql'])
            process.assert_called_once()
            self.assertEqual(process.call_args.kwargs['env'], safe_env)

    def test_ci_normal_fails_if_all_eleven_races_do_not_run(self):
        fake_ci = SimpleNamespace(verify_target=unittest.mock.Mock(return_value='supabase_db_owned'),
                                  docker_client_env=lambda: {'PATH': 'hosted-path',
                                                             'DOCKER_CONFIG': '/job/home/docker-config'})
        with patch.object(runner, 'verify_ci_normal'), \
                patch.object(runner, 'fingerprints', side_effect=[{}, {}]), \
                patch.object(runner, 'serial') as serial, patch.object(runner, 'races'), \
                patch.object(runner, 'CHECKS', []), patch.object(runner, 'RACES_COMPLETED', []), \
                patch('builtins.print'):
            with self.assertRaisesRegex(AssertionError, 'CPE_TEST_CI_RACE_COVERAGE'):
                runner.ci_normal(fake_ci)
        serial.assert_called_once_with(False)
        self.assertIsNone(runner.CI_CONTAINER)
        self.assertIsNone(runner.CI_RUNNER_ENV)

    def test_ci_normal_succeeds_only_after_all_races_and_revalidates_target(self):
        fake_ci = SimpleNamespace(verify_target=unittest.mock.Mock(return_value='supabase_db_owned'),
                                  docker_client_env=lambda: {'PATH': 'hosted-path',
                                                             'DOCKER_CONFIG': '/job/home/docker-config'})

        def run_races():
            runner.RACES_COMPLETED.extend(runner.EXPECTED_RACES)

        with patch.object(runner, 'verify_ci_normal'), \
                patch.object(runner, 'fingerprints', side_effect=[{}, {}]), \
                patch.object(runner, 'serial') as serial, patch.object(runner, 'races', side_effect=run_races), \
                patch.object(runner, 'CHECKS', []), patch.object(runner, 'RACES_COMPLETED', []), \
                patch('builtins.print'):
            runner.ci_normal(fake_ci)
        serial.assert_called_once_with(False)
        self.assertEqual(fake_ci.verify_target.call_count, 2)
        self.assertIsNone(runner.CI_CONTAINER)
        self.assertIsNone(runner.CI_RUNNER_ENV)

    def test_ci_normal_accepts_only_exact_full_repository_history(self):
        files = runner.repository_versions()
        valid_results = [SimpleNamespace(stdout='postgres|5432'),
                         SimpleNamespace(stdout='pg_advisory_xact_lock DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED'),
                         SimpleNamespace(stdout='CPE-PE-DOM-PEN-1')]
        with patch.object(runner, 'sql', side_effect=valid_results), \
                patch.object(runner, 'read', return_value=files), patch.object(runner, 'check') as check:
            runner.verify_ci_normal()
        check.assert_called_once_with('CI full migration history and fiscal contracts', True,
                                      {'migrations': len(files), 'database': 'postgres|5432'})

        for wrong in (files[:-1], files + ['20990101000000'], list(reversed(files))):
            with self.subTest(history_length=len(wrong)), \
                    patch.object(runner, 'sql', return_value=SimpleNamespace(stdout='postgres|5432')), \
                    patch.object(runner, 'read', return_value=wrong):
                with self.assertRaisesRegex(ValueError, 'CPE_TEST_MIGRATION_HISTORY_MISMATCH'):
                    runner.verify_ci_normal()


if __name__ == '__main__':
    unittest.main()
