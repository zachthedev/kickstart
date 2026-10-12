// The preflight's config search patterns: what a path in the table matches,
// and the glob syntax it may not hold.

import { expect, test } from 'bun:test';
import { fold } from './run';
import { CONFIG_SEARCH_PATHS, searchPattern } from './startup';

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

// The preflight builds each table path into a pattern only when it runs, so a
// path holding refused syntax stops the gate there. Each one builds here, in
// a case that names it. It matches its own spelling with every `*` as a
// letter, folded as the preflight folds a name.
test.each(CONFIG_SEARCH_PATHS.map((glob) => [glob, fold(glob.replaceAll('*', 'x'))] as const))(
  'the table path %p builds, and matches %p',
  (glob: string, spelling: string) => {
    expect(() => searchPattern(glob)).not.toThrow();
    expect(searchPattern(glob).match(spelling)).toBe(true);
  },
);
