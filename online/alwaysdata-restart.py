"""Restart only the explicitly configured alwaysdata test site and verify its release."""
import base64
import json
import os
import re
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

account = os.environ["ACCOUNT"]
site = os.environ["SITE_ID"]
release = os.environ["GITHUB_SHA"]
key = os.environ["API_KEY"]
if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", account) or not re.fullmatch(r"[0-9]+", site):
    raise SystemExit("Invalid isolated hosting account or site ID")
if not key:
    raise SystemExit("Missing hosting API key")
credentials = base64.b64encode(f"{key} account={account}:".encode()).decode()
request = Request(f"https://api.alwaysdata.com/v1/site/{site}/restart/", method="POST",
                  headers={"Authorization": f"Basic {credentials}"})
with urlopen(request, timeout=20) as response:
    if response.status not in (200, 202, 204):
        raise SystemExit(f"Restart returned {response.status}")

url = f"https://{account}.alwaysdata.net"
for _ in range(24):
    try:
        with urlopen(f"{url}/health", timeout=5) as response:
            health = json.load(response)
        if health == {"ok": True, "release": release}:
            with urlopen(f"{url}/", timeout=10) as response:
                if "Тест онлайн".encode() in response.read():
                    print(f"Verified isolated HTTPS test site {url}/")
                    break
    except (URLError, TimeoutError, ValueError):
        pass
    time.sleep(3)
else:
    raise SystemExit("The test site did not serve the new release within the health-check budget")
