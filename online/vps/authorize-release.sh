#!/bin/bash
# Run once as root from the approved, checked-out commit with the CI public key.
set -euo pipefail
[[ $(id -u) == 0 && $# == 1 ]]
key=$1
[[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+$ ]]
command -v python3 >/dev/null
command -v visudo >/dev/null
host_key=$(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256 | awk '{print $2}')
[[ "$host_key" == 'SHA256:SioODsmXmZkohbAhscXnRxVzwTHrw/eHHAUiMEOLT+U' ]]
source_dir=$(cd "$(dirname "$0")" && pwd)
user=manager-release
home_dir=/var/lib/manager-release
if ! getent passwd "$user" >/dev/null; then
  useradd --system --create-home --home-dir "$home_dir" --shell /bin/sh "$user"
fi
[[ $(getent passwd "$user" | cut -d: -f6) == "$home_dir" ]]
install -d -o root -g root -m 0755 /usr/local/lib/manager-online
install -o root -g root -m 0644 "$source_dir/unpack-release.py" /usr/local/lib/manager-online/
install -o root -g root -m 0755 "$source_dir/update-release.sh" /usr/local/sbin/manager-release-20491
temp=$(mktemp -d)
trap 'rm -rf -- "$temp"' EXIT
cat > "$temp/sudoers" <<'RULES'
Defaults!/usr/local/sbin/manager-release-20491 env_keep += "SSH_ORIGINAL_COMMAND"
manager-release ALL=(root) NOPASSWD: /usr/local/sbin/manager-release-20491 ""
RULES
visudo -cf "$temp/sudoers"
install -o root -g root -m 0440 "$temp/sudoers" /etc/sudoers.d/manager-release-20491
install -d -o "$user" -g "$user" -m 0700 "$home_dir/.ssh"
printf 'restrict,command="/usr/bin/sudo -n /usr/local/sbin/manager-release-20491" %s manager-vps-release\n' "$key" > "$temp/key"
install -o "$user" -g "$user" -m 0600 "$temp/key" "$home_dir/.ssh/authorized_keys"
