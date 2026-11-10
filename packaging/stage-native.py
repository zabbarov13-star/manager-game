"""Stage the same generated game for each native wrapper."""
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parent.parent
dist = root / "online/dist"
platform = sys.argv[1]
html = (dist / "index.html").read_text(encoding="utf-8")
html = html.replace('if ("serviceWorker" in navigator && window.isSecureContext) {',
                    'if (false) {', 1)
if platform == "android":
    target = root / "packaging/android/app/assets"
    icon = root / "packaging/android/app/src/main/res/mipmap-xxxhdpi/manager_icon.png"
    icon.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(dist / "manager-icon.png", icon)
elif platform == "desktop":
    target = root / "packaging/desktop/game"
elif platform == "ios":
    target = root / "packaging/ios/Manager"
else:
    raise SystemExit("Choose android, desktop or ios")
target.mkdir(parents=True, exist_ok=True)
bridge = ""
if platform == "android":
    bridge = """
    <script>
    (() => {
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (!this.download || !this.href.startsWith('blob:')) return click.call(this);
        const name = this.download;
        fetch(this.href).then(response => response.text())
          .then(text => window.ManagerAndroid.saveText(name, text, 'application/json'));
      };
    })();
    </script>
    """
elif platform == "ios":
    bridge = """
    <script>
    (() => {
      const send = message => window.webkit.messageHandlers.manager.postMessage(message);
      window.ManagerNative = {openOnline: () => send({action: 'online'})};
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (!this.download || !this.href.startsWith('blob:')) return click.call(this);
        const name = this.download;
        fetch(this.href).then(response => response.text())
          .then(text => send({action: 'export', name, text}));
      };
    })();
    </script>
    """
if bridge:
    html = html.replace("<head>", "<head>" + bridge, 1)
(target / ("game.html" if platform == "ios" else "index.html")).write_text(
    html, encoding="utf-8")
if platform != "ios":
    for name in ("manifest.webmanifest", "sw.js", "manager-icon.png"):
        shutil.copyfile(dist / name, target / name)
