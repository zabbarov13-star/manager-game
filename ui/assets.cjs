'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const formats = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'font/woff2': 'woff2', 'application/font-woff': 'woff', 'font/woff': 'woff', 'font/ttf': 'ttf', 'image/svg+xml': 'svg' };
const types = Object.fromEntries(Object.entries(formats).map(([mime, ext]) => [ext, mime]));
// Only generated immutable resources are exposed; filenames never contain user input.
function split(html, out, io=fs) {
  const folder = path.join(out, 'assets/runtime');
  io.mkdirSync(folder, { recursive: true });
  return html.replace(/data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)/g, (original, mime, encoded) => {
    const ext = formats[mime];
    if (!ext || encoded.length < 2000) return original;
    const bytes = Buffer.from(encoded, 'base64'), digest = createHash('sha256').update(bytes).digest('hex');
    const name = digest + '.' + ext;
    io.writeFileSync(path.join(folder, name), bytes);
    return 'assets/runtime/' + name;
  });
}
function asset(url) {
  const match = /^\/assets\/runtime\/([a-f0-9]{64})\.(webp|png|jpg|mp3|woff2|woff|ttf|svg)$/.exec(url);
  return match ? [url.slice(1), types[match[2]]] : null;
}
module.exports = { split, asset };
