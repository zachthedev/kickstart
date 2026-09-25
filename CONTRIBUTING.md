# Contributing

## Setup

Install before committing. [docs/dev.md#prerequisites](docs/dev.md#prerequisites) names what the machine needs
and [docs/dev.md#first-run](docs/dev.md#first-run) the commands, which install the dependencies and the git hooks.
The commit hooks lint and format the staged files and check every commit message before it is recorded. The push
hook runs the quick gate and refuses the push when it fails. Each hook starts its tool as
`bun --no-env-file ./node_modules/<package>/<bin>`, under Bun and never under a `node` found on `PATH`, and the
`format` and `prepare` scripts start theirs by path too. A package missing from the checkout's own `node_modules/`
fails the hook with "Module not found", and no copy from `PATH`, a parent directory or bunx's cache runs in its
place. So a worktree refuses every commit until `bun install` runs there, and a Claude Code worktree starts with
no `node_modules/`. A checkout whose `node_modules/` is gone runs no hook at all: lefthook prints that it cannot
find itself and the commit goes through. CI's `commits` job and gate hold that case.

`.claude/settings.json` allows `git status` alone, the allowlist every `zachthedev` repository shares, with deny
entries for `--output` and `--no-index`, and adds nothing to it.

## The gate

```sh
bun run check
```

One command, and it is the whole gate. CI's gate job runs the same gate on Linux, macOS and Windows, so a green
run on your machine is a green run there. A new check is a row in `scripts/check.ts`, never a step in a workflow.

CI and the push hook run the gate by its file, `bun --no-env-file scripts/check.ts`, so no `node_modules/.bin`
sits ahead of `PATH` before the gate refuses a tracked `node_modules` path. `bun run check` puts it there first, so
on a pull request branch that commits `node_modules/.bin/bun`, that `bun` runs before the gate does. Bun also runs
a `bunfig.toml` preload before the gate's first line, whichever way the gate starts, CI's direct call included. It
runs one before each commit hook's tool and in the `format` and `prepare` scripts too, since each runs under Bun.
The gate's refusals keep such a branch from merging, and nothing in the gate can stop its first run on your
machine.

Every start of the gate passes `--no-env-file`: CI's, the push hook's, and the `check`, `check:quick` and
`check:rows` scripts. So do the commit hooks and every Bun a row starts. Bun then loads no env file into any of
them, tracked or untracked, in any mode. `bun src/cli.ts` and any other start without the flag still loads one,
which is why a tracked env file is refused. A `BUN_OPTIONS` in your environment holding `--env-file` or a
preload undoes the flag, and `BUN_INSPECT_PRELOAD` runs a module in every Bun start. On Windows Bun reads each in
any spelling. So every hook first unsets `BUN_OPTIONS`, `BUN_INSPECT`, `BUN_INSPECT_CONNECT_TO` and
`BUN_INSPECT_PRELOAD` in every spelling, then starts its Bun, and the gate withholds the four from every process
it starts. No package.json script can do the same: the `bun run` in front of `check` reads them before the script
starts, and Bun's script shell on Windows has no `env` and hands `prepare` the shell's values whatever the script
assigns. Keep them unset while you run the scripts.
`eslint.config.ts` and `commitlint.config.js` are code too: the `lint` row and the commit hook run them. The gate
holds no config's text: `CODEOWNERS` names the owner for every path, and the default-branch ruleset requires a code
owner's review, so a change to a config is read before it merges. Read a branch's diff before running anything
from it. Install a branch you have not read with
`bun install --frozen-lockfile --ignore-scripts`, which runs no package's install script.

`bun run check:quick` is the same gate without its slow rows, and the push hook runs it. `bun run check:rows`
lists the rows and marks the slow ones. `bun run check <row>` runs one row, resolving the pinned binaries without
installing them.

No row resolves a program from the machine's `PATH`. Every package runs from its absolute path under
`node_modules/`, every other tool resolves through `mise which`, and Bun is the process running the gate. The
programs the gate expects on `PATH` are the prerequisites [docs/dev.md#prerequisites](docs/dev.md#prerequisites)
names. Each one starts from an absolute `PATH` entry outside the checkout alone, and a program found there
through a link back into the checkout is passed over. The gate never reads the working directory for a program,
and on Windows it tries `PATHEXT`'s extensions in their order. Every process the gate starts gets that same
narrowed `PATH`, so a program it starts by name never resolves inside the checkout. The gate clears
`SHELLCHECK_OPTS` for every process it starts, since it reaches ShellCheck through actionlint. It withholds
`BUN_OPTIONS`, `BUN_INSPECT`, `BUN_INSPECT_PRELOAD` and `BUN_INSPECT_CONNECT_TO` in every spelling too. Every Bun
reads the first as arguments ahead of its own and runs the preload the third names, so no test name pattern or
preload reaches a row. Every process gets `NO_COLOR=1` and no `FORCE_COLOR` or `CLICOLOR_FORCE`, since Bun colors its test summary
under `FORCE_COLOR` whatever `NO_COLOR` says. Every row that reads a tool's output strips ANSI color and hyperlink
codes before it matches, because a tool can color its output on a CI runner alone. Every line the gate prints
shows a control character or an invisible mark as its `\u` escape, so a job id or path in a tool's output cannot
rewrite the lines above it.

Every package the gate imports or a row runs resolves from the checkout's own `node_modules/`. Before any row, the
gate refuses a package that `node_modules/` lacks or links out of the checkout: every package `bun install` puts
there for this platform, at the path `bun.lock` names. The check walks from the names `package.json` lists through
every dependency `bun.lock` records, and passes over an entry whose `os` or `cpu` leaves this platform out, with
everything reached through it alone, as Bun does. Bun would otherwise load a copy from a parent directory's
`node_modules/`, or install one when there is none at all. That covers the typecheck row's native compiler, a
platform package no manifest names.

No row has a deadline. CI's gate job sets `timeout-minutes`, which bounds the whole gate there, and Ctrl-C ends a
local run. `gh auth token` alone keeps a five-second bound, because its answer only decides whether zizmor runs
online: Bun kills gh at five seconds, and the row runs zizmor offline. A process that exits while one it started
still holds its output fails its row ten seconds later, which says so. That process runs on, since nothing the
gate can reach ends a process whose parent is gone, so end it yourself.

Every tool that searches for its own config runs with that config named: ESLint with `--config eslint.config.ts`,
Prettier with `--config .prettierrc` and `--no-editorconfig`, taplo with `--config .taplo.toml`, zizmor with
`--config .github/zizmor.yml`, tsc with `--project`, and the commit hook's commitlint with
`--config commitlint.config.js`. The `format` row also asks Prettier's API, inside the gate's own process, which
tracked files it formats, and that call resolves no config at all, so no `package.json` beside a file, tracked or
not, loads a plugin into the gate. Prettier imports and runs each plugin `.prettierrc` names, a package or a local
path, at the top or in an override, and a shared config module the file names as a string. So the preflight
refuses a `.prettierrc` that is not a JSON object, or that carries `plugins` at any depth. Prettier reads the file
as YAML, so the gate holds it to plain JSON, which both read alike. The other configs a row reads name no code
the row runs: a `plugins` entry in a `tsconfig.json` loads nothing under tsc or Bun, nor under typescript-eslint's
project service while `eslint.config.ts` leaves its `loadTypeScriptPlugins` off. taplo's config names no program,
and zizmor refuses a key it does not know.

Every row that walks the tree says how many files it checked, and fails when that is none. The `typecheck` row
also fails on a tracked TypeScript file that no project reads. Read is not checked: tsc reads a declaration file
without checking it, so the preflight refuses one `scripts/expected.ts` does not name. The `format`, `toml`
and `workflows` rows hand their tool the tracked files, so a new file counts once `git add` names it, and
`.gitignore` never hides a tracked one. The `format` row also refuses a Prettier ignore comment in any file it
checks, since Prettier leaves the code after one unformatted and asks no reason. It matches the shape Prettier
honors, a comment opener (`//`, `/*`, `#`, `<!--`, `{{!` or `{{!--`) then spacing then the keyword, so a
document can name the keyword in prose or in backticks. The `toml` row checks that taplo
reports each file it was handed, and the `workflows` row that actionlint and zizmor each report every tracked
workflow. The `workflows` row then runs zizmor again with no config and inline ignores off, so it sees every job
that passes `secrets: inherit`, waived or not. Each such job calls a reusable workflow of `zachthedev/.github`,
and a job calling anything else fails the row. Each file the `secrets-inherit` waiver names must hold such a job,
so a waiver left behind fails the row too.

actionlint runs ShellCheck through `scripts/shellcheck.ts`, which it hands each workflow script exactly as
ShellCheck reads it: YAML escapes and folding decoded, and every `${{ }}` expression blanked. The stand-in refuses
any line holding `#`, then `shellcheck` and a space, in any case and spacing, as a finding beside the step, and
otherwise runs the pinned ShellCheck over the same bytes. ShellCheck has no waiver file, so a script it flags is
rewritten. The stand-in writes the script to ShellCheck on its own task, and it prints ShellCheck's findings only
once ShellCheck read the whole script and exited 0 or 1. Any other ending leaves stdout empty, which actionlint
reports as a failed run, since it reads `[]` beside a failed exit as a clean one. Two canaries prove the wiring
on every run: one script whose SC2086 must come back from ShellCheck, and one whose
`# shellcheck disable=SC2086` must come back refused. A root entry named `'` is refused: actionlint looks the
stand-in's whole quoted command line up as one path before it splits the words, and on Linux and macOS that path
starts in a directory by that name. actionlint runs ShellCheck for a `bash` or `sh`
step alone, so the preflight refuses a `shell:` value outside `bash`, `sh` and `pwsh`, on a step or under
`defaults.run`.

The `lint` row runs `eslint.config.ts`, the `scripts:test` row runs the gate's own tests, `bun test ./scripts/`,
and the `test` row runs every other test with coverage. They are the last three rows, since each runs repository
code that can write any file a row reads, and the checks before the first row run again after each. The two test
rows each say how many ran, and fail when none ran, when
every one it counted was skipped, and when a name pattern left any out. The count comes from bun test's own
summary on stderr: the last `Ran` line and the counts directly above it, which must add up to it. A test prints
to stdout, and any line it prints to stderr comes before that block. Both run with `CI=true`, so a `test.only`
fails the row, as it does in CI, rather than running alone and leaving its file's other tests out of the count.
Each case under `scripts/` starts a stand-in in
place of every program the gate starts, and its `PATH` holds the stand-ins alone. So no case starts your gh, git
or mise or reaches the network. The suite covers `scripts/rows.ts`, which holds what the rows conclude from their
tools' output. What `scripts/check.ts` itself wires together is proven by a break round.

Before any row, the gate refuses to run beside what Bun reads before the gate's first line:

- a tracked env file Bun loads (`.env`, `.env.local`, and the `development`, `production` and `test` pairs), at
  any depth;
- a tracked `.npmrc` at any depth, which names the registry `bun install` fetches from;
- a tracked `node_modules`, or a tracked path under one, at any depth;
- a `bunfig.toml` holding any key but `[install] minimumReleaseAge`, since Bun runs a `preload` it names, applies
  a `[define]` table, and installs from an `[install.cache] dir` it names;
- a missing `scripts/tsconfig.json`, and any other `tsconfig.json`, `jsconfig.json`, `package.json` or
  `node_modules` under `scripts/`, since Bun resolves the gate's imports through them;
- any other `tsconfig.json` or `jsconfig.json` at a path `scripts/expected.ts` does not list, and `paths` or
  `baseUrl` in any of them or in a file its `extends` chain reads. Bun applies both to every import below the
  config, `node_modules` code included, so either can send a package a commit hook's tool imports to repository
  code. A project aliases through `package.json` `imports` (`#` names) instead. `extends` names a file relative to
  the config, inside the checkout, and never a package;
- a `patchedDependencies` key in any tracked `package.json`, since `bun install` applies each patch it names over
  the package `bun.lock` pins, a frozen install included, and a `package.json` that does not parse;
- a package `bun install` puts under `node_modules/` for this platform, walking from the names `package.json` lists
  through `bun.lock`, that `node_modules/` lacks or links out of the checkout, and a `bun.lock` that does not parse;
- a `.prettierrc` that is not a JSON object, or that carries `plugins` at any depth, since Prettier runs each plugin
  and each shared config module it names in the `format` row;
- a key repeated within one object of any JSON file the gate reads, since Bun reads the first where a JSON parser
  reads the last.

It also refuses a config a tool reads that no flag can name, so a file beside the committed ones never changes
what a row reports. A tool the gate names a config for (ESLint, Prettier, commitlint, taplo and zizmor) reads that
one file alone, measured for each, so no other file of those names is refused. The committed configs themselves
change under code-owner review. A config that changes what a row reports is refused on disk, tracked or not, so the
gate on your machine agrees with CI:

- a tracked file under `.github` carrying a `zizmor: ignore[...]` comment. A waiver is an entry in
  `.github/zizmor.yml`. A `secrets-inherit` entry names a file, and the `workflows` row binds what each job there
  calls;
- a tracked workflow whose `shell:` value, on a step or under `defaults.run`, is not `bash`, `sh` or `pwsh`, and
  one the gate cannot read as YAML;
- a `.github/actionlint.yaml` or `.github/actionlint.yml`, which can silence any actionlint finding;
- a lefthook config beside `lefthook.yml` (`lefthook.*` or `.lefthook.*`), which lefthook reads when
  `lefthook.yml` is missing, and a tracked `lefthook-local`, `lefthook-local.*`, `.lefthook-local` or
  `.lefthook-local.*`, which lefthook merges over `lefthook.yml`. `.gitignore` lists the local ones for your own
  use, and so does `.prettierignore`, with exactly these names. A tracked path below a directory by one of these
  names is refused too, since `.prettierignore` skips it;
- a tracked `.claude/settings.local.json`, Claude Code's settings for one contributor, and a tracked path below
  a directory by that name;
- a `.config` directory at the root, which mise, lefthook and commitlint's cosmiconfig each read;
- a `node_modules` directory anywhere below the root, tracked or not. Bun, tsc and typescript-eslint resolve a bare
  import from the nearest one, so it replaces the installed package for the files beside it;
- a tracked workflow whose path is not `.github/workflows/<name>.yml` exactly, and a tracked path under a `.git`,
  `.sl`, `.svn`, `.hg` or `.jj` directory, since the workflows or format row would count it and never check it;
- a tracked path under the root `dist/`, `coverage/` or `.claude/worktrees/`, which the lint and format rows skip,
  while the product can still import a file there;
- a tracked JavaScript file (`.js`, `.jsx`, `.mjs`, `.cjs`) or declaration file (`.d.ts`, `.d.mts`, `.d.cts`) that
  `scripts/expected.ts` does not name. tsc checks neither kind, and ESLint lints no `.jsx`;
- a root file named like a program the gate, its hooks or an install start: `bun`, `bunx`, `gh`, `git`, `mise` or
  `node`, with any extension, beside `bun.lock` and the two mise files;
- a root file, directory or link named `'`, where actionlint would find a program in place of the ShellCheck
  stand-in.

Each name is compared with default-ignorable code points removed and its case folded, broader than any
filesystem's comparison, so a spelling that a case-insensitive filesystem opens as a refused name is refused too. A template such as `.env.example` passes, and
so does your own untracked env file, `.npmrc` or `lefthook-local.yml`. The gate loads nothing from `node_modules/`
until these checks pass, so a planted package never runs ahead of its refusal. The first check names the work tree
through `git rev-parse --show-toplevel` and refuses one other than this checkout: git passes over a `.git` it cannot
read, an empty directory among them, and lists a parent repository's files without a word.

The `tools` row reads `mise.toml` and `mise.lock` against the expectations in `scripts/tools.ts`, and installs
from the lockfile only after that read passes. `mise.toml` holds `[tools]`, `[tool_config]` and `[settings]`
alone, and the last two equal the values in `scripts/tools.ts` exactly, because mise runs a `[hooks]`, `[env]` or
`[vars]` table on install. Every key of `mise.lock` is one `scripts/tools.ts` names. The row refuses every other file
mise reads as config or a lockfile in the root, such as `mise.local.toml`, `.tool-versions` or `.miserc.toml`,
because mise merges each one, and a lockfile beside it, over `mise.lock`. It refuses a link at the root or under
`.config`, `.mise` or `mise`. Every mise command the gate starts carries an
environment built from a short list: the temporary directory, the Unix home, a proxy, the Windows folders the
system reports, and the gate's own mise settings. No other variable reaches mise, so a personal mise setting
never changes the gate. `mise.lock` pins `linux-x64`, `macos-arm64` and `windows-x64`, and a contributor on another
platform relocks in a pull request.

In `bun run check`, the `workflows` row runs zizmor online when `gh auth token` answers within five seconds,
because some of its audits read the pinned actions' repositories. gh answers from `GH_TOKEN`, `GITHUB_TOKEN` or its
own login, and those two names reach gh alone. The answer reaches zizmor's process alone. With no answer the row
passes `--offline`. The row's line says which mode ran. `bun run check:quick` runs zizmor offline, so the push hook needs no network
and no token, and `ZIZMOR_OFFLINE=true` forces offline for the full gate. CI's gate job names no token, so the row
runs offline there, and zizmor's online audits run in the `workflows` job below.

A few checks run only in CI, each because it needs something a working machine does not have. The `commits` job
lints a pull request's commit range and title, which do not exist before the pull request does. The `workflows`
job runs actionlint and zizmor online from the shared workflow, whatever the contributor's machine holds. The
`dependency-review` job compares the pull request's dependencies against its base through GitHub's dependency
graph ([Dependencies](#dependencies)). `codeql` is GitHub's analysis and runs on GitHub. Its `Analyze` checks are
required. A code-scanning rule refuses a merge while an analysis is missing or still running, and when the pull
request adds a high or critical security alert or an error-level alert
([What never happens](#what-never-happens)).

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
the same rule: a change to one a clone copies, such as `CONTRIBUTING.md`, `SECURITY.md` or `docs/dev.md`, is `feat`
or `fix`, and a document no clone copies stays `docs`. A pin bump stays `chore`, because each clone's own Renovate
moves its pins.

The scope is optional. `.github/commit-scopes.json` lists each scope and what it covers, and commitlint accepts
no other. Omit the scope rather than invent one. A new part of the repository earns a scope in that file, in the
change that adds the part.

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
and a lost `!` loses the version bump the break cuts. A squash whose title hid a user-facing change is corrected before the release pull request
merges, with an override in the merged pull request's description that release-please reads in place of the
landed message:

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

## Where code goes

<!-- TODO(kickstart): say where your project's code goes, by directory, and keep the lines below that still
apply. -->

- `src/`: the program. `example.ts` is the placeholder module and `cli.ts` the placeholder command.
- `tests/`: the `bun test` suite, one file per module under `src/`.
- `scripts/`: the gate. `check.ts` is the runner, `startup.ts` holds what Bun and the rows read before they run,
  `expected.ts` lists where this repository's project configs sit and the JavaScript files it tracks, `tools.ts`
  holds the mise expectations, `run.ts` starts every process, `rows.ts` holds what the rows conclude from their
  tools' output, `github.ts` reads gh's token, `shellcheck.ts` stands in for ShellCheck under actionlint, and
  `markers.ts` writes `MARKERS.md`. `run.ts`, `tools.ts`, `startup.ts`, `rows.ts`, `github.ts`, `shellcheck.ts`
  and `stand-ins.ts`, with the suites beside them, are the same in every repository of the set.
- `docs/`: the documents [README.md#documentation](README.md#documentation) indexes.

## Tests

<!-- TODO(kickstart): add the test conventions your project holds that no tool enforces. -->

- `bun test` is the runner. A test file sits under `tests/` and ends in `.test.ts`.
- A test states what the code is supposed to do, derived from the requirement, never copied from what the code
  printed.
- Table-driven cases through `test.each` are the default where several inputs share one assertion.
- A test touches no file outside a temporary directory and no network. Anything the code under test reaches in
  the operating system arrives as a parameter, in every case, whether or not the case reaches it today.
  `src/cli.ts` takes its two streams that way.

## Code

<!-- TODO(kickstart): add the code conventions your project holds that no tool enforces. -->

- Every function signature carries explicit parameter and return types.
- Validate at the boundary and trust the inside. Input from a user, a file or a network is checked where it
  arrives, with zod where it has a shape.
- A comment explains why the code is shaped as it is. What changed goes in the commit message.
- Every process a script starts goes through `scripts/run.ts`, so every one starts from `PATH` alone, with no
  shell.
- ESLint lints and Prettier formats. An ESLint rule that is wrong for this code is turned off in
  `eslint.config.ts` with its reason beside it.
- A waiver in code names exactly what it waives and says why, and a linter checks both. An ESLint directive names
  each rule and gives its reason after `--`, as in `// eslint-disable-next-line no-debugger -- reason`, and a
  disable is closed by its enable. `@ts-expect-error` carries a description of ten characters or more, and
  `@ts-ignore` and `@ts-nocheck` are refused. Nothing checks a reason on Prettier's ignore comment, so the `format`
  row refuses the comment itself.
- An import carries `with { type: 'json' }` or no attribute, and a dynamic import takes no options. ESLint refuses
  any other attribute, since Bun runs a file of any extension as code under one naming a loader, and no row reads
  a `.txt` as code.

## Dependencies

Every dependency is pinned to an exact version and moved by Renovate under a three-day cooldown, from the presets
`.github/renovate.json` extends. Renovate is the only bot that opens pull requests. The cooldown is also in
`bunfig.toml`, because Renovate's lock file maintenance runs `bun install` in a container with no other
configuration, and that file is the one cooldown the run observes.

`trustedDependencies` in `package.json` names the one dependency whose install script runs: lefthook, which
installs the hooks. Naming it replaces Bun's built-in allow list.

Two TypeScript compilers are installed on purpose. The `typecheck` row runs the native TypeScript 7 compiler from
the `@typescript/native` alias, called by its path because `typescript` ships a `tsc` too. `typescript` stays on
6.x for typescript-eslint, which reads types through the 6.x compiler API and declares a peer range below 6.1.0.
A rule in `.github/renovate.json` holds it below 6.1.0. Once typescript-eslint supports TypeScript 7, `typescript`
moves to 7.x, and the alias and the rule go.

The advisory legs:

- The `dependency-review` check blocks a pull request on what it adds against its base, and a release pull
  request on what the release adds against the last tag, at high severity. It sees the direct packages
  `package.json` names and the actions the workflows pin, and nothing under `bun.lock`.
- The `audit` workflow runs `bun audit` over the whole of `bun.lock`, transitives included, once a day as a
  report. It never blocks a merge. A red run is work to pick up.
- Dependabot alerts stay on and its security updates stay off. Renovate opens the fix for a direct dependency. A
  transitive advisory is fixed by hand from the alert with `bun audit fix`, because no bot fixes one.

A hand pin ahead of the cooldown records its audit in the commit body: the release notes read, the maintainer
checked, the diff against the previous version. A waived advisory is an `allow-ghsas` entry on `ci.yml`'s
`dependency-review` job, with a comment naming the advisory, what it blocks, why shipping is safer and the
condition that removes it. A red advisory check blocks the merge like every required check
([What never happens](#what-never-happens)).

### Tool integrity

Each tool the gate runs, and how its bytes are held to their source. The tiers are provenance, a checksum in a
pinned tree, a checksum recorded by a third party, and a version alone.

- actionlint and zizmor: provenance. `mise.lock` records `github-attestations`, mise verifies the attestation on
  every install, and the gate refuses a lockfile that drops the line.
- ShellCheck and taplo: a checksum in a pinned tree, `mise.lock`. taplo's checksums were computed once from its
  release artifacts, as `mise.toml` records.
- TypeScript, ESLint, typescript-eslint, the ESLint comments plugin, Prettier, commitlint, lefthook and zod: a
  checksum in a pinned tree, `bun.lock`.
- Bun itself: a version alone. `packageManager` plus the cooldown is the control, because the setup action
  verifies no download.
- mise itself: a publisher signature, which `jdx/mise-action` checks against the release's signed checksums.

`MISE_BACKENDS_<TOOL>` overrides a tool's backend from the environment, and no setting reports it. The gate does
not close that gap.

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

## What never happens

- Nobody hand-edits `CHANGELOG.md`, the version in `package.json` or `.release-please-manifest.json`.
  release-please writes all three from the commits, and a hand edit is overwritten or, worse, shifts the next
  version it computes. The one exception is the reset the template marker in `.github/workflows/cd.yml` orders,
  made once, before a repository created from this template releases for the first time.
- No `mise.lock` line is written outside `mise lock`, except a checksum computed as `mise.toml` says. The lockfile
  is what an install fetches and compares, and the gate holds it to the expectations in `scripts/tools.ts`. A
  hand-written line is a line nothing verified.
- Nothing merges past a red gate. The required checks and the code-scanning rule sit in the `default-branch checks`
  ruleset, which has no bypass actor, so a `--admin` merge waives the approval and nothing else. A check that
  cannot report, such as one stuck in a platform outage, is cleared by disabling that ruleset, merging, and
  enabling it again. Each of those is a settings change the audit log records, never a bypass.
- No version number goes into prose. A version lives in the file that pins it, so a bump is one edit and no
  document goes stale.
- No workflow lists a check as a step. CI calls the gate, so a contributor runs every check CI runs, and a
  check that cannot run locally sits in `ci.yml` with a comment saying why.
