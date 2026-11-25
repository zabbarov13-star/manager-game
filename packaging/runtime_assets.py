"""Restore a self-contained HTML for file/native clients from the shared web build."""
import base64
import hashlib
import re

MIME = {"webp": "image/webp", "png": "image/png", "jpg": "image/jpeg",
        "mp3": "audio/mpeg", "woff2": "font/woff2", "woff": "font/woff",
        "ttf": "font/ttf", "svg": "image/svg+xml"}


def inline_runtime(html, dist):
    def restore(match):
        relative, digest, ext = match.group(0), match.group(1), match.group(2)
        data = (dist / relative).read_bytes()
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError("Runtime asset SHA-256 mismatch")
        return "data:" + MIME[ext] + ";base64," + base64.b64encode(data).decode("ascii")
    return re.sub(r"assets/runtime/([a-f0-9]{64})\.(webp|png|jpg|mp3|woff2|woff|ttf|svg)", restore, html)
