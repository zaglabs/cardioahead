// Keep generation and verification inside the database lease and Vercel function window.
export function jobBudget(
  started = Date.now(),
  now: () => number = Date.now,
  limit = 280000,
) {
  return (preferred: number) => {
    const left = limit - (now() - started) - 5000;
    if (left < 10000) throw new Error("JOB_EXPIRED");
    return Math.min(preferred, left);
  };
}
export function boundedLiterature<T extends { text: string }>(
  sources: T[],
  maxSources = 12,
  maxCharacters = 4000,
) {
  return sources
    .slice(0, maxSources)
    .map((source) => ({
      ...source,
      text: source.text.slice(0, maxCharacters),
    }));
}
