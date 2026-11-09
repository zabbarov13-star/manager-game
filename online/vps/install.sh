#!/bin/bash
# Run as an authorized administrator from a trusted release bundle.
set -euo pipefail
test "$(id -u)" = 0
domain=${1:?Pass the hostname already pointed at this VPS}
ssh_port=${2:-22}
[[ "$domain" =~ ^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$ && "$ssh_port" =~ ^[0-9]{1,5}$ ]]
(( 10#$ssh_port >= 1 && 10#$ssh_port <= 65535 ))
if [[ "$domain" =~ ^[0-9.]+$ ]]; then echo 'A DNS hostname is required by this installer.' >&2; exit 2; fi
root=$(cd "$(dirname "$0")/../.." && pwd)
if [[ ! -s "$root/online/dist/index.html" || ! -s "$root/online/dist/engine.cjs" ]]; then
  test -s "$root/online/generate.cjs"
  test -s "$root/index.html"
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils caddy sqlite3 nftables unattended-upgrades
case "$(dpkg --print-architecture)" in amd64) arch=x64;; arm64) arch=arm64;; *) exit 3;; esac
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
cd "$tmp"
base=https://nodejs.org/dist/latest-v24.x
curl -fSsL "$base/SHASUMS256.txt" -o sums
node_file=$(awk -v suffix="-linux-$arch.tar.xz" '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$/ && index($2,suffix) {print $2}' sums)
[[ "$node_file" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]]
curl -fSsL "$base/$node_file" -o "$node_file"
awk -v name="$node_file" '$2==name' sums | sha256sum -c -
mkdir node
tar -xJf "$node_file" --strip-components=1 -C node
node_dir="/opt/manager-node-releases/${node_file%.tar.xz}"
install -d /opt/manager-node-releases
if [[ ! -d "$node_dir" ]]; then mv node "$node_dir"; fi
ln -sfn "$node_dir" /opt/manager-node
if [[ ! -s "$root/online/dist/index.html" || ! -s "$root/online/dist/engine.cjs" ]]; then
  /opt/manager-node/bin/node "$root/online/generate.cjs"
fi
test -s "$root/online/dist/index.html"
test -s "$root/online/dist/engine.cjs"
getent passwd manager-online >/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin manager-online
install -d -m 0700 /var/backups/manager-online
install -d /opt/manager-online/releases
release=$(cd "$root"; sha256sum online/dist/index.html online/server.cjs online/vps/backup.sh | sha256sum | cut -c1-20)
destination="/opt/manager-online/releases/$release"
if [[ ! -d "$destination" ]]; then
  install -d "$destination/online/vps"
  cp -R "$root/online/dist" "$destination/online/"
  install -m 0644 "$root/online/server.cjs" "$destination/online/"
  install "$root/online/vps/backup.sh" "$destination/online/vps/"
fi
old=$(readlink /opt/manager-online/current || true)
ln -sfn "$destination" /opt/manager-online/current
for file in manager-online.service manager-backup.service manager-backup.timer; do
  install -m 0644 "$root/online/vps/$file" /etc/systemd/system/
done
systemctl daemon-reload
systemctl enable manager-online.service manager-backup.timer
systemctl restart manager-online.service
if ! curl --retry 8 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:8080/health; then
  if [[ -n "$old" ]]; then
    ln -sfn "$old" /opt/manager-online/current
    systemctl restart manager-online.service
  else
    systemctl stop manager-online.service
  fi
  exit 4
fi
systemctl start manager-backup.timer
# Keep unrelated Caddy configuration intact. This installer is for a dedicated VPS.
cat > "$tmp/Caddyfile" <<CADDY
$domain {
  encode gzip
  reverse_proxy 127.0.0.1:8080 {
    header_up X-Real-IP {remote_host}
  }
}
CADDY
caddy validate --config "$tmp/Caddyfile" --adapter caddyfile
if [[ -f /etc/caddy/Caddyfile && ! -e /etc/caddy/Caddyfile.manager-original ]]; then
  cp -p /etc/caddy/Caddyfile /etc/caddy/Caddyfile.manager-original
fi
install -m 0644 "$tmp/Caddyfile" /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy
cat > /etc/manager-online-firewall.nft <<NFT
table inet manager_online {
 chain input {
  type filter hook input priority 10; policy drop;
  iifname "lo" accept
  ct state established,related accept
  ip protocol icmp accept
  ip6 nexthdr ipv6-icmp accept
  tcp dport { $ssh_port, 80, 443 } accept
 }
}
NFT
cat > /etc/systemd/system/manager-firewall.service <<'UNIT'
[Unit]
Description=Manager VPS inbound firewall
Before=network-pre.target
After=nftables.service
Wants=network-pre.target
[Service]
Type=oneshot
RemainAfterExit=true
ExecStartPre=-/usr/sbin/nft delete table inet manager_online
ExecStart=/usr/sbin/nft -f /etc/manager-online-firewall.nft
[Install]
WantedBy=multi-user.target
UNIT
nft -c -f /etc/manager-online-firewall.nft || nft list table inet manager_online >/dev/null
systemctl daemon-reload
systemctl enable manager-firewall.service
systemctl restart manager-firewall.service
install -d /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=100M\nRuntimeMaxUse=40M\n' > /etc/systemd/journald.conf.d/manager-size.conf
systemctl restart systemd-journald
systemctl start manager-backup.service
curl --retry 8 --retry-all-errors --retry-delay 3 -fsS "https://$domain/health"
