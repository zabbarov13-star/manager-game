#!/bin/bash
set -euo pipefail
umask 077
[[ $(id -u) == 0 && $# == 4 ]]
expiry=$1
key=$2
digest=$3
html=$4
commit=a62f93437fcde83abc6cc3236a13f905b43cd3d0
[[ "$expiry" =~ ^[0-9]{14}Z$ ]]
[[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+\ manager-pr3-[0-9]+-[0-9]+$ ]]
[[ "$digest" =~ ^[a-f0-9]{64}$ && "$html" =~ ^[a-f0-9]{64}$ ]]
expires=$(date -u -d "${expiry:0:4}-${expiry:4:2}-${expiry:6:2} ${expiry:8:2}:${expiry:10:2}:${expiry:12:2} UTC" +%s)
now=$(date +%s)
((expires > now && expires - now <= 2100))
[[ $(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256 | awk '{print $2}') == 'SHA256:SioODsmXmZkohbAhscXnRxVzwTHrw/eHHAUiMEOLT+U' ]]
user=manager-pr3-deploy
home=/var/lib/manager-pr3-deploy
dir=$(mktemp -d)
trap 'rm -rf -- "$dir"' EXIT
git init -q "$dir"
git -C "$dir" fetch -q --depth=1 https://github.com/zabbarov13-star/manager-game.git "$commit"
[[ $(git -C "$dir" rev-parse FETCH_HEAD) == "$commit" ]]
git -C "$dir" show FETCH_HEAD:online/vps/unpack-release.py > "$dir/unpack-release.py"
git -C "$dir" show FETCH_HEAD:online/vps/update-release.sh > "$dir/update-release.sh"
# Check the external HTTPS route while rollback is still armed.
sed -i 's/ --resolve "\$domain:443:127\.0\.0\.1"//g' "$dir/update-release.sh"
sed -i '/^expected=/a [[ $expected == '"$html"' ]]' "$dir/update-release.sh" 
bash -n "$dir/update-release.sh"
exec 9>/run/lock/manager-pr3-once.lock
flock -n 9
if ! id "$user" >/dev/null 2>&1; then
  useradd --system --home-dir "$home" --shell /bin/sh "$user"
fi
[[ $(getent passwd "$user" | cut -d: -f6) == "$home" ]]
install -d -o root -g root -m 0755 "$home" "$home/.ssh" /usr/local/lib/manager-online
install -o root -g root -m 0644 "$dir/unpack-release.py" /usr/local/lib/manager-online/unpack-release.py
install -o root -g root -m 0755 "$dir/update-release.sh" /usr/local/lib/manager-online/pr3-update.sh
cat > "$dir/run" <<RUN
#!/bin/bash
set -euo pipefail
[[ \$# == 0 ]]
exec 9>/run/lock/manager-pr3-once.lock
flock -n 9
test -f '$home/.ssh/authorized_keys'
rm -f '$home/.ssh/authorized_keys' /etc/sudoers.d/manager-pr3-once
export SSH_ORIGINAL_COMMAND='deploy $commit $digest'
/usr/local/lib/manager-online/pr3-update.sh
test "\$(curl -fsS --max-time 20 https://95-181-169-84.sslip.io/index.html | sha256sum | cut -d ' ' -f1)" = '$html'
echo 'Temporary SSH authorization removed'
RUN
bash -n "$dir/run"
install -o root -g root -m 0755 "$dir/run" /usr/local/sbin/manager-pr3-once
printf '%s\n' 'manager-pr3-deploy ALL=(root) NOPASSWD: /usr/local/sbin/manager-pr3-once ""' > "$dir/sudo"
visudo -cf "$dir/sudo"
install -o root -g root -m 0440 "$dir/sudo" /etc/sudoers.d/manager-pr3-once
printf 'restrict,expiry-time="%s",command="/usr/bin/sudo -n /usr/local/sbin/manager-pr3-once" %s\n' "$expiry" "$key" > "$dir/authorized_keys"
install -o root -g root -m 0644 "$dir/authorized_keys" "$home/.ssh/authorized_keys"
printf 'Temporary authorization ready until %s UTC\n' "$expiry"
