"""Add installation metadata to the exact generated web game."""
from pathlib import Path
import hashlib
import shutil

root = Path(__file__).resolve().parents[1]
web = root / "web"
game = (root / "mobile/web/index.html").read_bytes()
metadata = """<meta charset="utf-8">
<meta name="theme-color" content="#17384d">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Менеджер">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="apple-touch-icon" href="./manager-icon.png">
<script>
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch(error => console.warn("Offline cache unavailable", error));
}
</script>
""".encode("utf-8")
assert game.count(b"<head>") == 1
assert b"manager-peer-server.onrender.com" in game
index = game.replace(b"<head>", b"<head>" + metadata, 1)
(root / "index.html").write_bytes(index)
for name in ("manifest.webmanifest", "manager-icon.png"):
    shutil.copyfile(web / name, root / name)
worker = (web / "sw.js").read_bytes()
version = hashlib.sha256(index + worker + (web / "manifest.webmanifest").read_bytes()
                         + (web / "manager-icon.png").read_bytes()).hexdigest()[:16]
(root / "sw.js").write_bytes(worker.replace(b"__CACHE_VERSION__", version.encode()))
