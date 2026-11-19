#!/usr/bin/env python3
"""Enable a reversible Telegram long-polling fallback for Manager ONLY.

Requires root, existing Manager adapter, and outgoing HTTPS. Does not change
Caddy, Docker, game rooms, SQLite or the Smaylokrut service.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib import request

PINNED_COMMIT = "e98a25d0c0f885876ac35bc900be1e00d4c5e89e"
ORIGINAL_SERVER_BLOB = "1a33c0ce62e65cd9de018f06c989696a89c74117"
FIXED_SERVER_BLOB = "dff8ad6f24f9800ecdf7f0f44827ad9c60964774"
POLLER_BLOB = "0ad10b419bd2e53a48c2b3c80f99c9ecf12e8b2a"
NODE = "/opt/manager-node/bin/node"
RELEASE = Path("/opt/manager-telegram/current").resolve()
SERVER = RELEASE / "telegram/server.cjs"
POLLER = RELEASE / "telegram/poller.cjs"
UNIT = Path("/etc/systemd/system/manager-telegram-poller.service")
ENV = Path("/etc/manager-telegram/adapter.env")
RAW = "https://raw.githubusercontent.com/zabbarov13-star/manager-game/" + PINNED_COMMIT + "/telegram/"
SERVICE_TEXT = """[Unit]
Description=Manager Telegram outbound update poller
After=network-online.target manager-telegram.service
Wants=network-online.target
Requires=manager-telegram.service

[Service]
Type=simple
WorkingDirectory=/opt/manager-telegram/current
EnvironmentFile=/etc/manager-telegram/adapter.env
Environment=PORT=8443
ExecStart=/opt/manager-node/bin/node telegram/poller.cjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
"""


def cmd(*args, check=True):
    return subprocess.run(args, check=check, text=True, capture_output=True)


def blob_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def env_data():
    values = {}
    for line in ENV.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            values[k.strip()] = v.strip().strip('"').strip("'")
    return values


def telegram(values, method, params=None):
    token = values["TELEGRAM_BOT_TOKEN"]
    payload = json.dumps(params or {}).encode()
    req = request.Request(
        "https://api.telegram.org/bot" + token + "/" + method,
        data=payload, headers={"Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with request.urlopen(req, timeout=15) as response:
                result = json.load(response)
            if result.get("ok") is not True:
                raise RuntimeError("Telegram rejected " + method)
            return result["result"]
        except Exception:
            if attempt == 2:
                raise RuntimeError("Telegram API request failed: " + method) from None
            time.sleep(2)


def download(path, expected_blob):
    with request.urlopen(RAW + path, timeout=25) as response:
        content = response.read()
    if blob_sha(content) != expected_blob:
        raise RuntimeError("Downloaded source hash mismatch: " + path)
    return content


def write_atomic(path, data, mode=0o644):
    target = path.with_name(path.name + ".pending")
    try:
        target.write_bytes(data)
        target.chmod(mode)
        os.replace(target, path)
    finally:
        target.unlink(missing_ok=True)


def restore(backup, values):
    cmd("systemctl", "disable", "--now", "manager-telegram-poller.service", check=False)
    if (backup / "server.cjs").exists():
        write_atomic(SERVER, (backup / "server.cjs").read_bytes())
    if (backup / "poller.cjs").exists():
        write_atomic(POLLER, (backup / "poller.cjs").read_bytes())
    else:
        POLLER.unlink(missing_ok=True)
    if (backup / "poller.service").exists():
        write_atomic(UNIT, (backup / "poller.service").read_bytes())
    else:
        UNIT.unlink(missing_ok=True)
    cmd("systemctl", "daemon-reload")
    cmd("systemctl", "restart", "manager-telegram.service")
    webhook_file = backup / "webhook.json"
    if webhook_file.exists():
        old = json.loads(webhook_file.read_text())
        if old.get("url"):
            arguments = {
                "url": old["url"],
                "secret_token": values["TELEGRAM_WEBHOOK_SECRET"],
                "drop_pending_updates": False,
            }
            if old.get("allowed_updates") is not None:
                arguments["allowed_updates"] = old["allowed_updates"]
            if old.get("max_connections"):
                arguments["max_connections"] = old["max_connections"]
            if old.get("ip_address"):
                arguments["ip_address"] = old["ip_address"]
            telegram(values, "setWebhook", arguments)
    menu_file = backup / "menu.json"
    if menu_file.exists():
        telegram(values, "setChatMenuButton", {"menu_button": json.loads(menu_file.read_text())})



def wait_for_adapter(seconds=40, pause=0.5):
    """Wait for the restarted Manager adapter to bind the loopback HTTP port."""
    deadline = time.monotonic() + seconds
    last_error = "not responding"
    while time.monotonic() < deadline:
        try:
            with request.urlopen("http://127.0.0.1:8443/health", timeout=2) as response:
                health = json.load(response)
            if health.get("ok") is True and health.get("mode") == "adapter":
                cmd("systemctl", "is-active", "--quiet", "manager-telegram.service")
                return
            last_error = "unexpected health response"
        except (OSError, ValueError) as error:
            last_error = type(error).__name__
        time.sleep(pause)
    raise RuntimeError(
        "Manager adapter did not become healthy within "
        + str(seconds) + " seconds (" + last_error + ")."
    )

def install():
    if os.geteuid() != 0:
        raise RuntimeError("Run as root on the Manager VPS.")
    if not str(RELEASE).startswith("/opt/manager-telegram/releases/"):
        raise RuntimeError("Unexpected Manager release path; refusing to overwrite files.")
    if not (SERVER.is_file() and ENV.is_file() and Path(NODE).is_file()):
        raise RuntimeError("Manager adapter or configuration is missing.")
    if UNIT.exists() or POLLER.exists():
        raise RuntimeError("Poller already installed; refusing to overwrite it.")
    current = blob_sha(SERVER.read_bytes())
    if current != ORIGINAL_SERVER_BLOB:
        raise RuntimeError("Installed server differs from verified release; no changes made.")
    source_server = download("server.cjs", FIXED_SERVER_BLOB)
    source_poller = download("poller.cjs", POLLER_BLOB)
    for name, data in (("server.cjs", source_server), ("poller.cjs", source_poller)):
        with tempfile.NamedTemporaryFile(suffix=".cjs") as temp:
            temp.write(data)
            temp.flush()
            cmd(NODE, "--check", temp.name)

    values = env_data()
    bot = telegram(values, "getMe")
    if bot.get("username", "").lower() != "managergametestbot":
        raise RuntimeError("Wrong Telegram bot identity; refusing to alter it.")
    expected_url = values["PUBLIC_ORIGIN"].rstrip("/") + "/telegram/webhook"
    webhook = telegram(values, "getWebhookInfo")
    if webhook.get("url") != expected_url:
        raise RuntimeError("Unexpected webhook; refusing to alter it.")
    menu = telegram(values, "getChatMenuButton")

    backup = Path(tempfile.mkdtemp(prefix="manager-telegram-fix-", dir="/root"))
    backup.chmod(0o700)
    shutil.copy2(SERVER, backup / "server.cjs")
    (backup / "webhook.json").write_text(json.dumps(webhook))
    (backup / "menu.json").write_text(json.dumps(menu))
    print("BACKUP:", backup, flush=True)
    try:
        write_atomic(SERVER, source_server)
        write_atomic(POLLER, source_poller)
        cmd("systemctl", "restart", "manager-telegram.service")
        wait_for_adapter()

        write_atomic(UNIT, SERVICE_TEXT.encode())
        cmd("systemctl", "daemon-reload")
        telegram(values, "setChatMenuButton", {
            "menu_button": {
                "type": "web_app", "text": "Играть",
                "web_app": {"url": values["PUBLIC_ORIGIN"].rstrip("/") + "/"}}})
        telegram(values, "deleteWebhook", {"drop_pending_updates": False})
        cmd("systemctl", "enable", "--now", "manager-telegram-poller.service")
        cmd("systemctl", "is-active", "--quiet", "manager-telegram-poller.service")
        print("SUCCESS: Manager /start handler and outbound Telegram polling enabled.")
        print("Smaylokrut, Docker, Caddy and Manager room service were not modified.")
        print("Send /start to @ManagerGameTestBot; the bot should show Open game.")
        print("Rollback command: python3", Path(__file__).resolve(), "--rollback", backup)
    except Exception:
        print("Installation failed. Attempting rollback.", file=sys.stderr)
        try:
            restore(backup, values)
            print("Rollback completed.", file=sys.stderr)
        except Exception as error:
            print("Automatic rollback incomplete:", type(error).__name__, file=sys.stderr)
            print("Backup:", backup, file=sys.stderr)
        raise


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--rollback":
        if os.geteuid() != 0:
            raise SystemExit("Must be root")
        restore(Path(sys.argv[2]), env_data())
        print("Rollback completed.")
    elif len(sys.argv) == 1:
        install()
    else:
        raise SystemExit("Usage: enable-outbound-updates.py [--rollback /root/backup]")
