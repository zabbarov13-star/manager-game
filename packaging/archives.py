"""Build and verify the four preview ZIPs from a clean Git snapshot."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
VERSION = "0.19.1-preview.1"
TAG = "v" + VERSION
PUBLIC = ("index.html", "sw.js", "manifest.webmanifest", "manager-icon.png")
RUNTIME = PUBLIC + ("engine.cjs",)
FORBIDDEN = re.compile(r"(^|/)(\.env|id_(rsa|ed25519)|credentials\.json)(/|$)|\.(sqlite3?|db|p12|pfx|jks|keystore|mobileprovision)(-|$)", re.I)
PRIVATE_KEY = re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----")
TOKEN = re.compile(rb"(?:gh[pousr]_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{55,})")


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def checksum(data):
    return hashlib.sha256(data).hexdigest()


def files_from_commit(commit):
    with tarfile.open(fileobj=io.BytesIO(git("archive", commit))) as archive:
        return {item.name: archive.extractfile(item).read() for item in archive if item.isfile()}


def validate_file(name, data):
    assert not FORBIDDEN.search(name), name
    assert not PRIVATE_KEY.search(data), name
    assert not TOKEN.search(data), name


def write_zip(target, files):
    with ZipFile(target, "w") as archive:
        for name, data in sorted(files.items()):
            validate_file(name, data)
            info = ZipInfo(name)
            info.create_system = 3
            info.external_attr = ((0o100755 if name.endswith(".sh") else 0o100644) << 16)
            mode = ZIP_STORED if name.endswith((".zip", ".xz", ".png")) else ZIP_DEFLATED
            archive.writestr(info, data, compress_type=mode, compresslevel=6)
    with tempfile.TemporaryDirectory(dir=target.parent) as clean, ZipFile(target) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(files)
        archive.extractall(clean)
        for name, data in files.items():
            assert checksum((Path(clean) / name).read_bytes()) == checksum(data), name


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("node_runtime", type=Path)
    args = parser.parse_args()
    target = args.output.resolve()
    target.mkdir(parents=True, exist_ok=True)
    commit = git("rev-parse", "HEAD").decode().strip()
    source = files_from_commit(commit)
    date = git("show", "-s", "--format=%cI", commit).decode().strip()
    dist = {name: (ROOT / "online/dist" / name).read_bytes() for name in RUNTIME}
    metadata = json.dumps({"version": VERSION, "tag": TAG, "commit": commit, "date": date,
                           "html_sha256": checksum(dist["index.html"])}, indent=2).encode() + b"\n"
    docs = {name: source[name] for name in ("README.md", "docs/recovery-preview-ru.md")}
    common = {**docs, "VERSION.json": metadata}
    node = {}
    for line in source["packaging/node-sha256.txt"].decode().splitlines():
        expected, name = line.split()
        content = (args.node_runtime / name).read_bytes()
        assert checksum(content) == expected, name
        node["runtime/" + name] = content
    server = {name: data for name, data in source.items()
              if name.startswith("online/vps/") and not name.startswith(
                  ("online/vps/authorize-", "online/vps/host-"))}
    server.update({name: source[name] for name in ("online/server.cjs", "packaging/node-sha256.txt")})
    server.update({"online/dist/" + name: data for name, data in dist.items()})
    web = {name: dist[name] for name in PUBLIC}
    write_zip(target / "Manager-Source.zip", {**source, "VERSION.json": metadata})
    write_zip(target / "Manager-Web.zip", {**common, **web})
    write_zip(target / "Manager-Server.zip", {**common, **server, **node})
    (target / "Manager-Standalone.html").write_bytes(dist["index.html"])
    originals = ["Manager-Source.zip", "Manager-Web.zip", "Manager-Server.zip", "Manager-Standalone.html"]
    backup = {name: (target / name).read_bytes() for name in originals}
    sums = "".join(f"{checksum(data)}  {name}\n" for name, data in backup.items()).encode()
    write_zip(target / "Manager-Release-Backup.zip", {**common, **backup, "SHA256SUMS.txt": sums})
    (target / "VERSION.json").write_bytes(metadata)
    outputs = sorted(path for path in target.iterdir() if path.is_file() and path.name != "SHA256SUMS.txt")
    (target / "SHA256SUMS.txt").write_text("".join(
        f"{checksum(path.read_bytes())}  {path.name}\n" for path in outputs), encoding="ascii")


if __name__ == "__main__":
    main()
