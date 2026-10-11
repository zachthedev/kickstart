// This repository's own cases for scripts/check.ts. They cover how the gate
// reads its arguments, what the markers row says of an untracked inventory,
// how it prints into a pipe, and that it prints through print alone.
// Imported, check.ts runs nothing, and selectRows starts no program. The
// markers case runs its row against a stand-in git, the one program on its
// PATH. The printing case starts the test's own Bun twice behind the system
// shell's pipe, and the printing-path cases read source through ESLint. So no
// case reaches gh, git, mise or the network.

import { expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path';
import { ESLint, type Rule, type Scope } from 'eslint';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { selectRows } from './check';
import { isolate, StandIns } from './stand-ins';

/** Every row, in the table's order, written out here rather than read from check.ts. */
const ALL_ROWS: readonly string[] = [
  'tools',
  'typecheck',
  'format',
  'toml',
  'workflows',
  'markers',
  'lint',
  'scripts:test',
  'test',
];

/** A selection by its rows' names, or the whole refusal. */
type Selected =
  { readonly rows: readonly string[]; readonly quick: boolean; readonly list: boolean } | { readonly refusal: string };

interface SelectCase {
  readonly label: string;
  /** The arguments after the script's path. */
  readonly args: readonly string[];
  readonly expected: Selected;
}

// Named rows run in the table's order, slow or not, and one unknown name or
// flag refuses the whole run, so a mistyped name never selects nothing and
// reads as a green gate, and a mistyped flag never runs the whole gate in its
// place.
const SELECT_CASES: readonly SelectCase[] = [
  {
    label: 'no argument selects every row, in the table order',
    args: [],
    expected: { rows: ALL_ROWS, quick: false, list: false },
  },
  {
    label: '--quick leaves the test row out',
    args: ['--quick'],
    expected: { rows: ALL_ROWS.filter((name) => name !== 'test'), quick: true, list: false },
  },
  {
    label: 'one name selects that row alone',
    args: ['workflows'],
    expected: { rows: ['workflows'], quick: false, list: false },
  },
  {
    label: 'two names run in the table order, not the argument order',
    args: ['lint', 'format'],
    expected: { rows: ['format', 'lint'], quick: false, list: false },
  },
  {
    label: 'a named slow row runs under --quick',
    args: ['--quick', 'test'],
    expected: { rows: ['test'], quick: true, list: false },
  },
  {
    label: '--rows asks for the list',
    args: ['--rows'],
    expected: { rows: ALL_ROWS, quick: false, list: true },
  },
  {
    label: 'a misspelled --quick is refused',
    args: ['--quik'],
    expected: { refusal: 'no such flag: "--quik". The gate takes --quick and --rows.' },
  },
  {
    label: 'a misspelled --rows is refused',
    args: ['--row'],
    expected: { refusal: 'no such flag: "--row". The gate takes --quick and --rows.' },
  },
  {
    label: 'a row name written as a flag is refused',
    args: ['--lint'],
    expected: { refusal: 'no such flag: "--lint". The gate takes --quick and --rows.' },
  },
  {
    label: 'a flag carrying a value is refused',
    args: ['--quick=true'],
    expected: { refusal: 'no such flag: "--quick=true". The gate takes --quick and --rows.' },
  },
  {
    label: 'a bare -- is refused',
    args: ['--', 'lint'],
    expected: { refusal: 'no such flag: "--". The gate takes --quick and --rows.' },
  },
  {
    label: 'two unknown flags are refused together, beside a known one',
    args: ['--quick', '--quik', '--verbose'],
    expected: { refusal: 'no such flag: "--quik", "--verbose". The gate takes --quick and --rows.' },
  },
  {
    label: 'an unknown flag and an unknown name are refused together',
    args: ['--quik', 'nosuchrow'],
    expected: {
      refusal:
        'no such flag: "--quik". The gate takes --quick and --rows. no such row: "nosuchrow". bun run check:rows lists them.',
    },
  },
  {
    label: 'an unknown name is refused',
    args: ['nosuchrow'],
    expected: { refusal: 'no such row: "nosuchrow". bun run check:rows lists them.' },
  },
  {
    label: 'one unknown name among known ones refuses the run, naming it alone',
    args: ['workflows', 'zizmor'],
    expected: { refusal: 'no such row: "zizmor". bun run check:rows lists them.' },
  },
  {
    label: 'a flag with one dash reads as a name and is refused',
    args: ['-q'],
    expected: { refusal: 'no such row: "-q". bun run check:rows lists them.' },
  },
  {
    label: 'a package.json script that is not a row is refused',
    args: ['check:quick'],
    expected: { refusal: 'no such row: "check:quick". bun run check:rows lists them.' },
  },
  {
    label: 'a name holding a newline is refused on one line, the newline escaped',
    args: ['a\nb'],
    expected: { refusal: 'no such row: "a\\nb". bun run check:rows lists them.' },
  },
  {
    label: 'a flag holding a C1 control sequence is refused with it escaped',
    args: [`--${String.fromCharCode(0x9b)}31m`],
    expected: { refusal: 'no such flag: "--\\u009b31m". The gate takes --quick and --rows.' },
  },
];

test.each([...SELECT_CASES])('selectRows: $label', ({ args, expected }: SelectCase) => {
  const selection = selectRows(args);
  const selected: Selected =
    'refusal' in selection
      ? { refusal: selection.refusal }
      : { rows: selection.rows.map((row) => row.name), quick: selection.quick, list: selection.list };

  expect(selected).toEqual(expected);
});

/* ///// markers ///// */

// The row refuses an inventory git does not track before it regenerates
// anything, and its remedy names the file from the work tree's top with `:/`,
// so the command stages it from any folder of the checkout. Any git call the
// case does not answer fails, so the row cannot read past the refusal.
test('the markers row refuses an untracked MARKERS.md, naming a git add that stages it from any folder of the checkout', async () => {
  const standIns = new StandIns(['git']);
  const restore = isolate(standIns);
  const top = mkdtempSync(join(tmpdir(), 'gate-markers-row-'));
  try {
    standIns.answer('git', { exitCode: 3 });
    standIns.answer('git', { stdout: `${top}\n` }, `-C ${process.cwd()} rev-parse --show-toplevel`);
    standIns.answer('git', { exitCode: 1 }, `-C ${top} ls-files --error-unmatch -- MARKERS.md`);
    const selection = selectRows(['markers']);
    const check = 'refusal' in selection ? undefined : selection.rows[0]?.check;

    const outcome = await Promise.resolve(check?.(false)).then(
      (note: string | undefined) => `passed: ${String(note)}`,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );

    expect(outcome).toBe(
      'MARKERS.md is not tracked. Regenerate it with bun run markers, then: git add -- :/MARKERS.md',
    );
    expect(existsSync(join(top, 'MARKERS.md'))).toBe(false);
  } finally {
    restore();
    standIns.remove();
    rmSync(top, { recursive: true, force: true });
  }
}, 30_000);

/* ///// Printing ///// */

/** The line the writer prints after the report, as a row's line follows its report. */
const ROW_LINE = 'the row line after the report';

/** How long the reader waits before its first read, so the pipe fills behind it. */
const READER_WAIT_MS = 1_000;

// Prints the report file it is handed, then the row line, through the gate's
// own printing. It reads process.stdout first, as print's own default stream
// does at the gate's first line and Prettier's import does on Linux and macOS,
// and under the pinned Bun that read turns a piped stdout nonblocking there.
const WRITER = `import { readFileSync } from 'node:fs';
import { print } from ${JSON.stringify(join(import.meta.dir, 'check.ts'))};
const [report = ''] = process.argv.slice(2);
void process.stdout.isTTY;
await print(readFileSync(report, 'utf8'));
await print(${JSON.stringify(ROW_LINE)});
`;

// Waits, then copies everything on its stdin into the file it is handed.
const READER = `const [out = '', wait = '0'] = process.argv.slice(2);
await Bun.sleep(Number(wait));
await Bun.write(out, await Bun.stdin.bytes());
`;

test('a report over 64 KiB and the row line after it reach a pipe whose reader waits, whole, though process.stdout was read first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-print-'));
  try {
    const report = Array.from(
      { length: 2_000 },
      (_: unknown, index: number) => `(pass) case ${String(index)} ${'.'.repeat(60)}`,
    ).join('\n');
    const reportPath = join(dir, 'report.txt');
    const writer = join(dir, 'writer.ts');
    const reader = join(dir, 'reader.ts');
    const out = join(dir, 'out.txt');
    writeFileSync(reportPath, report);
    writeFileSync(writer, WRITER);
    writeFileSync(reader, READER);
    // The system shell joins the two with a pipe of its own, so no reader in
    // this process drains it early. /bin/sh takes every path as an argument,
    // so none reaches it as syntax. cmd.exe takes them quoted in the script's
    // own text, where a space or a parenthesis is literal: cmd.exe splits a
    // .cmd file's own path at a space once an argument follows it.
    const windows = process.platform === 'win32';
    const launcher = join(dir, windows ? 'pipe.cmd' : 'pipe');
    const values = [process.execPath, writer, reportPath, reader, out, String(READER_WAIT_MS)];
    const quoted = values.map((value) => `"${value}"`);
    writeFileSync(
      launcher,
      windows
        ? `@${quoted[0] ?? ''} --no-env-file --no-install ${quoted[1] ?? ''} ${quoted[2] ?? ''} | ${quoted[0] ?? ''} --no-env-file --no-install ${quoted[3] ?? ''} ${quoted[4] ?? ''} ${quoted[5] ?? ''}\r\n`
        : '#!/bin/sh\n"$1" --no-env-file --no-install "$2" "$3" | "$1" --no-env-file --no-install "$4" "$5" "$6"\n',
    );
    chmodSync(launcher, 0o755);

    const finished = Bun.spawnSync({
      cmd: windows ? [launcher] : [launcher, ...values],
      cwd: dir,
      env: { ...process.env },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
      windowsHide: true,
    });

    expect({ exitCode: finished.exitCode, stderr: finished.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
    const expected = `${report}\n${ROW_LINE}\n`;
    const received = readFileSync(out, 'utf8');
    expect(received.length).toBe(expected.length);
    expect(received).toBe(expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

/* ///// The printing path ///// */

// print is the one way the gate's process writes to its streams. Once
// process.stdout exists, a console call or a write through Bun.stdout can drop
// what a full pipe does not take, so the check below reads check.ts and every
// repository module it reaches, as ESLint parses each. It follows import,
// export, require, import.meta.require, `import x = require`, a dynamic import,
// module.require, require.main.require, getBuiltinModule, and a createRequire
// result called directly or through a const. It takes getBuiltinModule imported
// from process, and createRequire imported from module, under any local name.
// It reads each one's specifier from a literal, a template with no substitution
// or a const holding one. It reads a name as the binding ESLint's scope
// analysis resolves it to where it stands, so a parameter, a loop variable or
// an inner declaration of the same name shadows an outer const, as at run time,
// and a type of the same name does not. It reads no literal from an ambient
// const, one declared with declare or inside a declare module, namespace or
// global block. Bun erases it, so at run time the name reads a global of that
// name. It resolves the specifier with Bun.resolveSync, which honors
// package.json imports, tsconfig.json paths, index files and the .js-to-.ts
// mapping. A file the specifier resolves to in the repository and outside
// node_modules counts by its extension, as Bun loads it under no import
// attribute, since the lint row refuses every attribute but `type: 'json'`. The
// check lints a module ending in .ts, .mts, .cts, .tsx, .js, .mjs, .cjs or
// .jsx, passes a .json, .toml or .txt file in any letter case as data, and
// refuses any other file, naming it. It refuses a specifier it cannot read, and
// one Bun resolves to no built-in module, no package under node_modules and no
// file in the repository. It refuses every JSX element and fragment, since JSX
// calls the factory, or loads the runtime module, that a pragma comment or a
// tsconfig.json names, and the check reads neither. It refuses a console
// reference outside a type query, an import of console, a stdout or stderr of
// process or Bun, an import of them or of a tty WriteStream, a destructuring
// that keeps the rest of process, Bun or the global object, an object spread of
// any of them, and process.emitWarning, process.emit and process._rawDebug. It
// names an imported module as Bun resolves it, so an alias of node:console is
// console, and it reads `{ default as x }` as a default import. It refuses
// descriptor 1 or 2, as a number or a const holding one, as the first argument
// of a call named write, writeSync, writev, writevSync, writeFile,
// writeFileSync, appendFile, appendFileSync or file. It refuses either as the
// fd option of any call or constructor, set in an object literal, a const
// holding one, or an object spread into one, and it reads an array literal, or
// a const holding one, spread into a call's arguments as those arguments.
// Under the pinned Bun, that covers each node:fs and node:fs/promises write
// that takes a descriptor number, and Bun.write, Bun.file, Bun.connect and
// node:net's Socket. It reads the global object as global, globalThis or self,
// bare or as a member of the global object, and owners through as, satisfies,
// angle-bracket assertions, non-null and optional chaining, and through
// destructuring in declarations, assignments, parameter defaults and nested
// patterns. A nested pattern with a default of its own counts under its key and
// under its default, which stands in for an undefined member. It allows a
// stream inside the top-level print in check.ts, a stream handed to print, and
// the consequent of `if (import.meta.main)` in another module, which runs only
// when that module is the process's entry. It follows no value beyond a const
// holding a literal and names no writer beyond these. So review holds a stream
// or a load reached through Reflect, an alias or any other name, a warning
// util.deprecate or util.debuglog raises, and the globals alert, confirm,
// prompt and reportError, which a check by name would refuse in a local of the
// same name. Review also holds code built from a string, as eval runs it, a
// member set after its literal, as in `OPTIONS.fd = 1`, and a descriptor an
// ambient const names. The lint row's no-implied-eval refuses new Function. A
// with statement, which reads a member of process by its bare name, fails the
// typecheck row in TypeScript and the lint row's no-with in JavaScript.

/** The folder holding check.ts and every module it imports. */
const SCRIPTS = import.meta.dir;

/** The runner, the one module whose entry block runs in the gate's process. */
const RUNNER = 'check.ts';

/** Modules whose values print, or hand out the process's streams or a terminal stream. */
const CONSOLE_MODULES: readonly string[] = ['console', 'node:console'];
const STREAM_MODULES: readonly string[] = ['process', 'node:process', 'bun'];
const TTY_MODULES: readonly string[] = ['tty', 'node:tty'];

/** The members of process that write a warning or a debug line to stderr themselves. */
const PROCESS_WRITERS: readonly string[] = ['emitWarning', 'emit', '_rawDebug'];

/** The names Bun gives the global object, each a member of the global object too. */
const GLOBAL_NAMES: readonly string[] = ['globalThis', 'global', 'self'];

/** Each loader an import can bind under another name, with the modules that export it. */
const LOADER_MODULES: ReadonlyMap<string, readonly string[]> = new Map([
  ['getBuiltinModule', ['process', 'node:process']],
  ['createRequire', ['module', 'node:module']],
]);

/**
 * The extensions Bun runs as code, which the check lints. ESLint matches a
 * files pattern by case, so a module counts as code here by its extension in
 * lower case alone, and one in another case is refused.
 */
const CODE_EXTENSIONS: readonly string[] = ['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx'];

/** The extensions Bun loads, in any letter case, as JSON, TOML or text: data it parses and never runs. */
const DATA_EXTENSIONS: readonly string[] = ['.json', '.toml', '.txt'];

/**
 * Calls that write to the descriptor their first argument names, or hand out
 * a file on it: the writes of node:fs and node:fs/promises, Bun.write and
 * Bun.file.
 */
const DESCRIPTOR_CALLS: readonly string[] = [
  'write',
  'writeSync',
  'writev',
  'writevSync',
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'file',
];

/** The TypeScript and chain wrappers the check reads through to the expression inside. */
const WRAPPERS: readonly string[] = [
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'ChainExpression',
];

/** A node as the check reads it, beyond what ESTree's types name. */
interface Loose {
  readonly type: string;
  readonly parent?: Loose | null;
  readonly name?: unknown;
  readonly value?: unknown;
  readonly computed?: boolean;
  readonly shorthand?: boolean;
  readonly importKind?: string;
  readonly exportKind?: string;
  readonly object?: Loose;
  readonly property?: Loose;
  readonly expression?: Loose;
  readonly callee?: Loose;
  readonly arguments?: readonly Loose[];
  readonly argument?: Loose;
  readonly elements?: readonly (Loose | null)[];
  readonly source?: Loose | null;
  readonly specifiers?: readonly Loose[];
  readonly imported?: Loose;
  readonly local?: Loose;
  readonly key?: Loose;
  readonly properties?: readonly Loose[];
  readonly left?: Loose;
  readonly right?: Loose;
  readonly id?: Loose | null;
  readonly init?: Loose | null;
  readonly test?: Loose;
  readonly consequent?: Loose;
  readonly moduleReference?: Loose;
  readonly quasis?: readonly { readonly value: { readonly cooked?: string | null } }[];
  readonly expressions?: readonly unknown[];
  readonly kind?: string;
  readonly declare?: boolean;
}

/** `node` as the check reads it. */
function loose(node: unknown): Loose {
  return node as Loose;
}

/** `node` with every wrapper in {@link WRAPPERS} taken off. */
function unwrap(node: Loose | null | undefined): Loose | undefined {
  let current = node ?? undefined;
  while (current !== undefined && WRAPPERS.includes(current.type)) {
    current = current.expression;
  }
  return current;
}

/** The text a name, a literal or a template with no substitution spells, or undefined when a value decides it. */
function spelled(node: Loose | null | undefined, computed = false): string | undefined {
  if (node === null || node === undefined) {
    return undefined;
  }
  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : undefined;
  }
  if (node.type === 'TemplateLiteral' && (node.expressions ?? []).length === 0) {
    return node.quasis?.[0]?.value.cooked ?? undefined;
  }
  return node.type === 'Identifier' && !computed && typeof node.name === 'string' ? node.name : undefined;
}

/**
 * Whether `node` names the global object: globalThis, global or self, bare or
 * as a member of the global object, as `globalThis.self` is.
 */
function isGlobalObject(node: Loose | undefined): boolean {
  if (node?.type === 'MemberExpression') {
    const name = spelled(node.property, node.computed);
    return name !== undefined && GLOBAL_NAMES.includes(name) && isGlobalObject(unwrap(node.object));
  }
  return node?.type === 'Identifier' && typeof node.name === 'string' && GLOBAL_NAMES.includes(node.name);
}

/** The owner `node` names, process or Bun, bare or through the global object, or undefined. */
function ownerOf(node: Loose | null | undefined): string | undefined {
  const inner = unwrap(node);
  if (inner?.type === 'Identifier' && (inner.name === 'process' || inner.name === 'Bun')) {
    return inner.name;
  }
  if (inner?.type === 'MemberExpression' && isGlobalObject(unwrap(inner.object))) {
    const name = spelled(inner.property, inner.computed);
    return name === 'process' || name === 'Bun' ? name : undefined;
  }
  return undefined;
}

/** Whether `node` is `import.meta.<key>`, as `import.meta.main` or `import.meta.require`. */
function isImportMeta(node: Loose | undefined, key: string): boolean {
  return (
    node?.type === 'MemberExpression' &&
    node.object?.type === 'MetaProperty' &&
    spelled(node.property, node.computed) === key
  );
}

/** Whether `node` is the number 1 or 2, stdout's or stderr's descriptor. */
function isStreamDescriptor(node: Loose | undefined): boolean {
  return node?.type === 'Literal' && (node.value === 1 || node.value === 2);
}

/** Whether `node` is `require.main`, whose require loads a module as require does. */
function isRequireMain(node: Loose | undefined): boolean {
  const owner = unwrap(node?.object);
  return (
    node?.type === 'MemberExpression' &&
    owner?.type === 'Identifier' &&
    owner.name === 'require' &&
    spelled(node.property, node.computed) === 'main'
  );
}

/** Whether `node` names a value inside a type query, as `typeof console` does, which runs nothing. */
function inTypeQuery(node: Loose): boolean {
  let current = node.parent;
  while (current?.type === 'TSQualifiedName') {
    current = current.parent;
  }
  return current?.type === 'TSTypeQuery';
}

/**
 * Whether `declarator` is ambient: its declaration carries `declare`, or it
 * sits inside a `declare` module, namespace or global block. Bun erases each,
 * so at run time the name reads a global of that name, never the literal.
 */
function ambient(declarator: Loose): boolean {
  for (let current = declarator.parent; current !== undefined && current !== null; current = current.parent) {
    if (
      (current.type === 'VariableDeclaration' || current.type === 'TSModuleDeclaration') &&
      current.declare === true
    ) {
      return true;
    }
  }
  return false;
}

/** How the check takes the file at `path`: as code it lints, as data Bun parses and it passes, or as neither. */
function loaderOf(path: string): 'code' | 'data' | undefined {
  const extension = extname(path);
  if (CODE_EXTENSIONS.includes(extension)) {
    return 'code';
  }
  return DATA_EXTENSIONS.includes(extension.toLowerCase()) ? 'data' : undefined;
}

/** What the check saw in the files it read since the last reset: modules to follow and each allowed stream. */
let printingScan: { follow: string[]; allowed: string[] } = { follow: [], allowed: [] };

/** Where a specifier lands as Bun resolves it, as far as the check reads it. */
type Placement =
  | { readonly kind: 'builtin'; readonly name: string }
  | { readonly kind: 'repository'; readonly path: string }
  | { readonly kind: 'package' }
  | { readonly kind: 'unplaced' };

/**
 * Where Bun puts `specifier` imported from the file `from`: a built-in module
 * by its name, a file inside `repository` by its real path, a file under a
 * node_modules folder, or nothing the check can read. `repository` is a real
 * path too, so a link out of the repository lands outside it on every system.
 */
function placement(repository: string, from: string, specifier: string): Placement {
  let resolved: string;
  try {
    resolved = Bun.resolveSync(specifier, dirname(from));
  } catch {
    // Bun names no module, so the caller refuses the specifier.
    return { kind: 'unplaced' };
  }
  if (isBuiltin(resolved)) {
    return { kind: 'builtin', name: resolved };
  }
  // A data: URL resolves to itself, and a query string stays on the path.
  if (!isAbsolute(resolved) || !existsSync(resolved)) {
    return { kind: 'unplaced' };
  }
  const path = realpathSync(resolved);
  const inside = relative(repository, path);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    return path.split(sep).includes('node_modules') ? { kind: 'package' } : { kind: 'unplaced' };
  }
  return inside.split(sep).includes('node_modules') ? { kind: 'package' } : { kind: 'repository', path };
}

/** The name the checks compare a module by: a built-in's as Bun resolves it, any other's as `specifier` spells it. */
function moduleName(place: Placement, specifier: string): string {
  return place.kind === 'builtin' ? place.name : specifier;
}

const printingPath: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      reached:
        'This reaches a process stream where print does not. Once process.stdout exists, a console call or a write through Bun.stdout can drop what a full pipe does not take, so print every line through print.',
      unfollowed:
        'The check cannot read which module this names, so it cannot follow it. Name the module with a literal, a template with no substitution or a const holding one.',
      unplaced:
        'Bun resolves {{specifier}} to no built-in module, no package under node_modules and no file in this repository, so the check cannot read the code it loads. Import a built-in module, a package or a repository module.',
      unread:
        'The check cannot judge {{file}}. It reads a module ending in .ts, .mts, .cts, .tsx, .js, .mjs, .cjs or .jsx, and passes a .json, .toml or .txt file as data. Load a file with one of those extensions.',
      jsx: 'This JSX calls the factory, or loads the runtime module, that a pragma comment or a tsconfig.json names. The check reads neither, so it cannot judge what the element runs. Write the code without JSX.',
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const file = basename(context.filename);
    const runner = file === RUNNER;
    /** The repository's top, as its real path: ESLint's working directory. */
    const repository = realpathSync(context.cwd);
    /**
     * The variable the name `node` resolves to where it stands, as ESLint's
     * scope analysis resolves it, or undefined for a name no declaration in
     * the file binds. A parameter, a loop variable or an inner declaration of
     * the same name shadows an outer one there, as at run time, and a type of
     * the same name shadows no value.
     */
    const bindingOf = (node: Loose): Scope.Variable | undefined => {
      for (
        let scope: Scope.Scope | null = context.sourceCode.getScope(node as unknown as Rule.Node);
        scope !== null;
        scope = scope.upper
      ) {
        const reference = scope.references.find((item) => loose(item.identifier) === node);
        if (reference !== undefined) {
          return reference.resolved ?? undefined;
        }
      }
      return undefined;
    };
    /**
     * What the const the name `node` resolves to holds, with its wrappers off,
     * or undefined when the name resolves to anything else: a parameter, a
     * loop variable, a let, a destructured name, an import, an ambient const
     * or nothing. A const holds one value wherever it is declared, so an inner
     * one reads as a top-level one does. An ambient const holds nothing at run
     * time, since Bun erases it.
     */
    const held = (node: Loose | undefined): Loose | undefined => {
      const definition =
        node?.type === 'Identifier' ? bindingOf(node)?.defs.find((item) => item.type === 'Variable') : undefined;
      if (definition === undefined) {
        return undefined;
      }
      const declarator = loose(definition.node);
      return declarator.parent?.kind === 'const' && declarator.id === loose(definition.name) && !ambient(declarator)
        ? unwrap(declarator.init)
        : undefined;
    };
    /**
     * The loader an import binds to the name `node` where it stands:
     * getBuiltinModule imported from process, or createRequire imported from
     * module, under any local name. Undefined for any other binding.
     */
    const importedLoader = (node: Loose): string | undefined => {
      const definition = bindingOf(node)?.defs.find((item) => item.type === 'ImportBinding');
      if (definition === undefined) {
        return undefined;
      }
      const item = loose(definition.node);
      const declaration = item.parent;
      const imported =
        item.type === 'ImportSpecifier' && item.importKind !== 'type' ? spelled(item.imported) : undefined;
      const specifier =
        declaration?.type === 'ImportDeclaration' && declaration.importKind !== 'type'
          ? spelled(declaration.source)
          : undefined;
      if (imported === undefined || specifier === undefined) {
        return undefined;
      }
      const module = moduleName(placement(repository, context.filename, specifier), specifier);
      return LOADER_MODULES.get(imported)?.includes(module) === true ? imported : undefined;
    };
    /**
     * Whether `node` calls createRequire, which returns a require of its own:
     * by that name, bare or as a member, or through an import that binds it to
     * another name.
     */
    const createsRequire = (node: Loose | undefined): boolean => {
      const callee = node?.type === 'CallExpression' ? unwrap(node.callee) : undefined;
      if (callee?.type === 'MemberExpression') {
        return spelled(callee.property, callee.computed) === 'createRequire';
      }
      return (
        callee?.type === 'Identifier' && (callee.name === 'createRequire' || importedLoader(callee) === 'createRequire')
      );
    };
    /** Whether `node` is descriptor 1 or 2, as a number or a const holding one. */
    const descriptor = (node: Loose | undefined): boolean => isStreamDescriptor(node) || isStreamDescriptor(held(node));
    /** `node` with its wrappers off, or what the const it names holds. */
    const literal = (node: Loose | null | undefined): Loose | undefined => {
      const inner = unwrap(node);
      return held(inner) ?? inner;
    };
    /**
     * The arguments `call` hands over, with an array literal, or a const
     * holding one, spread into them read as its elements.
     */
    const argumentsOf = (call: Loose): (Loose | undefined)[] =>
      (call.arguments ?? []).flatMap((argument) => {
        const spread = argument.type === 'SpreadElement' ? literal(argument.argument) : undefined;
        return spread?.type === 'ArrayExpression'
          ? (spread.elements ?? []).map((element) => element ?? undefined)
          : [argument];
      });
    /**
     * Whether the object `node` names sets fd to descriptor 1 or 2, read
     * through a const and each object spread into it. `seen` holds each object
     * read, so a const spread into itself ends the read.
     */
    const setsDescriptor = (node: Loose | undefined, seen: Set<Loose>): boolean => {
      const object = literal(node);
      if (object?.type !== 'ObjectExpression' || seen.has(object)) {
        return false;
      }
      seen.add(object);
      return (object.properties ?? []).some((property) =>
        property.type === 'SpreadElement'
          ? setsDescriptor(property.argument, seen)
          : spelled(property.key, property.computed) === 'fd' && descriptor(unwrap(property.value as Loose)),
      );
    };
    /** Whether an object among `call`'s arguments sets fd to descriptor 1 or 2. */
    const handsDescriptor = (call: Loose): boolean =>
      argumentsOf(call).some((argument) => setsDescriptor(argument, new Set()));
    /**
     * Whether `call` loads the module its first argument names: require,
     * import.meta.require, module.require, require.main.require,
     * getBuiltinModule under its own name or an imported one, and a
     * createRequire result called directly or through a const.
     */
    const loads = (call: Loose): boolean => {
      const callee = unwrap(call.callee);
      if (callee?.type === 'Identifier') {
        return (
          callee.name === 'require' ||
          callee.name === 'getBuiltinModule' ||
          importedLoader(callee) === 'getBuiltinModule' ||
          createsRequire(held(callee))
        );
      }
      if (callee?.type === 'MemberExpression') {
        const name = spelled(callee.property, callee.computed);
        const owner = unwrap(callee.object);
        return (
          isImportMeta(callee, 'require') ||
          name === 'getBuiltinModule' ||
          (name === 'require' && ((owner?.type === 'Identifier' && owner.name === 'module') || isRequireMain(owner)))
        );
      }
      return createsRequire(callee);
    };
    /** Why `node` may reach a stream, or undefined when nothing allows it. */
    const allowance = (node: Loose): string | undefined => {
      const ancestors = context.sourceCode.getAncestors(node as unknown as Rule.Node).map(loose);
      for (const [index, ancestor] of ancestors.entries()) {
        const top = ancestor.parent?.type === 'Program' || ancestor.parent?.parent?.type === 'Program';
        if (runner && ancestor.type === 'FunctionDeclaration' && spelled(ancestor.id) === 'print' && top) {
          return 'inside print';
        }
        const within = ancestors[index + 1] ?? node;
        if (
          !runner &&
          ancestor.type === 'IfStatement' &&
          isImportMeta(ancestor.test, 'main') &&
          within === ancestor.consequent
        ) {
          return "in another module's entry block";
        }
      }
      const parent = node.parent;
      if (parent?.type === 'CallExpression' && spelled(parent.callee) === 'print' && parent.arguments?.[1] === node) {
        return "as print's stream";
      }
      return undefined;
    };
    const judge = (node: Loose): void => {
      const allowed = allowance(node);
      if (allowed === undefined) {
        context.report({ node: node as unknown as Rule.Node, messageId: 'reached' });
      } else {
        printingScan.allowed.push(`${file}: ${allowed}`);
      }
    };
    /**
     * Judges an import of `specifier` as a whole, queues the repository module
     * it names, passes a repository file Bun loads as data, refuses any other
     * repository file and a specifier the check cannot place, and returns the
     * module's name as the checks compare it: a built-in's as Bun resolves it.
     */
    const reach = (node: Loose, specifier: string, whole: boolean): string => {
      const place = placement(repository, context.filename, specifier);
      const module = moduleName(place, specifier);
      if (CONSOLE_MODULES.includes(module) || (whole && [...STREAM_MODULES, ...TTY_MODULES].includes(module))) {
        judge(node);
      }
      if (place.kind === 'repository') {
        const loader = loaderOf(place.path);
        if (loader === 'code') {
          printingScan.follow.push(place.path);
        } else if (loader === undefined) {
          context.report({
            node: node as unknown as Rule.Node,
            messageId: 'unread',
            data: { file: JSON.stringify(relative(repository, place.path).split(sep).join('/')) },
          });
        }
      } else if (place.kind === 'unplaced') {
        context.report({
          node: node as unknown as Rule.Node,
          messageId: 'unplaced',
          data: { specifier: JSON.stringify(specifier) },
        });
      }
      return module;
    };
    /** The specifier `node` names, a literal or a const holding one, or a refusal when the check cannot read it. */
    const specifierOf = (holder: Loose, node: Loose | undefined): string | undefined => {
      const inner = unwrap(node);
      const value = inner?.type === 'Identifier' ? held(inner) : inner;
      // spelled reads a bare name as its own text, and a const set to a name
      // holds that name's value instead.
      const text = value?.type === 'Identifier' ? undefined : spelled(value);
      if (text === undefined) {
        context.report({ node: holder as unknown as Rule.Node, messageId: 'unfollowed' });
      }
      return text;
    };
    return {
      ImportDeclaration(node): void {
        const declaration = loose(node);
        const specifier = spelled(declaration.source) ?? '';
        if (declaration.importKind === 'type') {
          return;
        }
        const values = (declaration.specifiers ?? []).filter((item) => item.importKind !== 'type');
        // A default or namespace import takes the whole module, and so does
        // the default import spelled as a named one, `{ default as x }`.
        const module = reach(
          declaration,
          specifier,
          values.some((item) => item.type !== 'ImportSpecifier' || spelled(item.imported) === 'default'),
        );
        for (const item of values.filter((value) => value.type === 'ImportSpecifier')) {
          const name = spelled(item.imported);
          if (
            (STREAM_MODULES.includes(module) && (name === 'stdout' || name === 'stderr')) ||
            (TTY_MODULES.includes(module) && name === 'WriteStream')
          ) {
            judge(item);
          }
        }
      },
      ImportExpression(node): void {
        const expression = loose(node);
        const specifier = specifierOf(expression, expression.source ?? undefined);
        if (specifier !== undefined) {
          reach(expression, specifier, true);
        }
      },
      TSImportEqualsDeclaration(node: unknown): void {
        const declaration = loose(node);
        if (declaration.moduleReference?.type === 'TSExternalModuleReference') {
          const specifier = specifierOf(declaration, declaration.moduleReference.expression);
          if (specifier !== undefined) {
            reach(declaration, specifier, true);
          }
        }
      },
      ExportNamedDeclaration(node): void {
        const declaration = loose(node);
        const specifier = spelled(declaration.source);
        if (specifier !== undefined && declaration.exportKind !== 'type') {
          reach(declaration, specifier, (declaration.specifiers ?? []).length > 0);
        }
      },
      ExportAllDeclaration(node): void {
        const declaration = loose(node);
        const specifier = spelled(declaration.source);
        if (specifier !== undefined && declaration.exportKind !== 'type') {
          reach(declaration, specifier, true);
        }
      },
      CallExpression(node): void {
        const call = loose(node);
        const callee = unwrap(call.callee);
        const [first] = argumentsOf(call);
        const name = callee?.type === 'MemberExpression' ? spelled(callee.property, callee.computed) : spelled(callee);
        if (loads(call)) {
          const specifier = specifierOf(call, first);
          if (specifier !== undefined) {
            reach(call, specifier, true);
          }
        } else if (
          (name !== undefined && DESCRIPTOR_CALLS.includes(name) && descriptor(unwrap(first))) ||
          handsDescriptor(call)
        ) {
          judge(call);
        }
      },
      NewExpression(node): void {
        const construction = loose(node);
        if (handsDescriptor(construction)) {
          judge(construction);
        }
      },
      Identifier(node): void {
        const identifier = loose(node);
        const parent = identifier.parent;
        const key =
          (parent?.type === 'MemberExpression' && parent.property === identifier && parent.computed !== true) ||
          (parent?.type === 'Property' &&
            parent.key === identifier &&
            parent.computed !== true &&
            parent.shorthand !== true);
        if (identifier.name === 'console' && !key && !inTypeQuery(identifier)) {
          judge(identifier);
        }
      },
      MemberExpression(node): void {
        const member = loose(node);
        const name = spelled(member.property, member.computed);
        const owner = ownerOf(member.object);
        if (
          (name === 'console' && isGlobalObject(unwrap(member.object))) ||
          ((name === 'stdout' || name === 'stderr') && owner !== undefined) ||
          (name !== undefined && PROCESS_WRITERS.includes(name) && owner === 'process')
        ) {
          judge(member);
        }
      },
      ObjectPattern(node): void {
        const pattern = loose(node);
        const owners = patternOwners(pattern);
        const properties = pattern.properties ?? [];
        // A rest element keeps every member the pattern does not name.
        const rest = properties.some((property) => property.type === 'RestElement');
        const keys = properties.map((property) => spelled(property.key, property.computed));
        if (
          (owners.some((owner) => owner === 'process' || owner === 'Bun') &&
            (rest || keys.some((key) => key === 'stdout' || key === 'stderr'))) ||
          (owners.includes('global') && (rest || keys.includes('console')))
        ) {
          judge(pattern);
        }
      },
      SpreadElement(node): void {
        const spread = loose(node);
        // An object spread copies the members a rest pattern over the same
        // owner keeps.
        if (
          spread.parent?.type === 'ObjectExpression' &&
          (ownerOf(spread.argument) !== undefined || isGlobalObject(unwrap(spread.argument)))
        ) {
          judge(spread);
        }
      },
      JSXElement(node: unknown): void {
        context.report({ node: node as Rule.Node, messageId: 'jsx' });
      },
      JSXFragment(node: unknown): void {
        context.report({ node: node as Rule.Node, messageId: 'jsx' });
      },
    };
  },
};

/**
 * What a destructuring pattern takes apart: each of process, Bun and the
 * global object it can read, or none. A nested pattern with a default of its
 * own reads its key's member, and its default when that member is undefined,
 * so it counts under both.
 */
function patternOwners(pattern: Loose): string[] {
  const parent = pattern.parent;
  const owners: string[] = [];
  const source =
    parent?.type === 'VariableDeclarator' && parent.id === pattern
      ? parent.init
      : (parent?.type === 'AssignmentExpression' || parent?.type === 'AssignmentPattern') && parent.left === pattern
        ? parent.right
        : undefined;
  const owner = isGlobalObject(unwrap(source)) ? 'global' : ownerOf(source);
  if (owner !== undefined) {
    owners.push(owner);
  }
  // A nested pattern with a default of its own is its property's value
  // through that default.
  const value = parent?.type === 'AssignmentPattern' && parent.left === pattern ? parent : pattern;
  const property = value.parent;
  if (property?.type === 'Property' && property.value === value && property.parent?.type === 'ObjectPattern') {
    const key = spelled(property.key, property.computed);
    // A member of the global object named for it is the global object again.
    const member =
      key === 'process' || key === 'Bun' ? key : key !== undefined && GLOBAL_NAMES.includes(key) ? 'global' : undefined;
    if (member !== undefined && patternOwners(property.parent).includes('global')) {
      owners.push(member);
    }
  }
  return owners;
}

/** An ESLint that runs the printing-path check alone from `cwd`, with no inline configuration, so no comment can waive it. */
function printingCheck(cwd = join(SCRIPTS, '..')): ESLint {
  return new ESLint({
    cwd,
    overrideConfigFile: true,
    allowInlineConfig: false,
    overrideConfig: defineConfig({
      files: CODE_EXTENSIONS.map((extension) => `**/*${extension}`),
      languageOptions: { parser: tseslint.parser },
      plugins: { gate: { rules: { printing: printingPath } } },
      rules: { 'gate/printing': 'error' },
    }),
  });
}

/** What the check finds over `entry` and every repository module it reaches inside `root`, followed to the end. */
async function gatePrinting(
  entry = join(SCRIPTS, RUNNER),
  root = join(SCRIPTS, '..'),
): Promise<{ files: string[]; reports: string[]; allowed: string[] }> {
  // The check queues each module by its real path, so the root and the entry
  // are read by theirs too: a temporary folder on macOS sits behind a link.
  const repository = realpathSync(root);
  const eslint = printingCheck(repository);
  const files: string[] = [];
  const reports: string[] = [];
  const allowed: string[] = [];
  const queue: string[] = [realpathSync(entry)];
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    const name = relative(repository, path).replaceAll('\\', '/');
    if (files.includes(name)) {
      continue;
    }
    files.push(name);
    printingScan = { follow: [], allowed: [] };
    const [result] = await eslint.lintFiles([path]);
    reports.push(...(result?.messages ?? []).map((message) => `${name}:${String(message.line)} ${message.message}`));
    allowed.push(...printingScan.allowed);
    queue.push(...printingScan.follow);
  }
  return { files: files.toSorted(), reports, allowed: allowed.toSorted() };
}

test("the gate's process reaches its streams through print alone, in check.ts and every repository module it reaches", async () => {
  const { files, reports, allowed } = await gatePrinting();

  expect(reports).toEqual([]);
  // The check followed imports made at load and at run time, and met each
  // allowance the gate uses, so its silence is no empty read.
  expect(files).toEqual(
    expect.arrayContaining([
      'scripts/check.ts',
      'scripts/markers.ts',
      'scripts/rows.ts',
      'scripts/run.ts',
      'scripts/tools.ts',
    ]) as string[],
  );
  expect(allowed).toEqual(["check.ts: as print's stream", 'check.ts: inside print']);
});

const REACHED = ['reached'];

/** The check's refusal of a stream reached where print does not reach it. */
const REACHED_TEXT =
  'This reaches a process stream where print does not. Once process.stdout exists, a console call or a write through Bun.stdout can drop what a full pipe does not take, so print every line through print.';

const JSX = ['jsx'];

/** The check's refusal of a JSX element or fragment, whose factory or runtime module it cannot read. */
const JSX_TEXT =
  'This JSX calls the factory, or loads the runtime module, that a pragma comment or a tsconfig.json names. The check reads neither, so it cannot judge what the element runs. Write the code without JSX.';

test.each([
  ['a console call', 'console.log("x");\n', 'probe.ts', REACHED],
  ['console kept in another name', 'const log = console.log;\n', 'probe.ts', REACHED],
  ['console destructured', 'const { error } = console;\n', 'probe.ts', REACHED],
  ['console through globalThis', 'globalThis.console.log("x");\n', 'probe.ts', REACHED],
  ['console through global', 'global.console.log("x");\n', 'probe.ts', REACHED],
  ['console with optional chaining', 'console?.log("x");\n', 'probe.ts', REACHED],
  [
    'console destructured from globalThis',
    'const { console: out } = globalThis;\nexport { out };\n',
    'probe.ts',
    REACHED,
  ],
  ['a named import of log from node:console', 'import { log } from "node:console";\nlog("x");\n', 'probe.ts', REACHED],
  ['a default import of node:console', 'import logger from "node:console";\nlogger.log("x");\n', 'probe.ts', REACHED],
  ['a namespace import of console', 'import * as logger from "console";\nlogger.log("x");\n', 'probe.ts', REACHED],
  ['require of node:console', 'require("node:console").log("x");\n', 'probe.ts', REACHED],
  ['a write to process.stdout', 'process.stdout.write("x");\n', 'probe.ts', REACHED],
  ['a read of process.stderr', 'void process.stderr;\n', 'probe.ts', REACHED],
  ['process with optional chaining', 'process?.stdout?.write("x");\n', 'probe.ts', REACHED],
  ['process by a computed literal key', 'process["stdout"].write("x");\n', 'probe.ts', REACHED],
  ['process through globalThis', 'globalThis.process.stdout.write("x");\n', 'probe.ts', REACHED],
  ['process through global', 'global.process.stdout.write("x");\n', 'probe.ts', REACHED],
  ['process cast with as', 'export {};\n(process as NodeJS.Process).stdout.write("x");\n', 'probe.ts', REACHED],
  [
    'process checked with satisfies',
    'export {};\n(process satisfies NodeJS.Process).stdout.write("x");\n',
    'probe.ts',
    REACHED,
  ],
  ['process with a non-null assertion', 'export {};\nprocess!.stdout.write("x");\n', 'probe.ts', REACHED],
  ['process.emitWarning', 'process.emitWarning("x");\n', 'probe.ts', REACHED],
  ['process._rawDebug', 'process._rawDebug("x");\n', 'probe.ts', REACHED],
  ["a write through Bun's stdout", 'await Bun.write(Bun.stdout, "x");\n', 'probe.ts', REACHED],
  ["Bun's stdout by a computed literal key", 'await Bun.write(Bun["stdout"], "x");\n', 'probe.ts', REACHED],
  ['Bun.write to Bun.file(1)', 'await Bun.write(Bun.file(1), "x");\n', 'probe.ts', REACHED],
  ['Bun.file(2)', 'export const errors = Bun.file(2);\n', 'probe.ts', REACHED],
  ['stdout destructured from process', 'const { stdout } = process;\nexport { stdout };\n', 'probe.ts', REACHED],
  ['stdout destructured from Bun', 'const { stdout } = Bun;\nexport { stdout };\n', 'probe.ts', REACHED],
  [
    'stdout destructured in an assignment',
    'let out: unknown;\n({ stdout: out } = process);\nexport { out };\n',
    'probe.ts',
    REACHED,
  ],
  [
    'stdout destructured from globalThis, nested',
    'const { process: { stdout } } = globalThis;\nexport { stdout };\n',
    'probe.ts',
    REACHED,
  ],
  [
    'stdout destructured as a parameter default',
    'export function f({ stdout } = process): unknown {\n  return stdout;\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a named import of stdout from node:process',
    'import { stdout } from "node:process";\nstdout.write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a named import of stderr from process, renamed',
    'import { stderr as out } from "process";\nout.write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a namespace import of node:process',
    'import * as proc from "node:process";\nproc.stdout.write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a default import of node:process',
    'import proc from "node:process";\nproc.stdout.write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'the default import of node:process spelled as a named one',
    'import { default as proc } from "node:process";\nproc.stdout.write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'the default import of node:process spelled as a named one by a string',
    'import { "default" as proc } from "node:process";\nproc.stdout.write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'the default import of node:tty spelled as a named one, its WriteStream on descriptor 1',
    'import { default as tty } from "node:tty";\nnew tty.WriteStream(1).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a re-export of the default of node:process as a named one',
    'export { default as proc } from "node:process";\n',
    'probe.ts',
    REACHED,
  ],
  ['require of node:process', 'require("node:process").stdout.write("x");\n', 'probe.ts', REACHED],
  ['a dynamic import of process', 'export const proc = await import("process");\n', 'probe.ts', REACHED],
  [
    'a named import of stdout from bun',
    'import { stdout } from "bun";\nawait Bun.write(stdout, "x");\n',
    'probe.ts',
    REACHED,
  ],
  ['a re-export of stdout from node:process', 'export { stdout } from "node:process";\n', 'probe.ts', REACHED],
  ['fs.writeSync to descriptor 1', 'import { writeSync } from "node:fs";\nwriteSync(1, "x");\n', 'probe.ts', REACHED],
  ['fs.write on descriptor 2', 'import fs from "node:fs";\nfs.write(2, "x", () => undefined);\n', 'probe.ts', REACHED],
  [
    'a write stream on descriptor 1',
    'import { createWriteStream } from "node:fs";\ncreateWriteStream("", { fd: 1 }).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a tty WriteStream on descriptor 1',
    'import { WriteStream } from "node:tty";\nnew WriteStream(1).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a namespace import of node:tty',
    'import * as tty from "node:tty";\nnew tty.WriteStream(1).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'fs.writev on descriptor 1',
    'import { writev } from "node:fs";\nwritev(1, [new Uint8Array([120])], () => undefined);\n',
    'probe.ts',
    REACHED,
  ],
  [
    'fs.writevSync to descriptor 2',
    'import fs from "node:fs";\nfs.writevSync(2, [new Uint8Array([120])]);\n',
    'probe.ts',
    REACHED,
  ],
  [
    'fs.writeFile to descriptor 1',
    'import { writeFile } from "node:fs";\nwriteFile(1, "x", () => undefined);\n',
    'probe.ts',
    REACHED,
  ],
  [
    'fs.writeFileSync to descriptor 2',
    'import { writeFileSync } from "node:fs";\nwriteFileSync(2, "x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'fs.appendFile to descriptor 2',
    'import fs from "node:fs";\nfs.appendFile(2, "x", () => undefined);\n',
    'probe.ts',
    REACHED,
  ],
  [
    'fs.appendFileSync to descriptor 1',
    'import { appendFileSync } from "node:fs";\nappendFileSync(1, "x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'writeFile from node:fs/promises to descriptor 1',
    'import { writeFile } from "node:fs/promises";\nawait writeFile(1, "x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'appendFile from node:fs/promises to descriptor 2',
    'import { appendFile } from "node:fs/promises";\nawait appendFile(2, "x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'write from node:fs/promises to descriptor 1',
    'import { write } from "node:fs/promises";\nawait write(1, "x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'writev from node:fs/promises to descriptor 2',
    'import * as fsPromises from "node:fs/promises";\nawait fsPromises.writev(2, [new Uint8Array([120])]);\n',
    'probe.ts',
    REACHED,
  ],
  ['Bun.write to descriptor 1', 'await Bun.write(1, "x");\n', 'probe.ts', REACHED],
  ['file from bun on descriptor 1', 'import { file } from "bun";\nawait file(1).write("x");\n', 'probe.ts', REACHED],
  [
    'a WriteStream from node:fs on descriptor 1',
    'import { WriteStream } from "node:fs";\nnew WriteStream("", { fd: 1 }).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a FileWriteStream from node:fs on descriptor 2',
    'import * as fs from "node:fs";\nnew fs.FileWriteStream("", { fd: 2 }).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a Utf8Stream from node:fs on descriptor 1',
    'import { Utf8Stream } from "node:fs";\nnew Utf8Stream({ fd: 1 }).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a Socket from node:net on descriptor 2',
    'import { Socket } from "node:net";\nnew Socket({ fd: 2 }).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'Bun.connect on descriptor 1',
    'export const socket = await Bun.connect({ fd: 1, socket: { data(): void {} } });\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a descriptor held in a const',
    'import { writeSync } from "node:fs";\nconst OUT = 1;\nwriteSync(OUT, "x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'an fd option held in a const',
    'import { createWriteStream } from "node:fs";\nconst fd = 2;\ncreateWriteStream("", { fd }).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'an fd option in an object a top-level const holds',
    'import { createWriteStream } from "node:fs";\nconst OPTIONS = { fd: 1 } as const;\ncreateWriteStream("", OPTIONS).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'an fd option in an object spread into the options',
    'import { createWriteStream } from "node:fs";\ncreateWriteStream("", { ...{ fd: 1 } }).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'an fd option in a top-level const spread into the options',
    'import { createWriteStream } from "node:fs";\nconst BASE = { fd: 2 };\ncreateWriteStream("", { flags: "a", ...BASE }).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'an fd option in an array literal spread into the arguments',
    'import { createWriteStream } from "node:fs";\ncreateWriteStream(...(["", { fd: 1 }] as const)).write("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a descriptor in an array literal a top-level const spreads into the arguments',
    'import { writeSync } from "node:fs";\nconst ARGS = [1, "x"] as const;\nwriteSync(...ARGS);\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a descriptor in an angle-bracket assertion',
    'import { writeSync } from "node:fs";\nwriteSync(<number>1, "x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a descriptor a top-level const holds in an angle-bracket assertion',
    'import { writeSync } from "node:fs";\nconst OUT = <const>1;\nwriteSync(OUT, "x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'process in an angle-bracket assertion',
    'export {};\n(<NodeJS.Process>process).stdout.write("x");\n',
    'probe.ts',
    REACHED,
  ],
  ['console through self', 'self.console.log("x");\n', 'probe.ts', REACHED],
  ['process through self', 'self.process.stdout.write("x");\n', 'probe.ts', REACHED],
  ['console destructured from self', 'const { console: out } = self;\nexport { out };\n', 'probe.ts', REACHED],
  ['the rest of process destructured', 'const { ...all } = process;\nexport { all };\n', 'probe.ts', REACHED],
  ['the rest of Bun destructured', 'const { ...all } = Bun;\nexport { all };\n', 'probe.ts', REACHED],
  ['the rest of globalThis destructured', 'const { ...all } = globalThis;\nexport { all };\n', 'probe.ts', REACHED],
  [
    'the rest of process destructured in an assignment',
    'let all: unknown;\n({ ...all } = process);\nexport { all };\n',
    'probe.ts',
    REACHED,
  ],
  ['process.emit', 'process.emit("warning", new Error("x"));\n', 'probe.ts', REACHED],
  ['getBuiltinModule of node:console', 'process.getBuiltinModule("node:console").log("x");\n', 'probe.ts', REACHED],
  [
    'getBuiltinModule imported from node:process, of node:process',
    'import { getBuiltinModule } from "node:process";\nexport const proc = getBuiltinModule("node:process");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a createRequire result called on node:console',
    'import { createRequire } from "node:module";\ncreateRequire(import.meta.url)("node:console").log("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a createRequire result a top-level const holds, called on node:console',
    'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\nload("node:console").log("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a module.createRequire result called on node:process',
    'import module from "node:module";\nexport const proc = module.createRequire(import.meta.url)("node:process");\n',
    'probe.ts',
    REACHED,
  ],
  ['require.main.require of node:console', 'require.main?.require("node:console").log("x");\n', 'probe.ts', REACHED],
  ['module.require of node:console', 'module.require("node:console").log("x");\n', 'probe.ts', REACHED],
  [
    'getBuiltinModule imported under another name, of node:console',
    'import { getBuiltinModule as load } from "node:process";\nload("node:console").log("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'createRequire imported under another name, its result called on node:console',
    'import { createRequire as make } from "node:module";\nmake(import.meta.url)("node:console").log("x");\n',
    'probe.ts',
    REACHED,
  ],
  [
    'createRequire imported under another name, its result a const holds, called on node:console',
    'import { createRequire as make } from "node:module";\nconst load = make(import.meta.url);\nload("node:console").log("x");\n',
    'probe.ts',
    REACHED,
  ],
  ['an object spread of process', 'export const all = { ...process };\n', 'probe.ts', REACHED],
  ['an object spread of Bun', 'export const all = { ...Bun };\n', 'probe.ts', REACHED],
  ['an object spread of globalThis', 'export const all = { ...globalThis };\n', 'probe.ts', REACHED],
  [
    'an object spread of process through globalThis',
    'export const all = { ...globalThis.process };\n',
    'probe.ts',
    REACHED,
  ],
  ['console through globalThis.globalThis', 'globalThis.globalThis.console.log("x");\n', 'probe.ts', REACHED],
  ['process through self.globalThis', 'self.globalThis.process.stdout.write("x");\n', 'probe.ts', REACHED],
  [
    'console destructured from the self of globalThis',
    'const { self: { console: out } } = globalThis;\nexport { out };\n',
    'probe.ts',
    REACHED,
  ],
  [
    'console destructured from the self of globalThis, the nested pattern with a default of its own',
    'const { self: { console: out } = {} as typeof globalThis } = globalThis;\nexport { out };\n',
    'probe.ts',
    REACHED,
  ],
  [
    'stdout destructured from the process of globalThis, the nested pattern with a default of its own',
    'const { process: { stdout } = {} as NodeJS.Process } = globalThis;\nexport { stdout };\n',
    'probe.ts',
    REACHED,
  ],
  [
    'console destructured from the self of globalThis through a nested default, in a parameter default',
    'export function f({ self: { console: out } = {} as typeof globalThis } = globalThis): unknown {\n  return out;\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'console destructured from the self of globalThis through a nested default, in an assignment',
    'let out: unknown;\n({ self: { console: out } = {} as typeof globalThis } = globalThis);\nexport { out };\n',
    'probe.ts',
    REACHED,
  ],
  [
    'stdout destructured two levels under a nested default keyed globalThis',
    'const { globalThis: { process: { stdout } } = {} as typeof globalThis } = globalThis;\nexport { stdout };\n',
    'probe.ts',
    REACHED,
  ],
  [
    'stdout destructured from the process of globalThis, whose nested default is the global object',
    'const { process: { stdout } = globalThis } = globalThis;\nexport { stdout };\n',
    'probe.ts',
    REACHED,
  ],
  [
    'stdout destructured from the self of globalThis, whose nested default is process',
    'const { self: { stdout } = process } = globalThis;\nexport { stdout };\n',
    'probe.ts',
    REACHED,
  ],
  [
    'console destructured from the self of globalThis, whose nested default is process',
    'const { self: { console: out } = process } = globalThis;\nexport { out };\n',
    'probe.ts',
    REACHED,
  ],
  [
    'stdout destructured through a nested default of process, under an object that is no owner',
    'const { other: { stdout } = process } = {} as { other?: NodeJS.Process };\nexport { stdout };\n',
    'probe.ts',
    REACHED,
  ],
  ['an object spread of globalThis.self', 'export const all = { ...globalThis.self };\n', 'probe.ts', REACHED],
  [
    'a dynamic import of a block const holding node:console, shadowing a const holding node:fs',
    'const where = "node:fs";\n{\n  const where = "node:console";\n  await import(where);\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'require of a block const holding node:console, shadowing a const holding node:fs',
    'const where = "node:fs";\n{\n  const where = "node:console";\n  require(where);\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a dynamic import of a const a type of the same name leaves in place',
    'const where = "node:console";\n{\n  type where = string;\n  await import(where);\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a descriptor a const in a function holds',
    'import { writeSync } from "node:fs";\nexport function f(): void {\n  const OUT = 1;\n  writeSync(OUT, "x");\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a descriptor a block const holds, shadowing a const holding the same',
    'import { writeSync } from "node:fs";\nconst OUT = 1;\n{\n  const OUT = 1;\n  writeSync(OUT, "x");\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'an fd object a block const holds, shadowing a const holding the same',
    'import { createWriteStream } from "node:fs";\nconst OPTIONS = { fd: 1 };\n{\n  const OPTIONS = { fd: 1 };\n  createWriteStream("", OPTIONS).write("x");\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a createRequire result a block const holds, shadowing a const holding another, called on node:console',
    'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\n{\n  const load = createRequire(import.meta.url);\n  load("node:console").log("x");\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a descriptor a block const holds, shadowing a const holding another',
    'import { writeSync } from "node:fs";\nconst OUT = 3;\n{\n  const OUT = 1;\n  writeSync(OUT, "x");\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a descriptor const a type parameter of the same name leaves in place',
    'import { writeSync } from "node:fs";\nconst OUT = 1;\nexport function f<OUT>(): void {\n  writeSync(OUT, "x");\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'an fd option in an object a const in a function holds',
    'import { createWriteStream } from "node:fs";\nexport function f(): void {\n  const OPTIONS = { fd: 2 };\n  createWriteStream("", OPTIONS).write("x");\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a createRequire result a const in a function holds, called on node:console',
    'import { createRequire } from "node:module";\nexport function f(): void {\n  const load = createRequire(import.meta.url);\n  load("node:console").log("x");\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a dynamic import of a const a namespace holds, which Bun keeps',
    'export namespace N {\n  const where = "node:console";\n  export const loaded: unknown = import(where);\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    "check.ts's own entry block, which runs in the gate's process",
    'if (import.meta.main) {\n  console.error("x");\n}\n',
    'check.ts',
    REACHED,
  ],
  [
    'the else branch of the entry test, which runs on import',
    'if (import.meta.main) {\n  void 0;\n} else {\n  console.error("x");\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a function named print outside check.ts',
    'export function print(): void {\n  process.stdout.write("x");\n}\n',
    'probe.ts',
    REACHED,
  ],
  [
    'a function named print nested in another in check.ts',
    'export function main(): void {\n  function print(): void {\n    console.log("x");\n  }\n  print();\n}\n',
    'check.ts',
    REACHED,
  ],
  [
    'a dynamic import whose module a value decides',
    'declare function pick(): string;\nexport const module = await import(pick());\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'require whose module a value decides',
    'declare const where: string;\nrequire(where);\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'getBuiltinModule whose module a value decides',
    'declare const where: string;\nexport const module = process.getBuiltinModule(where);\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a createRequire result called on a value',
    'import { createRequire } from "node:module";\ndeclare const where: string;\ncreateRequire(import.meta.url)(where);\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a dynamic import of a const set to another const',
    'const target = "./check";\nconst where = target;\nexport const module = await import(where);\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a dynamic import of a parameter that shadows a const holding a literal',
    'const where = "node:fs";\nexport async function load(where: string): Promise<unknown> {\n  return import(where);\n}\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a dynamic import of a loop variable that shadows a const holding a literal',
    'const where = "node:fs";\nfor (const where of ["node:console"]) {\n  await import(where);\n}\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a dynamic import of a block const holding a value, shadowing a const holding a literal',
    'declare function pick(): string;\nconst where = "node:fs";\n{\n  const where = pick();\n  await import(where);\n}\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'require of a parameter that shadows a const holding a literal',
    'const where = "node:fs";\nexport function load(where: string): unknown {\n  return require(where);\n}\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'require of a loop variable that shadows a const holding a literal',
    'const where = "node:fs";\nfor (const where of ["node:console"]) {\n  require(where);\n}\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'require of a block const holding a value, shadowing a const holding a literal',
    'declare function pick(): string;\nconst where = "node:fs";\n{\n  const where = pick();\n  require(where);\n}\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a dynamic import of a let holding a literal, which code can set again',
    'let where = "node:fs";\nexport function move(to: string): void {\n  where = to;\n}\nexport const module = await import(where);\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    "a dynamic import of a name destructured from a const's literal",
    'const [where] = "node:fs";\nexport const module = await import(where);\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a dynamic import of an ambient const, which Bun erases, so the name reads the global of that name',
    '(globalThis as Record<string, unknown>)["where"] = "node:console";\ndeclare const where = "node:fs";\nexport const loaded: unknown = await import(where);\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a dynamic import of a const a declare namespace holds, which Bun erases',
    'declare namespace N {\n  const where = "node:console";\n  const loaded: unknown = import(where);\n}\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a dynamic import of a const a declare module block holds, which Bun erases',
    'declare module "m" {\n  const where = "node:console";\n  const loaded: unknown = import(where);\n}\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a dynamic import of a const a declare global block holds, which Bun erases',
    'declare global {\n  const where = "node:console";\n  const loaded: unknown = import(where);\n}\nexport {};\n',
    'probe.ts',
    ['unfollowed'],
  ],
  [
    'a dynamic import of a const a namespace inside a declare namespace holds, which Bun erases',
    'declare namespace A {\n  namespace B {\n    const where = "node:console";\n    const loaded: unknown = import(where);\n  }\n}\n',
    'probe.ts',
    ['unfollowed'],
  ],
  ['a relative specifier that names no file', 'import "./no-such-module";\n', 'probe.ts', ['unplaced']],
  ['a package name no package carries', 'import "no-such-package";\n', 'probe.ts', ['unplaced']],
  ['a subpath import package.json does not map', 'import "#no-such-import";\n', 'probe.ts', ['unplaced']],
  ['require of a relative specifier that names no file', 'require("./no-such-module");\n', 'probe.ts', ['unplaced']],
  ['a data: URL', 'import "data:text/javascript,void 0";\n', 'probe.ts', ['unplaced']],
  ['a specifier with a query string', 'import "./check.ts?x=1";\n', 'probe.ts', ['unplaced']],
  [
    "print's own default stream in check.ts",
    "export function print(text = '', stream = process.stdout): string {\n  return text + String(stream);\n}\n",
    'check.ts',
    [],
  ],
  ['a stream handed to print', 'await print("x", process.stderr);\n', 'probe.ts', []],
  ["another module's entry block", 'if (import.meta.main) {\n  console.error("x");\n}\n', 'probe.ts', []],
  ['isatty from node:tty', 'import { isatty } from "node:tty";\nexport const terminal = isatty(1);\n', 'probe.ts', []],
  [
    'a type imported from node:tty',
    'import type { WriteStream } from "node:tty";\nexport type Out = WriteStream;\n',
    'probe.ts',
    [],
  ],
  [
    'another name imported from bun',
    'import { file } from "bun";\nexport const notes = file("notes.txt");\n',
    'probe.ts',
    [],
  ],
  ['a write to another descriptor', 'import { writeSync } from "node:fs";\nwriteSync(3, "x");\n', 'probe.ts', []],
  [
    'a const holding another descriptor',
    'import { writeSync } from "node:fs";\nconst LOG = 3;\nwriteSync(LOG, "x");\n',
    'probe.ts',
    [],
  ],
  ['a write to a path', 'import { writeFileSync } from "node:fs";\nwriteFileSync("notes.txt", "x");\n', 'probe.ts', []],
  [
    'a dynamic import of a const holding a literal',
    "const where = './check';\nexport const module = await import(where);\n",
    'probe.ts',
    [],
  ],
  [
    'a dynamic import of a const holding a literal with as const',
    "const where = 'node:fs' as const;\nexport const module = await import(where);\n",
    'probe.ts',
    [],
  ],
  [
    'a dynamic import of a literal cast with as',
    "export const module = await import('node:fs' as string);\n",
    'probe.ts',
    [],
  ],
  ['getBuiltinModule of another built-in', 'export const fs = process.getBuiltinModule("node:fs");\n', 'probe.ts', []],
  [
    'an fd option in a const object holding another descriptor',
    'import { createWriteStream } from "node:fs";\nconst OPTIONS = { fd: 3 };\ncreateWriteStream("", OPTIONS).write("x");\n',
    'probe.ts',
    [],
  ],
  [
    'two const objects spread into each other, each read once',
    'import { createWriteStream } from "node:fs";\nconst A: object = { ...B };\nconst B: object = { ...A };\ncreateWriteStream("", A).write("x");\n',
    'probe.ts',
    [],
  ],
  [
    'a descriptor an ambient const holds, the global of that name set to 1, read as any value is',
    'import { writeSync } from "node:fs";\n(globalThis as Record<string, unknown>)["OUT"] = 1;\ndeclare const OUT = 3;\nwriteSync(OUT, "x");\n',
    'probe.ts',
    [],
  ],
  [
    'descriptor 1 an ambient const holds, read as any value is, since Bun erases the literal',
    'import { writeSync } from "node:fs";\ndeclare const OUT = 1;\nwriteSync(OUT, "x");\n',
    'probe.ts',
    [],
  ],
  ['the rest of another object destructured', 'const { ...all } = { a: 1 };\nexport { all };\n', 'probe.ts', []],
  [
    'a nested pattern with a default keyed self, under an object that is not the global object',
    'const { self: { console: out } = {} } = { self: {} };\nexport { out };\n',
    'probe.ts',
    [],
  ],
  ['a type query on console', 'export type Logger = typeof console;\n', 'probe.ts', []],
  ['a type query on a member of console', 'export type Log = typeof console.log;\n', 'probe.ts', []],
  ['a type query on console through globalThis', 'export type Logger = typeof globalThis.console;\n', 'probe.ts', []],
  [
    'the names in a comment and a string',
    '// console.log(process.stdout)\nexport const note = "console.log(process.stdout)";\n',
    'probe.ts',
    [],
  ],
  ['a key named console', 'export const options = { console: true };\n', 'probe.ts', []],
  [
    'a dynamic import of a block const holding node:fs, shadowing a const holding node:console',
    'const where = "node:console";\n{\n  const where = "node:fs";\n  await import(where);\n}\n',
    'probe.ts',
    [],
  ],
  [
    'require of a block const holding node:fs, shadowing a const holding node:console',
    'const where = "node:console";\n{\n  const where = "node:fs";\n  require(where);\n}\n',
    'probe.ts',
    [],
  ],
  [
    'a descriptor const a block const holding another descriptor shadows',
    'import { writeSync } from "node:fs";\nconst OUT = 1;\n{\n  const OUT = 3;\n  writeSync(OUT, "x");\n}\n',
    'probe.ts',
    [],
  ],
  [
    'an fd object const a block const holding another object shadows',
    'import { createWriteStream } from "node:fs";\nconst OPTIONS = { fd: 1 };\n{\n  const OPTIONS = { fd: 3 };\n  createWriteStream("", OPTIONS).write("x");\n}\n',
    'probe.ts',
    [],
  ],
  [
    'a createRequire const a parameter of the same name shadows',
    'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\nexport function f(load: (id: string) => unknown): unknown {\n  return load("node:console");\n}\n',
    'probe.ts',
    [],
  ],
  [
    'getBuiltinModule imported under another name that a parameter shadows',
    'import { getBuiltinModule as load } from "node:process";\nexport function f(load: (id: string) => unknown): unknown {\n  return load("node:console");\n}\n',
    'probe.ts',
    [],
  ],
  [
    'another name imported from node:module under another name',
    'import { isBuiltin as known } from "node:module";\nexport const builtin = known("node:fs");\n',
    'probe.ts',
    [],
  ],
  [
    'getBuiltinModule imported under another name from a module other than process',
    'import { getBuiltinModule as load } from "./check";\nexport const loaded = load("node:console");\n',
    'probe.ts',
    [],
  ],
  ['an object spread of process.env', 'export const environment = { ...process.env };\n', 'probe.ts', []],
  ['an object spread of another object', 'export const all = { ...{ a: 1 } };\n', 'probe.ts', []],
  [
    'JSX under a classic pragma naming console.log, in a .tsx module',
    '/** @jsxRuntime classic */\n/** @jsx console.log */\nexport const element = <div title="x" />;\n',
    'probe.tsx',
    JSX,
  ],
  [
    'JSX under a classic pragma naming console.log, in a .jsx module',
    '/** @jsxRuntime classic */\n/** @jsx console.log */\nexport const element = <div title="x" />;\n',
    'probe.jsx',
    JSX,
  ],
  [
    'JSX under a classic pragma naming console.log, in a .js module',
    '/** @jsxRuntime classic */\n/** @jsx console.log */\nexport const element = <div title="x" />;\n',
    'probe.js',
    JSX,
  ],
  [
    'JSX under an @jsxImportSource pragma, in a .tsx module',
    '/** @jsxImportSource ./rt */\nexport const element = <div />;\n',
    'probe.tsx',
    JSX,
  ],
  [
    'a JSX fragment, in a .tsx module',
    '/** @jsxImportSource ./rt */\nexport const fragment = <></>;\n',
    'probe.tsx',
    JSX,
  ],
])(
  'a stream reached as %s is judged',
  async (_label: string, text: string, file: string, expected: readonly string[]) => {
    // A rule that throws, as a read that never ends does once the stack runs
    // out, comes back as its error's text, so the case fails on its assertion.
    const ids: readonly string[] = await printingCheck()
      .lintText(text, { filePath: join(SCRIPTS, file) })
      .then(
        ([result]) => (result?.messages ?? []).map((message) => message.messageId ?? message.message),
        (error: unknown) => [`threw ${String(error)}`],
      );

    expect(ids).toEqual([...expected]);
  },
);

test.each([
  ['an import', "import './evil';\n", 'evil.ts'],
  ['require', "require('./evil');\n", 'evil.ts'],
  ['a dynamic import of a template with no substitution', 'await import(`./evil`);\n', 'evil.ts'],
  ['import x = require', "import evil = require('./evil');\nvoid evil;\n", 'evil.ts'],
  ['a ../ specifier that stays inside the repository', "import '../scripts/evil';\n", 'evil.ts'],
  ['a specifier with its .ts extension', "import './evil.ts';\n", 'evil.ts'],
  ['a re-export', "export * from './evil';\n", 'evil.ts'],
  ['a dynamic import of a const holding a literal', "const where = './evil';\nawait import(where);\n", 'evil.ts'],
  [
    'a dynamic import of a const holding a literal with as const',
    "const where = './evil' as const;\nawait import(where);\n",
    'evil.ts',
  ],
  ['import.meta.require', "import.meta.require('./evil');\n", 'evil.ts'],
  ['module.require', "module.require('./evil');\n", 'evil.ts'],
  ['require.main.require', "require.main?.require('./evil');\n", 'evil.ts'],
  [
    'a createRequire result called',
    "import { createRequire } from 'node:module';\ncreateRequire(import.meta.url)('./evil');\n",
    'evil.ts',
  ],
  [
    'a createRequire result a top-level const holds',
    "import { createRequire } from 'node:module';\nconst load = createRequire(import.meta.url);\nload('./evil');\n",
    'evil.ts',
  ],
  [
    'a createRequire result a const in a function holds',
    "import { createRequire } from 'node:module';\nexport function load(): unknown {\n  const local = createRequire(import.meta.url);\n  return local('./evil');\n}\n",
    'evil.ts',
  ],
  [
    'a createRequire imported under another name, its result called',
    "import { createRequire as make } from 'node:module';\nmake(import.meta.url)('./evil');\n",
    'evil.ts',
  ],
  ['a .js specifier that names the .ts file', "import './evil.js';\n", 'evil.ts'],
  ['a subpath import package.json maps', "import '#evil';\n", 'evil.ts'],
  ['a subpath import package.json maps through a pattern', "import '#scripts/evil';\n", 'evil.ts'],
  ['a paths entry in scripts/tsconfig.json', "import '@evil';\n", 'evil.ts'],
  ['a paths pattern in scripts/tsconfig.json', "import '@scripts/evil';\n", 'evil.ts'],
  ['an import of a .mts module', "import './evil.mts';\n", 'evil.mts'],
  ['an import of a .cts module', "import './evil.cts';\n", 'evil.cts'],
  ['an import of a .tsx module', "import './evil.tsx';\n", 'evil.tsx'],
  ['an import of a .js module', "import './evil.js';\n", 'evil.js'],
  ['an import of a .mjs module', "import './evil.mjs';\n", 'evil.mjs'],
  ['an import of a .cjs module', "import './evil.cjs';\n", 'evil.cjs'],
  ['an import of a .jsx module', "import './evil.jsx';\n", 'evil.jsx'],
])('the check follows %s into the module it names', async (_label: string, text: string, module: string) => {
  const root = mkdtempSync(join(tmpdir(), 'gate-printing-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'node_modules', 'outside'), { recursive: true });
    writeFileSync(join(root, 'scripts', RUNNER), `${text}import '../node_modules/outside/index.ts';\n`);
    writeFileSync(join(root, 'scripts', module), 'console.log("x");\n');
    writeFileSync(join(root, 'node_modules', 'outside', 'index.ts'), 'console.log("x");\n');
    // Bun resolves a gate module's specifier through the root package.json's
    // subpath imports and through scripts/tsconfig.json's paths.
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ imports: { '#evil': './scripts/evil.ts', '#scripts/*': './scripts/*.ts' } }),
    );
    writeFileSync(
      join(root, 'scripts', 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@evil': ['./evil.ts'], '@scripts/*': ['./*'] } } }),
    );

    const { files, reports } = await gatePrinting(join(root, 'scripts', RUNNER), root);

    expect(files).toEqual(['scripts/check.ts', `scripts/${module}`]);
    expect(reports).toEqual([`scripts/${module}:1 ${REACHED_TEXT}`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// JSX calls the factory, or loads the runtime module, that a pragma comment or
// a tsconfig.json names, and the check reads neither. So a module check.ts
// imports is refused at its element, and the runtime module a pragma names
// beside it is never read.
test.each([
  [
    'a classic pragma naming console.log',
    '/** @jsxRuntime classic */\n/** @jsx console.log */\nexport const element = <div title="x" />;\n',
    3,
  ],
  [
    'an @jsxImportSource pragma naming a repository folder',
    '/** @jsxImportSource ./rt */\nexport const element = <div />;\n',
    2,
  ],
])(
  'the check refuses JSX in a module check.ts imports, under %s',
  async (_label: string, view: string, line: number) => {
    const root = mkdtempSync(join(tmpdir(), 'gate-printing-'));
    try {
      mkdirSync(join(root, 'scripts', 'rt'), { recursive: true });
      mkdirSync(join(root, 'node_modules'));
      writeFileSync(join(root, 'scripts', RUNNER), "import { element } from './view.tsx';\nvoid element;\n");
      writeFileSync(join(root, 'scripts', 'view.tsx'), view);
      writeFileSync(
        join(root, 'scripts', 'rt', 'jsx-dev-runtime.ts'),
        'console.log("x");\nexport const jsxDEV = (): null => null;\n',
      );

      const { files, reports } = await gatePrinting(join(root, 'scripts', RUNNER), root);

      expect({ files, reports }).toEqual({
        files: ['scripts/check.ts', 'scripts/view.tsx'],
        reports: [`scripts/view.tsx:${String(line)} ${JSX_TEXT}`],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

/** The check's refusal of a file it neither lints nor passes as data, naming the file as `name`. */
function unreadText(name: string): string {
  return `The check cannot judge ${JSON.stringify(name)}. It reads a module ending in .ts, .mts, .cts, .tsx, .js, .mjs, .cjs or .jsx, and passes a .json, .toml or .txt file as data. Load a file with one of those extensions.`;
}

// Bun parses a JSON, TOML or text file into a value and runs nothing in it,
// so the check passes such a file unread, whatever it holds. It refuses every
// other file it reaches but a module it lints, since it cannot judge what
// Bun does with one: a YAML file, a module in no extension or in one spelled
// in upper case, which Bun runs and ESLint matches by case, and a file Bun
// hands over as its path.
test.each([
  [
    'passes a JSON file imported with its attribute',
    "import data from '../data.json' with { type: 'json' };\nvoid data;\n",
    'data.json',
    '{ "note": "console.log(1)" }\n',
    [],
  ],
  ['passes a JSON file named by require', "require('../data.json');\n", 'data.json', '{}\n', []],
  [
    'passes a JSON file whose extension is in upper case',
    "import data from '../DATA.JSON' with { type: 'json' };\nvoid data;\n",
    'DATA.JSON',
    '{}\n',
    [],
  ],
  [
    'passes a TOML file',
    "import settings from './settings.toml';\nvoid settings;\n",
    'scripts/settings.toml',
    'a = 1\n',
    [],
  ],
  [
    'passes a text file that holds code',
    "import notes from './notes.txt';\nvoid notes;\n",
    'scripts/notes.txt',
    'console.log("x");\n',
    [],
  ],
  [
    'refuses a YAML file',
    "import settings from './settings.yaml';\nvoid settings;\n",
    'scripts/settings.yaml',
    'a: 1\n',
    [`scripts/check.ts:1 ${unreadText('scripts/settings.yaml')}`],
  ],
  [
    'refuses a module with no extension',
    "import './evil';\n",
    'scripts/evil',
    'console.log("x");\n',
    [`scripts/check.ts:1 ${unreadText('scripts/evil')}`],
  ],
  [
    'refuses a module whose extension is in upper case',
    "import './evil.TS';\n",
    'scripts/evil.TS',
    'console.log("x");\n',
    [`scripts/check.ts:1 ${unreadText('scripts/evil.TS')}`],
  ],
  [
    'refuses a file Bun hands over as its path',
    "import where from './run.sh';\nvoid where;\n",
    'scripts/run.sh',
    'echo x\n',
    [`scripts/check.ts:1 ${unreadText('scripts/run.sh')}`],
  ],
])(
  'the check %s, reading nothing in it',
  async (_label: string, text: string, path: string, body: string, expected: readonly string[]) => {
    const root = mkdtempSync(join(tmpdir(), 'gate-printing-'));
    try {
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, 'node_modules'));
      writeFileSync(join(root, 'scripts', RUNNER), text);
      writeFileSync(join(root, ...path.split('/')), body);

      const { files, reports } = await gatePrinting(join(root, 'scripts', RUNNER), root);

      expect({ files, reports }).toEqual({ files: ['scripts/check.ts'], reports: [...expected] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test.each([
  ['a named import of console', "import { log } from '#console';\nlog('x');\n"],
  ['a namespace import of process', "import * as proc from '#process';\nvoid proc;\n"],
  ['a named import of stdout from process', "import { stdout } from '#process';\nvoid stdout;\n"],
  ['a namespace import of tty', "import * as tty from '#tty';\nvoid tty;\n"],
])(
  'the check judges %s named through a subpath import by the module Bun resolves',
  async (_label: string, text: string) => {
    const root = mkdtempSync(join(tmpdir(), 'gate-printing-'));
    try {
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, 'node_modules'));
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ imports: { '#console': 'node:console', '#process': 'node:process', '#tty': 'node:tty' } }),
      );
      writeFileSync(join(root, 'scripts', RUNNER), text);

      const { files, reports } = await gatePrinting(join(root, 'scripts', RUNNER), root);

      expect({ files, reports }).toEqual({
        files: ['scripts/check.ts'],
        reports: [expect.stringMatching(/^scripts\/check\.ts:1 This reaches a process stream/) as string],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test('the check refuses a specifier Bun resolves outside the repository and outside node_modules', async () => {
  const base = mkdtempSync(join(tmpdir(), 'gate-printing-'));
  try {
    const root = join(base, 'repository');
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(base, 'outside.ts'), 'console.log("x");\n');
    writeFileSync(join(root, 'scripts', RUNNER), "import '../../outside';\n");

    const { files, reports } = await gatePrinting(join(root, 'scripts', RUNNER), root);

    expect({ files, reports }).toEqual({
      files: ['scripts/check.ts'],
      reports: [
        expect.stringMatching(
          /^scripts\/check\.ts:1 Bun resolves "\.\.\/\.\.\/outside" to no built-in module/,
        ) as string,
      ],
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
