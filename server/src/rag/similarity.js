export function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

export function dot(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

export const cosine = (a, b) => dot(normalize(a), normalize(b));

export const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Maps a raw cosine score to 0..1 "relevance" using two tunable anchors.
export function relevanceFromCosine(score, low, high) {
  if (high <= low) return score >= high ? 1 : 0;
  return clamp01((score - low) / (high - low));
}
