// The preflight's config search patterns: what a path in the table matches,
// and the glob syntax it may not hold.

import { expect, test } from 'bun:test';
import { searchPattern } from './startup';

// A config search path holds `*` and literal characters alone. `*` matches a
// run within one segment, the empty run included, and nothing crosses a `/`.
// A path holding `\` matches nothing, whatever the platform reads it as.
test.each([
  ['lefthook.*', 'lefthook.yml', true],
  ['lefthook.*', 'lefthook.', true],
  ['lefthook.*', 'lefthook', false],
  ['lefthook.*', 'docs/lefthook.yml', false],
  ['lefthook.*', 'lefthook.d/x.yml', false],
  ['lefthook.*', 'lefthook.[x]', true],
  ['.lefthook', '.lefthook', true],
  ['.lefthook', 'x.lefthook', false],
  ['lefthook-local.*', 'lefthook-local.yaml', true],
  ['lefthook-local.*', 'lefthook-locals.yaml', false],
  ['lefthook.*', 'lefthook.\\', false],
  ['lefthook.*', 'lefthook.a\\b', false],
  ['.config/lefthook.yml', '.config\\lefthook.yml', false],
  ['.config/lefthook.yml', '.config/lefthook.yml', true],
] as const)('searchPattern(%p) matches %p: %p', (glob: string, path: string, matches: boolean) => {
  expect(searchPattern(glob).match(path)).toBe(matches);
});

// Bun.Glob gives each of these a meaning a table path does not state, so a
// path holding one is refused rather than read as a pattern.
test.each([
  'lefthook.?ml',
  'lefthook.[yt]ml',
  'lefthook.{yml,yaml}',
  '!lefthook.yml',
  String.raw`lefthook\.yml`,
  '**/lefthook.yml',
])('searchPattern refuses %p, which holds glob syntax beyond a single *', (glob: string) => {
  expect(() => searchPattern(glob)).toThrow('holds glob syntax beyond a single *');
});
