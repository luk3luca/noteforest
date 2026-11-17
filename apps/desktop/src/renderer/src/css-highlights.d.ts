/**
 * CSS Custom Highlight API typings.
 *
 * TypeScript 5.9 declares `Highlight` and `CSS.highlights`, but its
 * `HighlightRegistry` interface only carries `forEach`: the maplike members the
 * API actually has are missing. The Page find highlight (`page/find-highlight.ts`)
 * registers and clears two names, so the registry is completed here instead of
 * casting at every call site.
 */

interface HighlightRegistry {
  readonly size: number;
  clear(): void;
  delete(name: string): boolean;
  get(name: string): Highlight | undefined;
  has(name: string): boolean;
  set(name: string, highlight: Highlight): this;
}
