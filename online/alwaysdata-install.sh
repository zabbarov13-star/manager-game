#!/bin/sh
# Run on the hosting account over SSH. The release archive arrives on stdin.
set -eu
umask 077
release=${1:?Missing commit SHA}
case "$release" in *[!0-9a-f]*|'') exit 2;; esac
[ "${#release}" -eq 40 ]
root="${MANAGER_DEPLOY_ROOT:-$HOME/manager-online}"
mkdir -p "$root/releases" "$root/data"
stage=$(mktemp -d "$root/releases/.upload.XXXXXXXX")
trap 'rm -rf -- "$stage"; rm -f -- "$stage.link"' EXIT
trap 'exit 1' HUP INT TERM
tar -xzf - -C "$stage"
test -s "$stage/online/dist/index.html"
test -s "$stage/online/dist/engine.cjs"
NODEJS_VERSION=24 node --check "$stage/online/alwaysdata-start.cjs"
NODEJS_VERSION=24 node -e 'require("node:sqlite")'
if [ ! -e "$root/releases/$release" ]; then
  mv -T -- "$stage" "$root/releases/$release"
fi
current="$root/current"
if [ -e "$current" ] && [ ! -L "$current" ]; then
  echo 'Refusing to replace a non-symlink current release' >&2
  exit 3
fi
ln -s -- "releases/$release" "$stage.link"
mv -Tf -- "$stage.link" "$current"
