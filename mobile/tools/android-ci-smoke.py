"""Build an ephemeral Android QA APK and exercise it in the emulator."""
from pathlib import Path
import hashlib
import json
import os
import secrets
import subprocess
import tempfile
import time

def run(*args, timeout=120):
    return subprocess.check_output(args, stderr=subprocess.STDOUT, timeout=timeout)

out = Path('mobile/out')
out.mkdir(exist_ok=True)
profile_path = Path('mobile/android/release.json')
profile = json.loads(profile_path.read_text())
with tempfile.TemporaryDirectory() as directory:
    key = Path(directory) / 'qa.p12'
    password = Path(directory) / 'password.txt'
    password.write_text(secrets.token_urlsafe(32))
    password.chmod(0o600)
    signing = ['-keystore', str(key), '-storepass:file', str(password), '-alias', profile['alias']]
    run('keytool', '-genkeypair', *signing, '-keyalg', 'RSA', '-keysize', '3072',
        '-validity', '2', '-dname', 'CN=Manager CI QA')
    profile['certificateSha256'] = hashlib.sha256(run('keytool', '-exportcert', *signing)).hexdigest()
    profile_path.write_text(json.dumps(profile))
    subprocess.run(['python3', 'mobile/android/build.py', '--sdk', os.environ['ANDROID_SDK_ROOT'],
        '--html', 'mobile/android/assets/game.html', '--output', str(Path(directory) / 'qa.apk'),
        '--keystore', str(key), '--password-file', str(password)], check=True)
    adb = str(Path(os.environ['ANDROID_SDK_ROOT']) / 'platform-tools/adb')
    run(adb, 'wait-for-device', timeout=600)
    deadline = time.monotonic() + 600
    while run(adb, 'shell', 'getprop', 'sys.boot_completed', timeout=15).strip() != b'1':
        if time.monotonic() > deadline:
            raise TimeoutError('Android emulator did not finish booting')
        time.sleep(5)
    run(adb, 'shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
    install = run(adb, 'install', str(Path(directory) / 'qa.apk'))
    assert b'Success' in install, install
    run(adb, 'logcat', '-c')
    package = profile['applicationId']
    launch = run(adb, 'shell', 'am', 'start', '-W', '-n', package + '/ru.manager.backtothepast.MainActivity')
    (out / 'android-launch.txt').write_bytes(launch)
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        logs = run(adb, 'logcat', '-d', '-s', 'ManagerWeb:I', 'AndroidRuntime:E')
        if b'MANAGER_READY' in logs:
            break
        time.sleep(2)
    (out / 'android-runtime.txt').write_bytes(logs)
    assert b'MANAGER_READY' in logs and b'FATAL EXCEPTION' not in logs, 'WebView readiness not confirmed'
    (out / 'android-qa.json').write_text(json.dumps({'installed':True,'launchedOffline':True,
        'applicationId':package,'signature':'ephemeral QA key','physicalDevice':False},indent=2))
