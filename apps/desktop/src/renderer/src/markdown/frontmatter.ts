/**
 * Markdown frontmatter split.
 *
 * The product owner decided (14 November 2026) that a `---…---` YAML prefix is
 * preserved **verbatim and read-only**: the parser keeps the exact prefix, the
 * editor shows it as a labelled non-editable block, and a save re-emits those
 * bytes before the normalized body. A file without frontmatter is unchanged.
 *
 * The split works on the original bytes (including CRLF and a UTF-8 BOM) so the
 * prefix can be re-emitted byte-identically; only the body is normalized.
 */

export interface FrontmatterSplit {
  /** Exact `---…---` prefix, including a BOM and its trailing newline. */
  raw: string;
  /** Everything after the prefix, untouched (callers normalize the body). */
  body: string;
}

const FRONTMATTER =
  /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/**
 * Split a leading YAML frontmatter block from a Markdown source.
 *
 * Only the very start of the file counts. An unterminated `---` or a
 * horizontal rule later in the document is not frontmatter.
 */
export function splitFrontmatter(source: string): FrontmatterSplit | null {
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
  const rest = source.slice(bom.length);
  const match = FRONTMATTER.exec(rest);
  if (match === null) return null;
  return {
    raw: `${bom}${match[0]}`,
    body: rest.slice(match[0].length),
  };
}

/** The exact prefix to write before a body, or an empty string. */
export function frontmatterPrefix(source: string): string {
  return splitFrontmatter(source)?.raw ?? '';
}
