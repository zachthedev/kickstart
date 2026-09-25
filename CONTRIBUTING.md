# Contributing

## Setup

<!-- TODO(kickstart): add what your project needs beyond these, each naming the file that pins its version. -->

The machine needs:

- [Bun](https://bun.sh), at the version `packageManager` in `package.json` names. Every package the gate runs
  arrives through `bun install` at the version `bun.lock` records.
- [mise](https://mise.jdx.dev). It installs the tools `mise.toml` pins at the versions `mise.lock` records.
- [git](https://git-scm.com). The gate's first check names the work tree through `git rev-parse` and lists tracked
  files through `git ls-files`, and the `markers` row reads the tree through `git grep` and `git diff`.
- [gh](https://cli.github.com), optional. When `gh auth token` answers, the gate runs zizmor online. Otherwise
  zizmor runs offline and no token is needed.

These four are every program the gate starts from `PATH`: Bun runs the gate, and the gate starts git, mise and gh
by name. Every other program it runs is a package under `node_modules/` or a tool `mise which` names.

<!-- TODO(kickstart): add any step your project needs between a fresh clone and a green gate. -->

The first run:

```sh
mise trust
bun install
bun run check
```

`mise trust` lets mise read this checkout's `mise.toml`. `bun install` installs the dependencies, and its
`prepare` script installs the git hooks. The first gate run installs the mise tools from the lockfile. Before you
install a branch you did not write, read [Safety](#safety).

Run `bun install --frozen-lockfile` after every pull and every branch switch, before you run the gate or commit.
The gate and the hooks start each JavaScript tool from this checkout's `node_modules/`, and a stale install runs
another version ([Troubleshooting](#troubleshooting)). A new worktree installs with
`bun install --frozen-lockfile --ignore-scripts`. The hooks are shared by every worktree of a clone, and the
`prepare` script would repoint them at the worktree, which stops working once the worktree is removed. A Claude
Code worktree starts with no `node_modules/`.

The commit hooks lint and format the staged files and check every commit message before it is recorded. The push
hook runs the quick gate and refuses the push when it fails. The commit hooks start their tools as
`bunx --bun --no-install <tool>`, which runs the copy `node_modules/.bin` holds, under Bun rather than a `node` on
`PATH`, and fetches nothing. The `format` script starts Prettier the same way. The hooks are no control
([Safety](#safety)).

`.claude/settings.json` allows `git status` alone, the allowlist every `zachthedev` repository shares, with deny
entries for `--output` and `--no-index`, and adds nothing to it.

## Safety

A pull request controls its own install, hooks and gate code. Read a branch's diff before you run anything on it,
a commit included, since the commit hook runs the branch's own `commitlint.config.js`. Install a branch you have
not read with `bun install --frozen-lockfile --ignore-scripts`, which runs no package's install script. Bun runs a
`bunfig.toml` preload before the gate's first line, and `bun run check` puts the branch's own `node_modules/.bin`
first on `PATH`. `eslint.config.ts` and `commitlint.config.js` are code the `lint` row and the commit hook run. The
shared jobs refuse such a branch before it merges, and nothing stops its first run on your machine but the diff
read.

What reaches the tools from your own environment:

- `BUN_OPTIONS` reaches every direct Bun start: the gate itself through `bun run check`, `check:quick`,
  `check:rows` and the push hook, `bun run markers`, and the `prepare` script's lefthook install. A `--preload` in
  it runs a module first in each. The gate withholds it from the processes it starts, and a tool started through
  `bunx --bun --no-install` does not read it. Leave it unset.
- `BUN_INSPECT`, `BUN_INSPECT_CONNECT_TO` and `BUN_INSPECT_PRELOAD`. Leave them unset too. The last runs a module in
  every direct Bun start, the gate's `bun test` rows among them, and nothing in the hooks or the gate clears them.
- A personal env file. bunx ignores `--no-env-file`, so an untracked `.env` reaches every JavaScript tool the hooks,
  the `format` script and the gate's rows start, and can change what one reports
  ([Troubleshooting](#troubleshooting)).
- `MISE_BACKENDS_<TOOL>`. Leave it unset. It overrides a tool's backend from the environment, no setting reports
  it, and the gate does not close that gap.

The hooks are no control:

- A hook runs in your own environment and clears nothing from it.
- The hooks fail open. The hook script `lefthook install` writes prints `Can't find lefthook in PATH` and exits 0
  when it finds no lefthook binary, as in a checkout whose `node_modules/` is gone, and the commit or push goes
  through unchecked. A fresh clone runs no hook until `bun install` runs.
- They catch an accident, never a hostile branch. lefthook merges a branch's `lefthook-local.*` or
  `.config/lefthook-local.*` over `lefthook.yml`, and a job there with a hook job's name replaces it.

CI's `commits` job and gate decide the merge.

## Running it

<!-- TODO(kickstart): say how your program runs, or write "None." when the repository ships no program. -->

```sh
bun src/cli.ts Ada
```

That runs the placeholder command from source. Bun runs TypeScript as it is, so nothing is built first.

<!-- TODO(kickstart): list your project's generated files, each with the command that regenerates it. -->

Generated files, and the command that writes each:

- `MARKERS.md`: `bun run markers`, from the template markers in the tree. The `markers` row regenerates it and
  fails when the tree differs. It goes when the template is absorbed
  ([README.md#template-markers](README.md#template-markers)).
- `mise.lock`: `mise lock`, after any edit to `mise.toml`. The taplo checksum lines are the exception `mise.toml`
  records.
- `bun.lock`: `bun install`.

## Where code goes

<!-- TODO(kickstart): say where your project's code goes, by directory, and keep the lines below that still
apply. -->

- `src/`: the program. `example.ts` is the placeholder module and `cli.ts` the placeholder command.
- `tests/`: the `bun test` suite, one file per module under `src/`.
- `scripts/`: the gate. `check.ts` is the runner, `startup.ts` holds what the gate refuses before its rows,
  `expected.ts` lists where this repository's project configs sit, `tools.ts` holds the mise expectations,
  `run.ts` starts every process, `rows.ts` holds what the rows conclude from their tools' output, `github.ts` reads
  gh's token, `shellcheck.ts` stands in for ShellCheck under actionlint, `eslint-plugin.ts` holds the ESLint rule
  `eslint.config.ts` loads, and `markers.ts` writes `MARKERS.md`. `run.ts`, `tools.ts`, `startup.ts`, `rows.ts`,
  `github.ts`, `shellcheck.ts`, `eslint-plugin.ts` and `stand-ins.ts`, with the suites beside them, are the same
  in every repository of the set.
- `docs/`, once a repository carries one: the documents [README.md#documentation](README.md#documentation) indexes.

## Code

<!-- TODO(kickstart): add the code conventions your project holds that no tool enforces. -->

- Every function signature carries explicit parameter and return types.
- Validate at the boundary and trust the inside. Input from a user, a file or a network is checked where it
  arrives, with zod where it has a shape.
- A comment explains why the code is shaped as it is. What changed goes in the commit message.
- Every process a script starts goes through `scripts/run.ts`, so every one starts from `PATH` alone, with no
  shell.
- A message that quotes input, such as a path or a value read from a file, JSON-quotes it. A newline or a carriage
  return in input then stays inside one line, where it cannot start a workflow command in a CI log.
- ESLint lints and Prettier formats. An ESLint rule that is wrong for this code is turned off in
  `eslint.config.ts` with its reason beside it.
- A waiver in code names exactly what it waives and says why, and a linter checks both. An ESLint directive names
  each rule and gives its reason after `--`, as in `// eslint-disable-next-line no-debugger -- reason`, and a
  disable is closed by its enable. `@ts-expect-error` carries a description of ten characters or more, and
  `@ts-ignore` and `@ts-nocheck` are refused. The gate's own ESLint rule, in `scripts/eslint-plugin.ts`, reads every
  comment ESLint parses: each `eslint`, `eslint-disable`, `eslint-disable-line`, `eslint-disable-next-line`,
  `eslint-enable`, `eslint-env`, `global`, `globals` and `exported` directive, and each `@ts-expect-error` or
  `@ts-ignore`. It refuses a reason that holds no letter or digit once default-ignorable code points are removed.
  The eslint-comments plugin and ban-ts-comment accept a reason of a soft hyphen, a word joiner or a Braille blank
  alone, and the rule refuses each. Nothing checks a reason on Prettier's ignore comment, so the `format` row
  refuses the comment itself.
- An import carries `with { type: 'json' }` or no attribute, and a dynamic import takes no options. ESLint refuses
  any other attribute, since Bun runs a file of any extension as code under one naming a loader, and no row reads
  a `.txt` as code.
- `.prettierrc` holds formatting options alone. Prettier loads a plugin or a shared config module it names as code
  before it checks anything, so a reviewer refuses a `plugins` key or a string value.

## Tests

<!-- TODO(kickstart): add the test conventions your project holds that no tool enforces. -->

- `bun test` is the runner. A test file sits under `tests/` and ends in `.test.ts`.
- A test states what the code is supposed to do, derived from the requirement, never copied from what the code
  printed.
- Table-driven cases through `test.each` are the default where several inputs share one assertion.
- A test touches no file outside a temporary directory and no network. Anything the code under test reaches in
  the operating system arrives as a parameter, in every case, whether or not the case reaches it today.
  `src/cli.ts` takes its two streams that way.

<!-- TODO(kickstart): name the tests that need a real server, machine or network, and how to run them. -->

No test needs a real service. Every test under `tests/` runs inside the `bun test` process, with the streams it
writes to passed in.

The gate's own tests under `scripts/` start a stand-in, itself a Bun process, in place of every program the gate
starts, and their `PATH` holds the stand-ins alone. So no case starts your gh, git or mise or reaches the network.
The suite covers `scripts/rows.ts`, which holds what the rows conclude from their tools' output. What
`scripts/check.ts` itself wires together is proven by a break round.

## The gate

```sh
bun run check
```

One command, and it is the whole gate. CI's gate job runs the same gate on Linux, macOS and Windows. A new check
is a row in `scripts/check.ts`, never a step in a workflow. When a local run fails or disagrees with CI,
[Troubleshooting](#troubleshooting) says why.

`bun run check:quick` is the same gate without its slow rows, and the push hook runs it. `bun run check:rows`
lists the rows and marks the slow ones. `bun run check <row>` runs one row, resolving the pinned binaries without
installing them.

CI and the push hook run the gate by its file, `bun --no-env-file scripts/check.ts`, so no `node_modules/.bin` sits
ahead of `PATH`. The `check`, `check:quick` and `check:rows` scripts pass `--no-env-file` too, and so does every
`bun test` and every Bun a row starts directly. Bun then loads no env file into them.

No row resolves a program from the machine's `PATH`. Bun is the process running the gate, and every other tool
resolves through `mise which` or runs as a JavaScript tool. The programs the gate expects on `PATH` are the
prerequisites [Setup](#setup) names. Each one starts from an absolute `PATH` entry outside the checkout alone, and
a program found there through a link back into the checkout is passed over. The gate never reads the working
directory for a program, and on Windows it tries `PATHEXT`'s extensions in their order. Every process the gate
starts gets that same narrowed `PATH`.

A row starts each JavaScript tool through `bun x --bun --no-install <tool>` under the Bun running the gate, which is
bunx. First it checks that `node_modules/.bin` holds the tool as a file, through every link. When it does not, the
row fails with "`<tool>` is not installed in this checkout: run bun install --frozen-lockfile, or bun install
--frozen-lockfile --ignore-scripts in a worktree (CONTRIBUTING.md#setup).", since bunx would run a copy from
elsewhere. The gate imports its own two packages, zod and Prettier, by their paths under `node_modules/`, so a
missing install fails the row that loads one. The gate does not check `node_modules/` against `bun.lock`: CI
installs frozen before its gate, and a stale install is yours to refresh ([Setup](#setup)).

The gate withholds `BUN_OPTIONS` and `SHELLCHECK_OPTS` from every process it starts, in every spelling. Bun reads
`BUN_OPTIONS` as arguments ahead of its own, where a test name pattern hides tests from a count, and
`SHELLCHECK_OPTS` reaches ShellCheck through actionlint. Every process gets `NO_COLOR=1` and no `FORCE_COLOR` or
`CLICOLOR_FORCE`, since Bun colors its test summary under `FORCE_COLOR` whatever `NO_COLOR` says. Every row that
reads a tool's output strips ANSI color and hyperlink codes before it matches, because a tool can color its output
on a CI runner alone. Every line the gate prints shows a control character or an invisible mark as its `\u`
escape, so a job id or path in a tool's output cannot rewrite the lines above it.

No row has a deadline. CI's gate job sets `timeout-minutes`, which bounds the whole gate there, and Ctrl-C ends a
local run. `gh auth token` alone keeps a five-second bound, because its answer only decides whether zizmor runs
online: Bun kills gh at five seconds, and the row runs zizmor offline. A process that exits while one it started
still holds its output fails its row ten seconds later, which says so ([Troubleshooting](#troubleshooting)).

Every tool that searches for its own config runs with that config named: ESLint with `--config eslint.config.ts`,
Prettier with `--config .prettierrc` and `--no-editorconfig`, taplo with `--config .taplo.toml`, zizmor with
`--config .github/zizmor.yml`, tsc with `--project`, and the commit hook's commitlint with
`--config commitlint.config.js`. Each named form was measured to stop the tool's other config names, so the gate
refuses none of those names. The `format` row also asks Prettier's API, inside the gate's own process, which
tracked files it formats, and that call resolves no config at all, so no `package.json` beside a file loads a
plugin into the gate. The gate holds no config's text: `CODEOWNERS` names the owner for every path, and the
default-branch ruleset requires a code owner's review, so a change to a config is read before it merges.

Every row that walks the tree says how many files it checked, and fails when that is none. The `typecheck` row
also fails on a tracked TypeScript file that no project reads. The `format`, `toml` and `workflows` rows hand their
tool the tracked files, so a new file counts once `git add` names it, and `.gitignore` never hides a tracked one.
The `format` row also refuses a Prettier ignore comment in any file it checks, since Prettier leaves the code after
one unformatted and asks no reason. It matches the shape Prettier honors, a comment opener (`//`, `/*`, `#`,
`<!--`, `{{!` or `{{!--`) then spacing then the keyword, so a document can name the keyword in prose or in
backticks. The `toml` row checks that taplo reports each file it was handed, and the `workflows` row that
actionlint and zizmor each report every tracked workflow. The `workflows` row then runs zizmor again with no config
and inline ignores off, so it sees every job that passes `secrets: inherit`, waived or not. Each such job calls a
reusable workflow of `zachthedev/.github`, and a job calling anything else fails the row. Each file the
`secrets-inherit` waiver names must hold such a job, so a waiver left behind fails the row too.

actionlint runs ShellCheck through `scripts/shellcheck.ts`, which it hands each workflow script exactly as
ShellCheck reads it: YAML escapes and folding decoded, and every `${{ }}` expression blanked. The stand-in refuses
any line holding `#`, then `shellcheck` and a space, in any case and spacing, as a finding beside the step, and
otherwise runs the pinned ShellCheck over the same bytes. ShellCheck has no waiver file, so a script it flags is
rewritten. The stand-in prints ShellCheck's findings only once ShellCheck read the whole script and exited 0 or 1.
Any other ending leaves stdout empty, which actionlint reports as a failed run. Two canaries prove the wiring on
every run: one script whose SC2086 must come back from ShellCheck, and one whose `# shellcheck disable=SC2086` must
come back refused. actionlint runs ShellCheck for a `bash` or `sh` step alone, so the gate refuses a `shell:` value
outside `bash`, `sh` and `pwsh`, on a step or under `defaults.run`.

The `lint` row runs `eslint.config.ts`, the `scripts:test` row runs the gate's own tests, `bun test ./scripts/`,
and the `test` row runs every other test with coverage. They are the last three rows, since each runs repository
code that can write any file a row reads, and the checks before the first row run again after each. The two test
rows each say how many ran, and fail when none ran, when every one it counted was skipped, and when a name pattern
left any out. The count comes from bun test's own summary on stderr: the last `Ran` line and the counts directly
above it, which must add up to it. Both run with `CI=true`, so a `test.only` fails the row rather than running
alone and leaving its file's other tests out of the count.

Before any row, the gate refuses a config a tool reads that no flag can name, so a file beside the committed ones
never changes what a row reports. A config that changes what a row reports is refused on disk, tracked or not, so
the gate on your machine agrees with CI:

- a `.github/actionlint.yaml` or `.github/actionlint.yml`, which can silence any actionlint finding;
- a lefthook config beside `lefthook.yml` (`lefthook.*` or `.lefthook.*`), which lefthook reads when
  `lefthook.yml` is missing, and a tracked `lefthook-local`, `lefthook-local.*`, `.lefthook-local` or
  `.lefthook-local.*`, which lefthook merges over `lefthook.yml`. `.gitignore` lists the local ones for your own
  use;
- a `.config` directory at the root, which mise, lefthook and commitlint's cosmiconfig each read, and a root
  `package.yaml` or a `cosmiconfig` key in the root `package.json`. cosmiconfig reads its own settings from all
  three whatever `--config` names, and a `$import` there runs a module inside commitlint;
- a `node_modules` directory anywhere below the root, tracked or not. Bun, tsc and typescript-eslint resolve a bare
  import from the nearest one, so it replaces the installed package for the files beside it;
- a `tsconfig.json` or `jsconfig.json` at a path `scripts/expected.ts` does not list, tracked or not, since
  typescript-eslint reads the nearest one for each file it lints;
- a missing `scripts/tsconfig.json`, and any other `tsconfig.json`, `jsconfig.json`, `package.json` or
  `node_modules` under `scripts/`, since Bun resolves the gate's imports through them;
- a tracked workflow whose path is not `.github/workflows/<name>.yml` exactly, since actionlint and zizmor read that
  spelling alone, a tracked workflow whose `shell:` is not `bash`, `sh` or `pwsh`, and one the gate cannot read as
  YAML.

It also refuses these, tracked alone:

- a tracked env file Bun loads (`.env`, `.env.local`, and the `development`, `production` and `test` pairs), at
  any depth, since Bun loads one into every start beside it. A template such as `.env.example` passes, and so does
  your own untracked env file;
- a key repeated within one object of a tracked `package.json`, `tsconfig.json` or `jsconfig.json`, or of a file
  its `extends` names. Bun reads the first copy where the shared `commits` job reads the last, so a repeated
  `patchedDependencies` or `paths` could pass that job while Bun applies it. A file that does not parse as plain
  JSON is refused too;
- a `patchedDependencies` key in a tracked `package.json`, since `bun install` applies each patch it names over the
  package `bun.lock` pins. The shared `commits` job refuses one too, but its check passes a file jq cannot parse,
  such as one nested deeper than jq reads;
- a `zizmor: ignore[...]` comment in a tracked file under `.github`. A waiver is an entry in `.github/zizmor.yml`.
  The shared `workflows` job refuses one too, but its search passes over a file `.gitattributes` marks `-diff`.

Each name is compared with its case folded, broader than any filesystem's comparison, so a spelling that a
case-insensitive filesystem opens as a refused name is refused too. The first check names the work tree through
`git rev-parse --show-toplevel` and refuses one other than this checkout: git passes over a `.git` it cannot read,
an empty directory among them, and lists a parent repository's files without a word. Every git the gate starts runs
with no system or global config and nothing inherited from your environment.

The shared `commits` and `workflows` jobs refuse, before a merge, the files that run code or waive a check before
any gate row reads them. A pull request cannot edit those jobs at the pin `ci.yml` calls, so the gate does not
repeat them. Code-owner review of `.github/workflows/` is the control on a change to that pin, and on a change to
the job that runs the gate. The shared jobs refuse:

- a tracked `node_modules`, or a tracked path under one;
- a tracked `.npmrc` at any depth, since `bun install` fetches from a registry one names;
- a `bunfig.toml` holding any key but `[install] minimumReleaseAge`;
- `paths` or `baseUrl` in a tracked `tsconfig.json` or `jsconfig.json` or in a file its `extends` chain reads;
- a root file named like a program the gate, its hooks or an install start (`bun`, `bunx`, `gh`, `git`, `mise` or
  `node`), and a root entry named `'`, which actionlint would read in place of the ShellCheck stand-in.

Review refuses what no row checks, since each such file sits in the diff and runs no code: anything under `dist/`,
`coverage/`, `.claude/worktrees/` or a `.git`, `.sl`, `.svn`, `.hg` or `.jj` directory, a JavaScript or declaration
file beyond `commitlint.config.js`, a path below a personal file's name, and a tracked
`.claude/settings.local.json`.

The `tools` row reads `mise.toml` and `mise.lock` against the expectations in `scripts/tools.ts`, and installs
from the lockfile only after that read passes. `mise.toml` holds `[tools]`, `[tool_config]` and `[settings]`
alone, and the last two equal the values in `scripts/tools.ts` exactly, because mise runs a `[hooks]`, `[env]` or
`[vars]` table on install. Every key of `mise.lock` is one `scripts/tools.ts` names. The row refuses every other
file mise reads as config or a lockfile in the root, such as `mise.local.toml`, `.tool-versions` or `.miserc.toml`,
because mise merges each one, and a lockfile beside it, over `mise.lock`. It refuses a link at the root or under
`.config`, `.mise` or `mise`. Every mise command the gate starts carries an environment built from a short list:
the temporary directory, the Unix home, a proxy, the Windows folders the system reports, and the gate's own mise
settings. No other variable reaches mise, so a personal mise setting never changes the gate. `mise.lock` pins
`linux-x64`, `macos-arm64` and `windows-x64`, and a contributor on another platform relocks in a pull request.

In `bun run check`, the `workflows` row runs zizmor online when `gh auth token` answers within five seconds,
because some of its audits read the pinned actions' repositories. gh answers from `GH_TOKEN`, `GITHUB_TOKEN` or its
own login, and those two names reach gh alone. The answer reaches zizmor's process alone. With no answer the row
passes `--offline`. The row's line says which mode ran. `bun run check:quick` runs zizmor offline, so the push hook
needs no network and no token, and `ZIZMOR_OFFLINE=true` forces offline for the full gate. CI's gate job names no
token, so the row runs offline there, and zizmor's online audits run in the `workflows` job below.

A few checks run only in CI, each because it needs something a working machine does not have. The `commits` job
lints a pull request's commit range and title, which do not exist before the pull request does. The `workflows`
job runs actionlint and zizmor online from the shared workflow, whatever the contributor's machine holds. The
`dependency-review` job compares the pull request's dependencies against its base through GitHub's dependency
graph ([Dependencies](#dependencies)). `codeql` is GitHub's analysis and runs on GitHub. Its `Analyze` checks are
required. A code-scanning rule refuses a merge while an analysis is missing or still running, and when the pull
request adds a high or critical security alert or an error-level alert.

No row asserts the repository's alignment with the handbook. A reviewer holds that.

## Commit messages

Every commit follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). commitlint checks
the message in the commit hook and again in CI, over the pull request's commits and its title.

```text
type(scope): subject

body
```

The type is one of those `@commitlint/config-conventional` accepts, and it names the change's effect on the people
who use what this repository ships. A change they feel takes a type the changelog shows, and a change only this
repository's contributors feel is `chore` or `ci`, which it hides. `changelog-sections` in
`release-please-config.json` is the list ([Releases](#releases)).

<!-- TODO(kickstart): replace the paragraph below with who uses what your repository ships and which changes reach
them, from the handbook's Commits section. -->

This repository is a template, so its users are the repositories created from it or aligned to it. A change to a
file a clone copies is `feat` or `fix`, with that file's scope, workflows and gate files included. Documents follow
the same rule: a change to one a clone copies, such as `CONTRIBUTING.md` or `SECURITY.md`, is `feat` or `fix`, and
a document no clone copies stays `docs`. A pin bump stays `chore`, because each clone's own Renovate moves its
pins.

The scope is optional. `.github/commit-scopes.json` lists each scope and what it covers, and commitlint accepts
no other. Omit the scope rather than invent one. A scope never repeats the type: `docs(docs)`, `ci(ci)` and
`test(tests)` take the bare type, `docs:`, `ci:` and `test:`. A new part of the repository earns a scope in that
file, in the change that adds the part.

The header and every body line stay within 72 characters, and the header limit applies to what lands on `main`. A
pull request merges by squash, the one method the repository allows. A one-commit pull request lands its commit's
subject and body, and a longer one lands its title and each commit as a bullet. Either subject lands with ` (#N)`
appended, and CI's commits job lints the title, or a one-commit pull request's subject, with that suffix on. So a
title or subject holds 67 characters while pull request numbers have one digit, and 64 once they have four. A
Dependabot pull request, in a repository that runs Dependabot, whose landed header runs past 72 characters fails
that lint: it is closed, and the bump is taken by hand. A body paragraph never opens with a bare type, because
release-please reads it as a second change.

A pull request's title takes the type of its most user-facing commit, and `!` when any commit breaks something
users see. A squash of several commits lands the title alone, so a type or a break the title leaves out is lost,
and a lost `!` loses the version bump the break cuts. A squash whose title hid a user-facing change is corrected
before the release pull request merges, with an override in the merged pull request's description that
release-please reads in place of the landed message:

```text
BEGIN_COMMIT_OVERRIDE
feat(scope): the subject that should have landed (#NNN)
END_COMMIT_OVERRIDE
```

A revert says in fresh words what it undoes, and a `Refs:` footer names each reverted commit:

```text
revert(scope): what is undone

Refs: <sha>
```

A reverted header repeated after `revert: ` can pass the 72-character limit. commitlint skips git's `Revert "..."`
subject, and release-please cannot parse it.

A body carries what the diff cannot show: what was wrong, what the change does now, and what was left undone. A
break users see carries `!` after the type or scope and explains the break in the body. A break only contributors
see carries neither `!` nor a `BREAKING CHANGE:` footer, because either cuts a release.

Every version heading in `CHANGELOG.md` links GitHub's compare view from the previous tag, which lists every
change in the release, hidden types included. The same list locally:

```sh
git log --oneline v0.1.0..v0.2.0
```

A first release has no previous tag, and `git log --oneline v0.1.0` lists it.

## Dependencies

Every dependency is pinned to an exact version and moved by Renovate under a three-day cooldown, from the presets
`.github/renovate.json` extends. Renovate is the only bot that opens pull requests. The cooldown is also in
`bunfig.toml`, because Renovate's lock file maintenance runs `bun install` in a container with no other
configuration, and that file is the one cooldown the run observes.

`trustedDependencies` in `package.json` names the one dependency whose install script runs: lefthook, which
installs the hooks. Naming it replaces Bun's built-in allow list.

Two TypeScript compilers are installed on purpose. The `typecheck` row runs the native TypeScript 7 compiler from
the `@typescript/native` alias. `typescript` stays on 6.x for typescript-eslint, which reads types through the 6.x
compiler API and declares a peer range below 6.1.0. A rule in `.github/renovate.json` holds it below 6.1.0. Both
ship a `tsc`, and `bun install` links the name to the package whose name sorts first, the alias. Once
typescript-eslint supports TypeScript 7, `typescript` moves to 7.x, and the alias and the rule go.

The advisory legs:

- The `dependency-review` check blocks a pull request on what it adds against its base, and a release pull
  request on what the release adds against the last tag, at high severity. It sees the direct packages
  `package.json` names and the actions the workflows pin, and nothing under `bun.lock`.
- The `audit` workflow runs `bun run audit` over the whole of `bun.lock`, transitives included, once a day as a
  report. It never blocks a merge. A red run is work to pick up.
- Dependabot alerts stay on and its security updates stay off. Renovate opens the fix for a direct dependency. A
  transitive advisory is fixed by hand from the alert with `bun audit fix`, because no bot fixes one.

The `audit` script in `package.json` is the one home of the audit's level and its waivers. It runs `bun audit` at
`--audit-level=high`. A waived advisory is an `--ignore <id>` on that script, and this section names each one with
its reason and the condition that removes it. None is waived.

A hand pin ahead of the cooldown records its audit in the commit body: the release notes read, the maintainer
checked, the diff against the previous version. A waived advisory in the pull request check is an `allow-ghsas`
entry on `ci.yml`'s `dependency-review` job, with a comment naming the advisory, what it blocks, why shipping is
safer and the condition that removes it. A red advisory check blocks the merge like every required check
([What never happens](#what-never-happens)).

### Tool integrity

Each tool the gate runs, and how its bytes are held to their source. The tiers are provenance, a checksum in a
pinned tree, a checksum recorded by a third party, and a version alone.

- actionlint and zizmor: provenance. `mise.lock` records `github-attestations`, mise verifies the attestation on
  every install, and the gate refuses a lockfile that drops the line.
- ShellCheck and taplo: a checksum in a pinned tree, `mise.lock`. taplo's checksums were computed once from its
  release artifacts, as `mise.toml` records.
- TypeScript, ESLint, typescript-eslint, the ESLint comments plugin, Prettier, commitlint, `yaml`, lefthook and
  zod: a checksum in a pinned tree, `bun.lock`.
- Bun itself: a version alone. `packageManager` plus the cooldown is the control, because the setup action
  verifies no download.
- mise itself: a publisher signature, which `jdx/mise-action` checks against the release's signed checksums.

`MISE_BACKENDS_<TOOL>` overrides a tool's backend from the environment, and no setting reports it
([Safety](#safety)).

## Releases

release-please opens one release pull request from the commits on `main` and keeps it current. Merging it tags
the merge commit `v<version>` and creates a draft release. The `publish` job in `cd.yml` then waits for the
`release` environment's reviewer and flips the draft public. A draft nobody approves ships nothing, and a failed
release is recovered by cutting the next version.

The types that appear in the changelog are the keys under `changelog-sections` in `release-please-config.json`,
which is the one place that list lives. A visible type cuts a release on its own. release-please owns
`CHANGELOG.md`, the version in `package.json` and `.release-please-manifest.json`.

`initial-version` in the same file sets the first release. `bump-minor-pre-major` makes a breaking change a minor
bump below `1.0.0`, so the changelog carries the break.

## Troubleshooting

A local run that fails or disagrees with CI:

- A row that says a tool "is not installed in this checkout", or a hook that cannot find its tool, means a missing
  install. Run `bun install --frozen-lockfile`, or add `--ignore-scripts` in a worktree ([Setup](#setup)).
- A stale install runs another version. When `node_modules/.bin` holds a tool at the wrong version, the gate's
  check passes and bunx runs that copy. When the checkout holds none, a hook's bunx runs a copy from a parent
  directory, `PATH` or its own cache. Run `bun install --frozen-lockfile` after every pull, every branch switch and
  in each worktree ([Setup](#setup)).
- `bun install --frozen-lockfile` does not remove a package `bun.lock` no longer names, so a stale `node_modules/`
  can pass an import CI refuses. After a pull that drops a dependency, delete `node_modules/` and install again.
- A personal env file reaches every JavaScript tool bunx starts, the hooks, the `format` script and the gate's
  rows alike, since bunx ignores `--no-env-file`. A value there, such as `PRETTIER_EXPERIMENTAL_CLI`, can turn a
  row red locally alone. Move the file aside and run again ([Safety](#safety)).
- A gate that differs from CI can come from your environment. `BUN_OPTIONS` reaches the gate's own process
  before its first line, and `BUN_INSPECT`, `BUN_INSPECT_CONNECT_TO` and `BUN_INSPECT_PRELOAD` reach its `bun test`
  rows too. Leave all four unset ([Safety](#safety)).
- A local gate can pass where CI's `commits` or `workflows` job fails, since those jobs refuse files the gate
  does not repeat ([The gate](#the-gate)).
- A `workflows` row that differs from CI can come from zizmor's online audits. They run on your machine when gh
  answers with a token and never in CI's gate job. `ZIZMOR_OFFLINE=1` runs what CI runs.
- In a checkout another account owns, git refuses the repository as dubious ownership, and the gate stops. Make
  your account the directory's owner. The gate starts git with no system or global config, so it reads no
  `safe.directory` entry, by design.
- A row that fails because a process its tool started still holds the tool's output leaves that process running,
  since nothing the gate can reach ends a process whose parent is gone. Find it and end it.

## What never happens

- Nobody hand-edits `CHANGELOG.md`, the version in `package.json` or `.release-please-manifest.json`.
  release-please writes all three from the commits, and a hand edit is overwritten or, worse, shifts the next
  version it computes. The one exception is the reset the template marker in `.github/workflows/cd.yml` orders,
  made once, before a repository created from this template releases for the first time.
- No `mise.lock` line is written outside `mise lock`, except a checksum computed as `mise.toml` says. The lockfile
  is what an install fetches and compares, and the gate holds it to the expectations in `scripts/tools.ts`. A
  hand-written line is a line nothing verified.
- Nothing merges past a red gate. The required checks and the code-scanning rule sit in a ruleset with no bypass
  actor.
- No version number goes into prose. A version lives in the file that pins it, so a bump is one edit and no
  document goes stale.
- No workflow lists a check as a step. CI calls the gate, so a contributor runs every check CI runs, and a
  check that cannot run locally sits in `ci.yml` with a comment saying why.
