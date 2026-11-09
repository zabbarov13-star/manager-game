#!/bin/sh
set -eu
umask 077
db=${MANAGER_BACKUP_DB:-/var/lib/manager-online/rooms.sqlite}
folder=${MANAGER_BACKUP_DIR:-/var/backups/manager-online}
mkdir -p "$folder"
tmp=$(mktemp "$folder/.snapshot.XXXXXX")
trap 'rm -f -- "$tmp"' EXIT
sqlite3 "$db" ".timeout 5000" ".backup '$tmp'"
test "$(sqlite3 "$tmp" 'PRAGMA quick_check;')" = ok
mv -f -- "$tmp" "$folder/rooms-$(date -u +%Y%m%d-%H%M%S).sqlite"
find "$folder" -maxdepth 1 -type f -name 'rooms-*.sqlite' -mtime +6 -delete
