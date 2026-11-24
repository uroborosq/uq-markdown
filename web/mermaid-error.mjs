// Turning a failed mermaid.render into a message for the preview.
//
// Pure helpers (no DOM) so they can be unit-tested with `node --test`.

// The text of whatever mermaid threw: parse errors are Error objects with a
// multi-line message, but some diagram parsers reject with plain strings or
// objects carrying `str`/`message`.
export function mermaidErrorText(err) {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;
  const text = err.message || err.str || String(err);
  return text.trim() || 'Unknown error';
}

// Map mermaid's "Parse error on line N" to a line in the markdown file.
//
// `fenceLine` is the 1-based line of the opening ``` fence, so diagram line 1
// is file line fenceLine + 1. Mermaid strips frontmatter, `%%` comment lines
// and leading blank lines before parsing, which shifts its numbering; in those
// cases we can't map reliably and return null rather than point at the wrong
// line.
export function mermaidErrorFileLine(text, fenceLine, src) {
  const m = /\bon line (\d+)\b/.exec(text);
  if (!m || !Number.isInteger(fenceLine) || fenceLine < 1) return null;
  if (/^\s*\n/.test(src) || /^\s*---/.test(src) || /^\s*%%/m.test(src)) return null;
  return fenceLine + Number(m[1]);
}

// { title, detail } for the error box shown under a diagram.
export function formatMermaidError(err, fenceLine, src) {
  const detail = mermaidErrorText(err);
  const fileLine = mermaidErrorFileLine(detail, fenceLine, src);
  const title = fileLine === null ? 'Mermaid error' : `Mermaid error at line ${fileLine}`;
  return { title, detail };
}
