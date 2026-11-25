"""Synthetic backup/restore and code transaction tests; no host service operations."""
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import shlex
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout

spec = importlib.util.spec_from_file_location('release_update', Path(__file__).parents[1] / 'deploy/release-update.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ReleaseTests(unittest.TestCase):
    def test_snapshot_closes_all_source_destination_and_integrity_handles(self):
        folder = Path(tempfile.mkdtemp(prefix='manager-synthetic-handles-'))
        source = folder / 'source.sqlite'
        db = sqlite3.connect(source)
        db.execute('CREATE TABLE fixture (n INTEGER)')
        db.commit(); db.close()
        connect = sqlite3.connect
        opened = []
        def tracking(*args, **kwargs):
            db = connect(*args, **kwargs)
            opened.append(db)
            return db
        with patch.object(m.sqlite3, 'connect', side_effect=tracking):
            m.snapshot({'rooms': str(source), 'telegram': str(source)}, folder / 'backup')
        self.assertTrue(opened)
        for db in opened:
            with self.assertRaises(sqlite3.ProgrammingError):
                db.execute('SELECT 1')

    def test_effective_environment_file_precedence_without_secrets(self):
        folder = Path(tempfile.mkdtemp(prefix='manager-synthetic-env-'))
        file = folder / 'adapter.env'
        file.write_text('PORT=8443\nTELEGRAM_MODE=adapter\nSECRET_TOKEN=not-for-reporting\n')
        values = {'Environment': b'PORT=8090 TELEGRAM_MODE=standalone',
                  'EnvironmentFiles': (shlex.quote(str(file)) + ' (ignore_errors=no)').encode(), 'UnsetEnvironment': b''}
        with patch.object(m, 'command', side_effect=lambda *args: values[args[4]]):
            effective = m.selected_environment('test.service', {'configSha256': {str(file): m.sha(file)}})
        self.assertEqual(effective, {'PORT': '8443', 'TELEGRAM_MODE': 'adapter'})

    def test_unpinned_or_unset_environment_refused(self):
        folder = Path(tempfile.mkdtemp(prefix='manager-synthetic-env-deny-'))
        file = folder / 'adapter.env'
        file.write_text('PORT=8443\n')
        values = {'Environment': b'', 'EnvironmentFiles': shlex.quote(str(file)).encode(), 'UnsetEnvironment': b''}
        with patch.object(m, 'command', side_effect=lambda *args: values[args[4]]):
            with self.assertRaises(RuntimeError):
                m.selected_environment('test.service', {'configSha256': {}})
            values['UnsetEnvironment'] = b'PORT'
            with self.assertRaises(RuntimeError):
                m.selected_environment('test.service', {'configSha256': {str(file): m.sha(file)}})

    def test_wal_backup_restore_and_live_data_unchanged(self):
        folder = Path(tempfile.mkdtemp(prefix='manager-synthetic-wal-'))
        writers, databases = [], {}
        try:
            for name in ('rooms', 'telegram'):
                file = folder / (name + '.sqlite')
                db = sqlite3.connect(file)
                db.execute('PRAGMA journal_mode=WAL')
                db.execute('PRAGMA wal_autocheckpoint=0')
                db.execute('CREATE TABLE fixture (value TEXT)')
                db.execute("INSERT INTO fixture VALUES ('committed-in-WAL')")
                db.commit()
                self.assertGreater(Path(str(file) + '-wal').stat().st_size, 0)
                writers.append(db)
                databases[name] = str(file)
            before = {p: m.sha(p) for file in databases.values() for p in (file, file + '-wal')}
            m.snapshot(databases, folder / 'snapshot')
            m.restore_isolated(folder / 'snapshot', folder / 'restored')
            for file in databases:
                with sqlite3.connect(folder / 'restored' / (file + '.sqlite')) as db:
                    self.assertEqual(db.execute('SELECT value FROM fixture').fetchone()[0], 'committed-in-WAL')
            self.assertEqual(before, {p: m.sha(p) for p in before})
            with self.assertRaises(RuntimeError):
                m.restore_isolated(folder / 'snapshot', folder / 'restored')
        finally:
            for db in writers:
                db.close()
        # Deliberately retain only newly created synthetic test files; never delete data.

    def test_corrupt_snapshot_refused_before_destination_created(self):
        folder = Path(tempfile.mkdtemp(prefix='manager-synthetic-corrupt-'))
        for name in ('rooms', 'telegram'):
            with sqlite3.connect(folder / (name + '.sqlite')) as db:
                db.execute('CREATE TABLE fixture (n INTEGER)')
        m.snapshot({n: str(folder / (n + '.sqlite')) for n in ('rooms', 'telegram')}, folder / 'snapshot')
        with open(folder / 'snapshot/rooms.sqlite', 'ab') as f:
            f.write(b'corruption')
        with self.assertRaises(RuntimeError):
            m.restore_isolated(folder / 'snapshot', folder / 'restore')
        self.assertFalse((folder / 'restore').exists())

    def transaction(self, fail=None):
        log, switched = [], {}
        data = Path(tempfile.mkdtemp(prefix='manager-synthetic-rollback-')) / 'state.sqlite'
        with sqlite3.connect(data) as db:
            db.execute('CREATE TABLE records (value TEXT)')
            db.execute("INSERT INTO records VALUES ('before-release')")
        old = {k: 'old-' + k for k in m.ROOTS}
        new = {k: 'new-' + k for k in m.ROOTS}
        def service(op, unit):
            self.assertIn(unit, m.UNITS)
            log.append((op, unit))
        def switch(root, target):
            switched[str(root)] = target
            log.append(('switch', target))
        def verify(stage):
            log.append(('verify', stage))
            if stage == 'candidate':
                with sqlite3.connect(data) as db:
                    db.executemany('INSERT INTO records VALUES (?)', [('new-game-move',), ('new-purchase',)])
            if stage == fail:
                raise RuntimeError('synthetic failure')
        if fail:
            with self.assertRaises(RuntimeError):
                m.update_code(old, new, switch, service, verify)
            self.assertEqual(set(switched.values()), set(old.values()))
            self.assertIn(('verify', 'rollback'), log)
        else:
            m.update_code(old, new, switch, service, verify)
            self.assertEqual(set(switched.values()), set(new.values()))
        with sqlite3.connect(data) as db:
            expected = ['before-release'] if fail == 'quiesced' else ['before-release', 'new-game-move', 'new-purchase']
            self.assertEqual([v[0] for v in db.execute('SELECT value FROM records')], expected)
        self.assertEqual(log[0], ('stop', 'manager-telegram-poller.service'))
        return log

    def test_success_only_manager_and_snapshot_before_switch(self):
        log = self.transaction()
        self.assertLess(log.index(('verify', 'quiesced')), next(i for i, v in enumerate(log) if v[0] == 'switch'))
        self.assertLess(log.index(('verify', 'candidate')), log.index(('start', m.UNITS[2])))

    def test_candidate_failure_rolls_back_both_codes(self):
        self.transaction('candidate')

    def test_backup_failure_does_not_switch_candidate(self):
        log = self.transaction('quiesced')
        self.assertFalse(any(v[0] == 'switch' and v[1].startswith('new-') for v in log))

    def test_poller_check_failure_rolls_back_both(self):
        self.transaction('poller')

    def test_default_cli_never_applies_or_creates_lock(self):
        fake = SimpleNamespace(is_file=lambda: True, is_symlink=lambda: False,
                               stat=lambda: SimpleNamespace(st_uid=0, st_mode=0o600), read_text=lambda: '{}')
        with patch.object(m, 'os', SimpleNamespace(name='posix', geteuid=lambda: 0, umask=lambda _: None)), \
             patch.object(m, 'fcntl', SimpleNamespace()), patch.object(m, 'Path', return_value=fake), \
             patch.object(m, 'validate', return_value={}) as validate, patch.object(m, 'apply') as apply, \
             patch('sys.argv', ['release-update.py', '--plan', '/private/plan.json']), \
             patch('builtins.open', side_effect=AssertionError('Unexpected write')), redirect_stdout(io.StringIO()):
            m.main()
            validate.assert_called_once()
            apply.assert_not_called()

    def test_go_for_old_commit_is_rejected(self):
        folder = Path(tempfile.mkdtemp(prefix='manager-synthetic-plan-'))
        manifest = {'version': 1, 'commit': 'a' * 40, 'runtimes': []}
        for kind in ('rooms', 'adapter'):
            f = folder / (kind + '.tar')
            f.write_bytes(kind.encode())
            manifest['runtimes'].append({'kind': kind, 'file': f.name, 'sha256': m.sha(f)})
        file = folder / 'shared-release.json'
        file.write_text(json.dumps(manifest))
        report = folder / 'report.json'
        report.write_text(json.dumps({'decision': 'GO', 'checks': [{'status': 'PASS'}], 'candidates': [
            {**r, 'commit': 'b' * 40} for r in manifest['runtimes']]}))
        plan = {'version': 1, 'candidateCommit': 'a' * 40, 'approvedCommit': 'a' * 40,
                'manifest': str(file), 'manifestSha256': m.sha(file), 'goReport': str(report),
                'goReportSha256': m.sha(report), 'databases': m.DATABASES}
        with patch.object(m, 'command', return_value=b'24.22.3'):
            with self.assertRaises(RuntimeError):
                m.validate(plan)


if __name__ == '__main__':
    unittest.main()
