"""Reconstruct the delivered APK from its public signature bytes and embedded game, then test it."""
from pathlib import Path
import hashlib
import json
import os
import base64
import struct
import sys
import zipfile
import zlib
import subprocess
import tempfile
import time

def run(*args, timeout=120):
    return subprocess.check_output(args, stderr=subprocess.STDOUT, timeout=timeout)

out = Path('mobile/out')
out.mkdir(exist_ok=True)
recipe = json.loads(Path('mobile/tests/android-apk-qa.json').read_text())
asset = Path('mobile/android/assets/game.html')
sdk = Path(os.environ['ANDROID_SDK_ROOT'])
with tempfile.TemporaryDirectory() as directory:
    work = Path(directory)
    compressor = zlib.compressobj(level=9, wbits=-15)
    compressed = compressor.compress(asset.read_bytes()) + compressor.flush()
    if hashlib.sha256(compressed).hexdigest() != recipe['assetDeflateSha256']:
        aapt = str(sdk / 'build-tools/35.0.0/aapt2')
        run(aapt, 'compile', '--dir', 'mobile/android/res', '-o', str(work / 'res.zip'))
        run(aapt, 'link', '-o', str(work / 'assets.apk'), '-I', str(sdk / 'platforms/android-35/android.jar'),
            '--manifest', 'mobile/android/AndroidManifest.xml', '-A', str(asset.parent), str(work / 'res.zip'))
        packed = (work / 'assets.apk').read_bytes()
        with zipfile.ZipFile(work / 'assets.apk') as archive:
            info = archive.getinfo('assets/game.html')
            offset = info.header_offset + 30 + sum(struct.unpack_from('<HH', packed, info.header_offset + 26))
            compressed = packed[offset:offset+info.compress_size]
    assert hashlib.sha256(compressed).hexdigest() == recipe['assetDeflateSha256'], 'Asset stream differs'
    apk = work / 'qa.apk'
    apk.write_bytes(base64.b64decode(recipe['before']) + compressed + base64.b64decode(recipe['after']))
    assert hashlib.sha256(apk.read_bytes()).hexdigest() == recipe['apkSha256'], 'Signed APK bytes differ'
    run(str(sdk / 'build-tools/35.0.0/apksigner'), 'verify', str(apk))
    print('Exact signed APK verified:', recipe['apkSha256'], flush=True)
    if '--verify-only' in sys.argv:
        sys.exit(0)
    adb = str(Path(os.environ['ANDROID_SDK_ROOT']) / 'platform-tools/adb')
    run(adb, 'wait-for-device', timeout=600)
    deadline = time.monotonic() + 600
    while run(adb, 'shell', 'getprop', 'sys.boot_completed', timeout=15).strip() != b'1':
        if time.monotonic() > deadline:
            raise TimeoutError('Android emulator did not finish booting')
        time.sleep(5)
    run(adb, 'shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
    install = run(adb, 'install', str(apk))
    assert b'Success' in install, install
    run(adb, 'logcat', '-c')
    package = recipe['applicationId']
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
        'applicationId':package,'apkSha256':recipe['apkSha256'],'physicalDevice':False},indent=2))
