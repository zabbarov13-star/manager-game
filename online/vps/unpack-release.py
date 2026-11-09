"""Extract exactly the runtime files into a new private staging directory."""
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
    "online/vps/backup.sh",
}

def unpack(archive, destination):
    root = pathlib.Path(destination)
    seen = set()
    with tarfile.open(archive, "r:gz") as bundle:
        for item in bundle:
            if (not item.isfile() or item.name not in FILES or item.name in seen
                    or not 0 < item.size <= 32 * 1024 * 1024):
                raise ValueError("Unexpected runtime archive entry")
            seen.add(item.name)
            target = root / item.name
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.extractfile(item) as source, target.open("xb") as output:
                shutil.copyfileobj(source, output)
        if seen != FILES:
            raise ValueError("Incomplete runtime archive")
    (root / "online/vps/backup.sh").chmod(0o755)

if __name__ == "__main__":
    unpack(*sys.argv[1:])
