#!/bin/bash
set -euo pipefail
dest=${1:?pass a new runtime archive path}
[[ ! -e "$dest" ]]
export LC_ALL=C
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=ustar -cf - \
  online/server.cjs online/dist/{index.html,engine.cjs,sw.js,manifest.webmanifest,manager-icon.png} | gzip -n > "$dest"
sha256sum "$dest"
