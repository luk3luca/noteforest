/** Lightweight performance samples for the M2 gate report. */

interface PerfSamples {
  measure: number[];
  columns: number[];
  edge: number[];
  reflow: number[];
  mount: number[];
}

const samples: PerfSamples = { measure: [], columns: [], edge: [], reflow: [], mount: [] };

if (typeof window !== 'undefined') {
  (window as unknown as { __nfPerf: PerfSamples }).__nfPerf = samples;
}

export function recordPerf(kind: keyof PerfSamples, durationMs: number): void {
  const list = samples[kind];
  list.push(Math.round(durationMs * 100) / 100);
  if (list.length > 300) list.shift();
}

export function perfSnapshot(): PerfSamples {
  return {
    measure: [...samples.measure],
    columns: [...samples.columns],
    edge: [...samples.edge],
    reflow: [...samples.reflow],
    mount: [...samples.mount],
  };
}

export function summarize(values: readonly number[], percentile = 0.95): {
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
} {
  if (values.length === 0) return { count: 0, min: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const at = (ratio: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    median: at(0.5),
    p95: at(percentile),
    max: sorted[sorted.length - 1] ?? 0,
  };
}
