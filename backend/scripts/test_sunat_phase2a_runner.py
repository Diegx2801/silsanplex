"""Unit coverage of preflight and SQL composition; no database connections."""
import hashlib
import importlib.util
from pathlib import Path
import re
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    'sunat_phase2a_runner', Path(__file__).with_name('test-sunat-phase2a.py'))
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class TransactionalRunnerTests(unittest.TestCase):
    def setUp(self):
        self.files = sorted(p.name.split('_')[0]
                            for p in runner.MIGRATIONS[0].parent.glob('*.sql'))
        self.base = self.files[:-2]

    def test_exact_candidate_versions_and_base(self):
        self.assertEqual(runner.VERSIONS, ('20261023061225', '20261023135019'))
        self.assertEqual(len(self.base), 148)

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
        self.assertEqual(source, 'begin;\n' + first + '\n' + second + '\n'
                         + runner.SUITE.read_text(encoding='utf8') + '\nrollback;')
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


if __name__ == '__main__':
    unittest.main()
