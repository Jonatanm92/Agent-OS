function assertString(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
}

function words(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

export function textStats(text) {
  assertString(text);
  return {
    words: words(text).length,
    characters: text.length,
    lines: text === '' ? 0 : text.split(/\r?\n/).length,
  };
}

export function topWords(text, n = 5) {
  assertString(text);
  const counts = new Map();
  for (const w of words(text)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, n);
}
