async function roomFetch(path, options, entrances, send = fetch) {
  const key = options.method === 'POST' ? crypto.randomUUID() : null;
  const headers = new Headers(options.headers);
  if (key) headers.set('Idempotency-Key', key);
  const sources = ['', ...new Set(entrances.filter(origin => origin !== globalThis.location?.origin))];
  let lastError;
  for (const origin of sources) {
    if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    const timer = new AbortController();
    const abort = () => timer.abort(options.signal.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => timer.abort(), Math.min(3500, 10000 / sources.length));
    try {
      const response = await send(origin + path, { ...options, headers, signal: timer.signal, redirect: 'error', cache: 'no-store' });
      if ([502, 503, 504].includes(response.status) || !response.headers.get('content-type')?.includes('application/json')) {
        await response.body?.cancel();
        throw Error('Entry unavailable');
      }
      // Fetch resolves before the body arrives. Bound and retry the complete response.
      const body = await response.text();
      return new Response(body, { status: response.status, headers: response.headers });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }
  throw lastError;
}
module.exports = { roomFetch };
