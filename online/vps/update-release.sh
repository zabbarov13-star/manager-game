#!/bin/bash
# Installed once as a root-owned command. Receives only the runtime archive on stdin.
set -euo pipefail
umask 022
[[ $(id -u) == 0 && $# == 0 ]]
[[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})\ ([0-9a-f]{64})$ ]]
commit=${BASH_REMATCH[1]} checksum=${BASH_REMATCH[2]}
root=/opt/manager-online
node=/opt/manager-node/bin/node
domain=95-181-169-84.sslip.io
test -x "$node"
exec 9>/run/lock/manager-online-deploy.lock
flock -n 9
old=$(readlink -f "$root/current")
[[ "$old" == "$root/releases/"* && -d "$old" ]]
work=$(mktemp -d "$root/.deploy.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT
# Bound disk usage even if the sender supplies an oversized stream.
timeout 90 head -c 33554433 > "$work/bundle.tgz"
(( $(stat -c %s "$work/bundle.tgz") <= 33554432 ))
printf '%s  %s\n' "$checksum" "$work/bundle.tgz" | sha256sum -c -
mkdir "$work/release"
python3 /usr/local/lib/manager-online/unpack-release.py "$work/bundle.tgz" "$work/release"
for script in online/server.cjs online/dist/engine.cjs online/dist/sw.js; do
  "$node" --check "$work/release/$script"
done
# The timer executes this script as root. Keep the existing trusted copy outside CI's input.
install -D -o root -g root -m 0755 "$old/online/vps/backup.sh" "$work/release/online/vps/backup.sh"
release="$root/releases/$commit-$checksum"
if [[ -e "$release" ]]; then
  diff -qr "$work/release" "$release"
else
  mv -- "$work/release" "$release"
fi
expected=$(sha256sum "$release/online/dist/index.html" | cut -d ' ' -f1)
verify() {
  local served
  curl -fsS --max-time 12 --retry 5 --retry-connrefused http://127.0.0.1:8080/health >/dev/null &&
  curl -fsS --max-time 12 --resolve "$domain:443:127.0.0.1" "https://$domain/health" >/dev/null &&
  served=$(curl -fsS --max-time 20 --resolve "$domain:443:127.0.0.1" "https://$domain/index.html" | sha256sum | cut -d ' ' -f1) &&
  [[ "$served" == "$expected" ]]
}
if [[ "$old" == "$release" ]]; then
  verify
  exit
fi
systemctl start manager-backup.service
switch_to() {
  ln -sfn -- "$1" "$work/next"
  mv -Tf -- "$work/next" "$root/current"
}
rollback() {
  trap - ERR HUP INT TERM
  switch_to "$old"
  systemctl restart manager-online.service
  echo 'Candidate failed. Previous release restored.' >&2
  exit 1
}
trap rollback ERR HUP INT TERM
switch_to "$release"
systemctl restart manager-online.service
verify
trap - ERR HUP INT TERM
printf 'Verified test release %s\n' "$commit"
