#!/bin/bash
set -euo pipefail
app=ru.manager.backtothepast.preview
adb install -r release-output/Manager-Android-preview.apk
for attempt in 1 2; do
  adb logcat -c
  adb shell am start -W -n "$app/ru.manager.backtothepast.MainActivity"
  for i in {1..35}; do
    if adb logcat -d -s ManagerWeb:I | grep -F 'MANAGER_READY {"secure":true' > "$RUNNER_TEMP/manager-android-ready"; then
      cat "$RUNNER_TEMP/manager-android-ready"
      break
    fi
    sleep 1
  done
  test -s "$RUNNER_TEMP/manager-android-ready"
  rm "$RUNNER_TEMP/manager-android-ready"
  adb shell am force-stop "$app"
done
