#!/bin/sh
set -eu
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
sqlite3 "$work/live.sqlite" 'PRAGMA journal_mode=WAL; CREATE TABLE online_rooms(code TEXT); INSERT INTO online_rooms VALUES("QATEST");'
MANAGER_BACKUP_DB="$work/live.sqlite" MANAGER_BACKUP_DIR="$work/backups" sh online/vps/backup.sh
set -- "$work"/backups/rooms-*.sqlite
test "$#" -eq 1
cp "$1" "$work/restored.sqlite"
test "$(sqlite3 "$work/restored.sqlite" 'PRAGMA quick_check;')" = ok
test "$(sqlite3 "$work/restored.sqlite" 'SELECT code FROM online_rooms;')" = QATEST
