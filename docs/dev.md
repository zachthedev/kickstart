# Developing

## Prerequisites

<!-- TODO(kickstart): add what your project needs beyond these, each naming the file that pins its version. -->

- [Bun](https://bun.sh), at the version `packageManager` in `package.json` names. Every package the gate runs
  arrives through `bun install` at the version `bun.lock` records.
- [mise](https://mise.jdx.dev). It installs the tools `mise.toml` pins at the versions `mise.lock` records.
- [git](https://git-scm.com). The gate's first check names the work tree through `git rev-parse` and lists tracked
  files through `git ls-files`, before any row, and the `markers` row reads the tree through `git grep` and
  `git diff`.
- [gh](https://cli.github.com), optional. When `gh auth token` succeeds, the gate runs zizmor online; otherwise
  zizmor runs offline and no token is needed.

These four are every program the gate starts from `PATH`: Bun runs the gate, and the gate starts git, mise and gh
by name. Every other program it runs is a package under `node_modules/` or a tool `mise which` names. No row has
a deadline, and Ctrl-C ends a local run. When a process exits while one it started still holds its output, the
row fails ten seconds later and that process runs on, since only a Windows job object reaches a process whose
parent is gone, and Bun offers none. End it yourself.

## First run

<!-- TODO(kickstart): add any step your project needs between a fresh clone and a green gate. -->

```sh
mise trust
bun install
bun run check
```

`mise trust` lets mise read this checkout's `mise.toml`. `bun install` installs the dependencies and the git hooks.
The first gate run installs the mise tools from the lockfile. A worktree runs its own `bun install` before its first
commit, since every hook starts its tool from the worktree's own `node_modules/`, and a Claude Code worktree starts
with none.

## Running it

<!-- TODO(kickstart): say how your program runs, or write "None." when the repository ships no program. -->

```sh
bun src/cli.ts Ada
```

That runs the placeholder command from source. Bun runs TypeScript as it is, so nothing is built first.

## Generated files

<!-- TODO(kickstart): list your project's generated files, each with the command that regenerates it. -->

- `MARKERS.md`: `bun run markers`, from the template markers in the tree. The `markers` row regenerates it and
  fails when the tree differs. It goes when the template is absorbed
  ([README.md#template-markers](../README.md#template-markers)).
- `mise.lock`: `mise lock`, after any edit to `mise.toml`. The taplo checksum lines are the exception `mise.toml`
  records.
- `bun.lock`: `bun install`.

## Tests that need a real thing

<!-- TODO(kickstart): name the tests that need a real server, machine or network, and how to run them. -->

None. Every test under `tests/` runs inside the `bun test` process, with the streams it writes to passed in. The
gate's own tests under `scripts/` start a stand-in, itself a Bun process, in place of every program the gate starts.
