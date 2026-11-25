#!/usr/bin/env python3
"""Existing shared installation only. Default is read-only NO-GO/check, never install.

Apply requires a private, pinned host plan, a GO for BOTH exact archives and an
explicit commit approval. No Bot API, Caddy/Docker changes or automatic DB restore.
"""
import argparse
from contextlib import closing
try:
    import fcntl
except ImportError:
    fcntl = None  # Pure transaction/snapshot tests also run on Windows.
import hashlib
import json
import os
from pathlib import Path
import shutil
import shlex
import sqlite3
import subprocess
import tarfile
import tempfile
import time
import uuid
from urllib.request import urlopen

NODE = '/opt/manager-node/bin/node'
UNITS = ('manager-online.service', 'manager-telegram.service', 'manager-telegram-poller.service')
ROOTS = {'rooms': Path('/opt/manager-online'), 'adapter': Path('/opt/manager-telegram')}
DATABASES = {'rooms': '/var/lib/manager-online/rooms.sqlite', 'telegram': '/var/lib/manager-telegram/telegram.sqlite'}


def require(ok):
    if not ok:
        raise RuntimeError('Release prerequisite failed; inspect private host plan')


def sha(file):
    h = hashlib.sha256()
    with open(file, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def tree_sha(folder):
    h = hashlib.sha256()
    for p in sorted(Path(folder).rglob('*')):
        require(not p.is_symlink())
        if p.is_file():
            h.update(p.relative_to(folder).as_posix().encode() + b'\0' + sha(p).encode() + b'\n')
    return h.hexdigest()


def command(*args):
    # Never emit command output: unit files and failure diagnostics may hold secrets.
    r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
    require(r.returncode == 0)
    return r.stdout


def db_integrity(file):
    with closing(sqlite3.connect(Path(file).resolve().as_uri() + '?mode=ro', uri=True)) as db:
        require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok')
        require(not db.execute('PRAGMA foreign_key_check').fetchall())


def snapshot(databases, destination):
    """Online Backup API includes committed WAL. Caller must quiesce all writers."""
    destination = Path(destination)
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    records = []
    for name, source in databases.items():
        source = Path(source)
        require(source.is_file() and not source.is_symlink())
        target = destination / (name + '.sqlite')
        with closing(sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)) as src:
            with closing(sqlite3.connect(target)) as dst:
                src.backup(dst)
        os.chmod(target, 0o600)
        db_integrity(target)
        records.append({'name': name, 'sha256': sha(target)})
    (destination / 'manifest.json').write_text(json.dumps({'version': 1, 'files': records}))
    return records


def restore_isolated(snapshot_dir, destination):
    source, destination = Path(snapshot_dir), Path(destination)
    m = json.loads((source / 'manifest.json').read_text())
    require(m['version'] == 1 and sorted(f['name'] for f in m['files']) == ['rooms', 'telegram'])
    require(not destination.exists())
    for r in m['files']:
        p = source / (r['name'] + '.sqlite')
        require(sha(p) == r['sha256'])
        db_integrity(p)
    destination.mkdir(mode=0o700)
    for r in m['files']:
        shutil.copyfile(source / (r['name'] + '.sqlite'), destination / (r['name'] + '.sqlite'))
        os.chmod(destination / (r['name'] + '.sqlite'), 0o600)
        db_integrity(destination / (r['name'] + '.sqlite'))


def health(port):
    with urlopen('http://127.0.0.1:' + str(port) + '/health', timeout=10) as r:
        d = json.load(r)
    require(d.get('ok') is True)
    if port == 8443:
        require(d.get('roomsEnabled') is False and d.get('starsConfigured') is False and d.get('adsConfigured') is False)


def control_health():
    # Read-only check of the existing other game; no Docker CLI or service action.
    with urlopen('http://127.0.0.1:18080/', timeout=10) as r:
        require(r.status == 200)
        return hashlib.sha256(r.read()).hexdigest()


def pinned_files(plan):
    required = {'/etc/caddy/Caddyfile', '/etc/manager-telegram/adapter.env', '/etc/manager-online/cosmetics.env'}
    require(required.issubset(plan['configSha256']))
    for name, digest in plan['configSha256'].items():
        p = Path(name)
        require(p.is_absolute() and p.is_file() and not p.is_symlink() and sha(p) == digest)
        if name.endswith('.env'):
            require(p.stat().st_uid == 0 and p.stat().st_mode & 0o027 == 0)
    for unit in UNITS:
        require(hashlib.sha256(command('systemctl', 'cat', unit)).hexdigest() == plan['unitSha256'][unit])


def selected_environment(unit, plan):
    keys = {'ROOM_DATABASE', 'ROOM_EXTENSION', 'TELEGRAM_DATABASE', 'TELEGRAM_MODE',
            'PORT', 'COSMETIC_RPC_PORT', 'STARS_ENABLED', 'ADS_VERIFIED_GATEWAY_ENABLED'}
    selected = {}
    for value in shlex.split(command('systemctl', 'show', unit, '-p', 'Environment', '--value').decode()):
        if '=' in value and value.split('=', 1)[0] in keys:
            key, value = value.split('=', 1)
            selected[key] = value
    files = shlex.split(command('systemctl', 'show', unit, '-p', 'EnvironmentFiles', '--value').decode())
    for file in (f for f in files if Path(f).is_absolute()):
        require(file in plan['configSha256'] and sha(file) == plan['configSha256'][file])
        for line in Path(file).read_text().splitlines():
            if '=' not in line:
                continue
            key, value = line.split('=', 1)
            if key.strip() in keys:
                parts = shlex.split(value, comments=True)
                require(len(parts) == 1)
                selected[key.strip()] = parts[0]
    unset = shlex.split(command('systemctl', 'show', unit, '-p', 'UnsetEnvironment', '--value').decode())
    require(not any(v.split('=', 1)[0] in keys for v in unset))
    return selected


def validate(plan):
    version = tuple(int(p) for p in command(NODE, '-p', 'process.versions.node').decode().strip().split('.'))
    require((24, 22, 1) <= version < (25, 0, 0))
    require(plan['version'] == 1 and plan['databases'] == DATABASES)
    require(plan['candidateCommit'] == plan['approvedCommit'])
    require(sha(plan['manifest']) == plan['manifestSha256'])
    m = json.loads(Path(plan['manifest']).read_text())
    require(m['version'] == 1 and m['commit'] == plan['candidateCommit'])
    require(sorted(r['kind'] for r in m['runtimes']) == ['adapter', 'rooms'])
    require(sha(plan['goReport']) == plan['goReportSha256'])
    go = json.loads(Path(plan['goReport']).read_text())
    require(go.get('decision') == 'GO' and go.get('checks') and all(c.get('status') == 'PASS' for c in go['checks']))
    candidates = go.get('candidates', go.get('archives', []))
    for r in m['runtimes']:
        require(Path(r['file']).name == r['file'])
        require(sha(Path(plan['manifest']).parent / r['file']) == r['sha256'])
        require(any(c.get('kind') == r['kind'] and c.get('commit') == m['commit'] and c.get('sha256') == r['sha256'] for c in candidates))
    for kind, root in ROOTS.items():
        current = root / 'current'
        require(current.is_symlink())
        old = current.resolve()
        require(old.parent == root / 'releases' and str(old) == plan['installed'][kind]['target'])
        require(tree_sha(old) == plan['installed'][kind]['treeSha256'])
        expected_script = 'online/server.cjs' if kind == 'rooms' else 'telegram/server.cjs'
        unit = UNITS[0] if kind == 'rooms' else UNITS[1]
        require(command('systemctl', 'show', unit, '-p', 'WorkingDirectory', '--value').decode().strip() == str(current))
        start = command('systemctl', 'show', unit, '-p', 'ExecStart', '--value').decode()
        require(NODE in start and expected_script in start)
    start = command('systemctl', 'show', UNITS[2], '-p', 'ExecStart', '--value').decode()
    require(NODE in start and 'telegram/poller.cjs' in start)
    pinned_files(plan)
    rooms = selected_environment(UNITS[0], plan)
    adapter = selected_environment(UNITS[1], plan)
    poller = selected_environment(UNITS[2], plan)
    require(rooms.get('ROOM_DATABASE') == DATABASES['rooms'] and rooms.get('ROOM_EXTENSION') == 'telegram')
    require(adapter.get('TELEGRAM_DATABASE') == DATABASES['telegram'] and adapter.get('TELEGRAM_MODE') == 'adapter')
    require(rooms.get('PORT', '8080') == '8080' and adapter.get('PORT', '8443') == '8443')
    require(adapter.get('COSMETIC_RPC_PORT', '8444') == '8444' and poller.get('PORT', '8443') == '8443')
    require(adapter.get('STARS_ENABLED', '0') == '0' and adapter.get('ADS_VERIFIED_GATEWAY_ENABLED', '0') == '0')
    for unit in UNITS:
        command('systemctl', 'is-active', '--quiet', unit)
    for db in DATABASES.values():
        require(Path(db).is_file() and not Path(db).is_symlink())
    require(Path('/proc/meminfo').read_text().split('MemAvailable:')[1].split()[0].isdigit())
    require(int(Path('/proc/meminfo').read_text().split('MemAvailable:')[1].split()[0]) >= 262144)
    needed = sum(Path(p).stat().st_size + (Path(p + '-wal').stat().st_size if Path(p + '-wal').exists() else 0) for p in DATABASES.values()) * 6
    needed += sum((Path(plan['manifest']).parent / r['file']).stat().st_size for r in m['runtimes']) * 4
    require(shutil.which('fuser') and all(shutil.disk_usage(p).free >= max(1073741824, needed) for p in ['/opt', '/var/lib', '/root']))
    health(8080); health(8443)
    return m


def switch(root, target):
    temporary = root / ('.next-' + uuid.uuid4().hex)
    os.symlink(target, temporary)
    os.replace(temporary, root / 'current')


def update_code(old, new, switcher, service, verify):
    """Code-only transaction. No snapshot/config restoration, including on failure."""
    try:
        for unit in reversed(UNITS):
            service('stop', unit)
        verify('quiesced')
        for kind in ROOTS:
            switcher(ROOTS[kind], new[kind])
        service('start', UNITS[1]); service('start', UNITS[0])
        verify('candidate')
        service('start', UNITS[2]); verify('poller')
    except BaseException:
        failed = []
        actions = [lambda u=u: service('stop', u) for u in reversed(UNITS)]
        actions += [lambda k=k: switcher(ROOTS[k], old[k]) for k in ROOTS]
        actions += [lambda u=u: service('start', u) for u in (UNITS[1], UNITS[0], UNITS[2])]
        actions += [lambda: verify('rollback')]
        for action in actions:
            try:
                action()
            except BaseException:
                failed.append(True)
        require(not failed)
        raise


def apply(plan, manifest):
    old = {k: (r / 'current').resolve() for k, r in ROOTS.items()}
    new = {}
    for r in manifest['runtimes']:
        target = ROOTS[r['kind']] / 'releases' / (manifest['commit'] + '-' + r['sha256'])
        require(not target.exists())
        archive = Path(plan['manifest']).parent / r['file']
        js = "require(process.argv[1]).extractArchive(process.argv[2],JSON.parse(require('fs').readFileSync(process.argv[3])),process.argv[4],process.argv[5])"
        command(NODE, '-e', js, str(Path(__file__).with_name('preflight-archive.cjs')), str(archive), plan['manifest'], r['kind'], str(target))
        for p in [target, *target.rglob('*')]:
            os.chmod(p, 0o755 if p.is_dir() else 0o644)
        new[r['kind']] = target
    # Poller and the root-run backup helper must remain the existing reviewed code.
    for kind, file in [('adapter', 'telegram/poller.cjs'), ('rooms', 'online/vps/backup.sh')]:
        require(sha(old[kind] / file) == sha(new[kind] / file))
        shutil.copymode(old[kind] / file, new[kind] / file)
    before_control = control_health()
    folder = Path(tempfile.mkdtemp(prefix='manager-release-', dir='/root'))
    os.chmod(folder, 0o700)
    with tarfile.open(folder / 'private-config-and-code.tar', 'x') as tar:
        for i, f in enumerate(plan['configSha256']):
            tar.add(f, arcname='config/' + f.lstrip('/'), recursive=False)
        for unit in UNITS:
            for prop in ('FragmentPath', 'DropInPaths'):
                for f in command('systemctl', 'show', unit, '-p', prop, '--value').decode().split():
                    require(Path(f).is_file() and not Path(f).is_symlink())
                    tar.add(f, arcname='systemd/' + f.lstrip('/'), recursive=False)
        for kind, p in old.items():
            tar.add(p, arcname='release/' + kind)
    for unit in UNITS:
        (folder / (unit + '.txt')).write_bytes(command('systemctl', 'cat', unit))
    (folder / 'old-targets.json').write_text(json.dumps({k: str(v) for k, v in old.items()}))

    def verify(stage):
        pinned_files(plan)
        if stage == 'quiesced':
            for unit in UNITS:
                require(subprocess.run(['systemctl', 'is-active', '--quiet', unit], stdout=subprocess.PIPE, stderr=subprocess.PIPE).returncode == 3)
            for source in DATABASES.values():
                paths = [p for p in [source, source + '-wal', source + '-shm'] if Path(p).exists()]
                require(subprocess.run(['fuser', *paths], stdout=subprocess.PIPE, stderr=subprocess.PIPE).returncode == 1)
            snapshot(DATABASES, folder / 'sqlite')
            restore_isolated(folder / 'sqlite', folder / 'restore-check')
        else:
            for _ in range(15):
                try:
                    health(8080); health(8443)
                    break
                except Exception:
                    time.sleep(1)
            else:
                raise RuntimeError('Health failed')
            if stage == 'candidate':
                for kind, port, html in [('rooms', 8080, 'online/dist/index.html'), ('adapter', 8443, 'telegram/dist/index.html')]:
                    with urlopen('http://127.0.0.1:' + str(port) + '/index.html', timeout=10) as r:
                        require(hashlib.sha256(r.read()).hexdigest() == sha(new[kind] / html))
            if stage in ('poller', 'rollback'):
                for unit in UNITS:
                    command('systemctl', 'is-active', '--quiet', unit)
                require(control_health() == before_control)
            if stage == 'poller':
                (folder / 'RESULT.json').write_text(json.dumps({'commit': manifest['commit'], 'status': 'PASS', 'databaseRestored': False}))

    update_code(old, new, switch, lambda op, unit: command('systemctl', op, unit), verify)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--approve-commit')
    args = parser.parse_args()
    require(os.name == 'posix' and fcntl is not None and os.geteuid() == 0)
    p = Path(args.plan)
    require(p.is_file() and not p.is_symlink() and p.stat().st_uid == 0 and p.stat().st_mode & 0o077 == 0)
    plan = json.loads(p.read_text())
    if args.apply:
        require(args.approve_commit == plan['candidateCommit'])
    os.umask(0o077)
    if args.apply:
        descriptor = os.open('/run/lock/manager-shared-release.lock',
                             os.O_CREAT | os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'r+') as lock:
            require(os.fstat(lock.fileno()).st_uid == 0 and os.fstat(lock.fileno()).st_mode & 0o077 == 0)
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            manifest = validate(plan)
            apply(plan, manifest)
    else:
        validate(plan)
    print('PASS: ' + ('code update checked' if args.apply else 'read-only prerequisites checked; no deployment'))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('NO-GO: ' + type(error).__name__ + '; no automatic database restore; review privately')
        raise SystemExit(1)
