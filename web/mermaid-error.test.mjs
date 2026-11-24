import test from 'node:test';
import assert from 'node:assert/strict';

import { mermaidErrorText, mermaidErrorFileLine, formatMermaidError } from './mermaid-error.mjs';

const PARSE_ERR = new Error(
  "Parse error on line 4:\n... partner & apiToken (theory)\n-----------------------^\nExpecting 'SEMI', got 'PS'",
);
const SRC = 'flowchart\n    role --> permission\n\n    role --> user & apiToken (theory)';

test('mermaidErrorText: Error uses its message', () => {
  assert.equal(mermaidErrorText(PARSE_ERR), PARSE_ERR.message);
});

test('mermaidErrorText: plain string and str-objects are accepted', () => {
  assert.equal(mermaidErrorText('boom'), 'boom');
  assert.equal(mermaidErrorText({ str: 'bad token' }), 'bad token');
});

test('mermaidErrorText: empty / missing errors get a placeholder', () => {
  assert.equal(mermaidErrorText(undefined), 'Unknown error');
  assert.equal(mermaidErrorText(new Error('  ')), 'Unknown error');
});

test('mermaidErrorFileLine: diagram line N maps to fenceLine + N', () => {
  // fence on 849 -> diagram line 4 is file line 853.
  assert.equal(mermaidErrorFileLine(PARSE_ERR.message, 849, SRC), 853);
});

test('mermaidErrorFileLine: no line in the message yields null', () => {
  assert.equal(mermaidErrorFileLine('No diagram type detected', 10, SRC), null);
});

test('mermaidErrorFileLine: unknown fence line yields null', () => {
  assert.equal(mermaidErrorFileLine(PARSE_ERR.message, NaN, SRC), null);
});

test('mermaidErrorFileLine: frontmatter, comments or leading blanks yield null', () => {
  const msg = PARSE_ERR.message;
  assert.equal(mermaidErrorFileLine(msg, 1, '---\ntitle: x\n---\n' + SRC), null);
  assert.equal(mermaidErrorFileLine(msg, 1, '%% note\n' + SRC), null);
  assert.equal(mermaidErrorFileLine(msg, 1, SRC.replace('\n\n', '\n  %% c\n')), null);
  assert.equal(mermaidErrorFileLine(msg, 1, '\n' + SRC), null);
});

test('mermaidErrorFileLine: %%{init} directive also disables mapping', () => {
  assert.equal(mermaidErrorFileLine(PARSE_ERR.message, 1, '%%{init: {}}%%\n' + SRC), null);
});

test('formatMermaidError: title carries the file line when known', () => {
  assert.deepEqual(formatMermaidError(PARSE_ERR, 849, SRC), {
    title: 'Mermaid error at line 853',
    detail: PARSE_ERR.message,
  });
  assert.equal(formatMermaidError(PARSE_ERR, 849, '%% c\n' + SRC).title, 'Mermaid error');
});
