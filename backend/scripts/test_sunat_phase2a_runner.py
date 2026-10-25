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


class TransactionalRunnerTests(unittest.TestCase):
    def setUp(self):
        self.files = sorted(p.name.split('_')[0]
                            for p in runner.MIGRATIONS[0].parent.glob('*.sql'))
        self.base = self.files[:-3]

    def test_exact_candidate_versions_and_base(self):
        self.assertEqual(runner.VERSIONS, ('20261023061225', '20261023135019'))
        self.assertEqual(runner.FOLLOWUP_MIGRATION_VERSION, '20261025190353')
        self.assertEqual(len(self.base), 148)

    def test_accepts_only_expected_history_for_each_mode(self):
        runner.validate_history(self.base, self.files, True)
        runner.validate_history(self.files[:-1], self.files, False)
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
        histories = [self.base, self.files[:-2], self.files + ['20990101000000'],
                     self.files + [self.files[-1]], list(reversed(self.files)),
                     ['19000101000000'] + self.files[1:]]
        for history in histories:
            with self.subTest(history_size=len(history)):
                with self.assertRaisesRegex(ValueError, 'CPE_TEST_MIGRATION_HISTORY_MISMATCH'):
                    runner.validate_history(history, self.files, False)

    def test_rejects_unexpected_repository_manifest(self):
        manifests = [self.files[:-1], self.files + ['20990101000000'],
                     self.files[:-1] + [self.files[-2]], list(reversed(self.files)),
                     self.base + [runner.VERSIONS[0], runner.VERSIONS[1], '20261025190354']]
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
        for stage in ('149', '150', 'serial'):
            self.assertIn(runner.transaction_probe(stage), source)
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
            with self.subTest(candidate='150', source=source):
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
                          for stage in ('149', '150', 'serial'))
        with patch.object(runner, 'sql', return_value=SimpleNamespace(stderr=notices + markers)), \
                patch.object(runner, 'check') as checked:
            runner.serial(True)
            self.assertEqual(checked.call_count, 97)
        for stderr in (notices, notices + markers.replace('150', '149'),
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

    def test_preparation_copies_only_148_without_reset_seed_or_repo_changes(self):
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
            self.assertEqual(len(list((directory / 'supabase/migrations').iterdir())), 148)
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
                                       for p in runner.MIGRATIONS[0].parent.glob('*.sql'))[:-3])
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
                                       for p in runner.MIGRATIONS[0].parent.glob('*.sql'))[:-3])
        fake_ci = SimpleNamespace(verify_target=lambda: 'verified-ci-only',
                                  snapshot=unittest.mock.Mock(return_value=baseline))
        with patch.object(runner, 'CONTAINER', runner.CONTAINER), patch.object(runner, 'CHECKS', []), \
                patch('builtins.print'), \
                patch.object(runner, 'sql', return_value=SimpleNamespace(stdout='postgres|5432')), \
                patch.object(runner, 'serial', side_effect=RuntimeError('SQL failure')):
            with self.assertRaisesRegex(RuntimeError, 'SQL failure'):
                runner.ci_transactional(fake_ci)
            self.assertEqual(fake_ci.snapshot.call_count, 2)


if __name__ == '__main__':
    unittest.main()
