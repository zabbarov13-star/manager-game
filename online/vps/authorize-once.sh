#!/bin/bash
# Run as root in the owner's existing, verified SSH session.
set -euo pipefail
test "$(id -u)" = 0
expiry=${1:?expiry}
key=${2:?public key}
[[ "$expiry" =~ ^[0-9]{14}Z$ ]]
[[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+\ manager-vps-[0-9]+$ ]]
test -r /etc/ssh/ssh_host_ed25519_key.pub
command -v git >/dev/null
command -v sudo >/dev/null || { apt-get update && apt-get install -y --no-install-recommends sudo; }
if getent passwd manager-deploy >/dev/null; then
  test "$(getent passwd manager-deploy | cut -d: -f6)" = /var/lib/manager-deploy
else
  useradd --system --create-home --home-dir /var/lib/manager-deploy --shell /bin/sh manager-deploy
fi
umask 077
install -d -m 0755 /usr/local/sbin
cat > /usr/local/sbin/manager-deploy-20491 <<'RUN'
#!/bin/bash
set -euo pipefail
test "$#" -eq 0
umask 077
release=25ae33ffbb59a6da0afa008eb6f2176ae6466934
dir=$(mktemp -d)
trap 'rm -rf -- "$dir"' EXIT
git init -q "$dir"
git -C "$dir" fetch -q --depth=1 https://github.com/zabbarov13-star/manager-game.git "$release"
test "$(git -C "$dir" rev-parse FETCH_HEAD)" = "$release"
git -C "$dir" -c advice.detachedHead=false checkout -q --detach "$release"
bash "$dir/online/vps/install.sh" 95-181-169-84.sslip.io 22
systemctl is-active manager-online caddy manager-backup.timer
systemctl is-enabled manager-online manager-backup.timer manager-firewall caddy
nft list table inet manager_online >/dev/null
stat -c 'SQLite mode=%a owner=%U' /var/lib/manager-online/rooms.sqlite
MANAGER_TEST_RESTART=1 /opt/manager-node/bin/node "$dir/online/vps/live-smoke.cjs"
systemctl start manager-backup.service
backup=$(find /var/backups/manager-online -maxdepth 1 -name 'rooms-*.sqlite' -type f | sort | tail -1)
test -n "$backup"
sqlite3 "$dir/restored.sqlite" ".restore '$backup'"
test "$(sqlite3 "$dir/restored.sqlite" 'PRAGMA quick_check;')" = ok
restored=$(sqlite3 "$dir/restored.sqlite" 'SELECT count(*) FROM online_rooms;')
test "$restored" -ge 3
printf 'Verified restoration of SQLite snapshot with %s rooms\n' "$restored"
(cd "$dir"; LOAD_SECONDS=12 /opt/manager-node/bin/node online/load.cjs)
rm -f -- /var/lib/manager-deploy/.ssh/authorized_keys /etc/sudoers.d/manager-deploy-20491
RUN
chmod 0755 /usr/local/sbin/manager-deploy-20491
sudo_config=$(mktemp)
trap 'rm -f -- "$sudo_config"' EXIT
printf '%s\n' 'manager-deploy ALL=(root) NOPASSWD: /usr/local/sbin/manager-deploy-20491 ""' > "$sudo_config"
visudo -cf "$sudo_config"
install -o root -g root -m 0440 "$sudo_config" /etc/sudoers.d/manager-deploy-20491
install -d -o manager-deploy -g manager-deploy -m 0700 /var/lib/manager-deploy/.ssh
auth=$(mktemp)
printf 'restrict,expiry-time="%s",command="/usr/bin/sudo -n /usr/local/sbin/manager-deploy-20491" %s\n' "$expiry" "$key" > "$auth"
install -o manager-deploy -g manager-deploy -m 0600 "$auth" /var/lib/manager-deploy/.ssh/authorized_keys
rm -f -- "$auth"
printf 'HOST-20491 '
ssh-keygen -l -E sha256 -f /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}'
