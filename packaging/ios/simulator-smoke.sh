#!/bin/bash
set -euo pipefail
app=$1
bundle=ru.manager.backtothepast.preview
sim=$(xcrun simctl list -j devices available | python3 -c 'import json,sys; values=json.load(sys.stdin)["devices"]; print(next(d["udid"] for devices in reversed(list(values.values())) for d in devices if d["name"].startswith("iPhone")))')
xcrun simctl boot "$sim"
trap 'xcrun simctl shutdown "$sim" || true' EXIT
xcrun simctl bootstatus "$sim" -b
xcrun simctl install "$sim" "$app"
for pass in 1 2; do
  data=$(xcrun simctl get_app_container "$sim" "$bundle" data)
  probe="$data/Library/Caches/manager-smoke.json"
  rm -f "$probe"
  xcrun simctl launch "$sim" "$bundle" -manager-smoke
  for i in {1..45}; do [[ -s "$probe" ]] && break; sleep 1; done
  cat "$probe"
  python3 -c 'import json,sys; data=json.load(open(sys.argv[1])); assert data["native"] and data["body"]>100 and data["storage"]=="persisted"; assert sys.argv[2]=="1" or data["previous"]=="persisted"' "$probe" "$pass"
  xcrun simctl terminate "$sim" "$bundle"
done
