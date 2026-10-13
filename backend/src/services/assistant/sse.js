async function* sseLines(body) {
  if (!body || typeof body.getReader !== 'function') return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data) yield data;
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

module.exports = { sseLines };
