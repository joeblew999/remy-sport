/** Consume a stream with a byte limit rather than allocating an unbounded body. */
export async function textWithin(body, maxBytes) {
  const reader = body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let bytes = 0, result = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return result + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error('Body exceeds limit'); }
      result += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}
