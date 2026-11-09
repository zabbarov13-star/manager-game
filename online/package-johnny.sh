#!/bin/sh
# Build from the repository root. Output contains no SQLite files or credentials.
set -eu
out=${1:?Pass the output ZIP path}
case "$out" in /*) ;; *) out="$PWD/$out";; esac
test ! -e "$out"
ROOM_SHARED_HOST=1 node online/generate.cjs
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
trap 'exit 1' HUP INT TERM
mkdir "$stage/public"
: > "$stage/public/.keep"
cp online/johnny-start.cjs online/server.cjs "$stage/"
cp -R online/dist "$stage/"
(
  cd "$stage"
  zip -qr "$out" public johnny-start.cjs server.cjs dist
)
