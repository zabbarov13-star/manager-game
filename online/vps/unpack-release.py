"""Extract exactly the runtime files into a new private staging directory."""
import hashlib
import re
import pathlib
import shutil
import sys
import tarfile

FILES = {
    "online/server.cjs",
    "online/dist/index.html",
    "online/dist/engine.cjs",
    "online/dist/sw.js",
    "online/dist/manifest.webmanifest",
    "online/dist/manager-icon.png",
}

def unpack(archive, destination):
    root = pathlib.Path(destination)
    seen = set()
    with tarfile.open(archive, "r:gz") as bundle:
        for item in bundle:
            if (not item.isfile() or not (item.name in FILES or re.fullmatch(r"online/dist/assets/runtime/[a-f0-9]{64}\.(webp|png|jpg|mp3|woff2?|ttf|svg)",item.name)) or item.name in seen
                    or not 0 < item.size <= 32 * 1024 * 1024):
                raise ValueError("Unexpected runtime archive entry")
            seen.add(item.name)
            target = root / item.name
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.extractfile(item) as source, target.open("xb") as output:
                shutil.copyfileobj(source, output)
            if item.name not in FILES:
                expected = pathlib.PurePosixPath(item.name).stem
                if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
                    raise ValueError("Runtime media hash mismatch")
        if not FILES.issubset(seen):
            raise ValueError("Incomplete runtime archive")

if __name__ == "__main__":
    unpack(*sys.argv[1:])
