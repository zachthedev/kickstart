# kickstart, a `bun-tooling` template repository

<!-- TODO(kickstart): name your repository and its handbook kind on the line above. -->

[README.md](README.md) says what it is.

## Read first

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/dev.md](docs/dev.md) before changing anything. They bind an
agent as they bind a person.

## Verify

<!-- TODO(kickstart): keep these four lines as they are unless the clone renames a script. -->

- `bun run check` is the gate.
- `bun run check:quick` is the gate without its slow rows, which is what the push hook runs.
- `bun run check:rows` lists the rows.
- `bun run check <row>` runs one row.

[CONTRIBUTING.md#the-gate](CONTRIBUTING.md#the-gate) says what the rows cover.

## Never

<!-- TODO(kickstart): add the rules about what an agent runs, reads or changes in a session in your repository,
each with its reason. Keep the ones below that still apply. -->

- Never run `bun add` or `bun install` with `--minimum-release-age` below the value in `bunfig.toml`, and never
  pass `--ignore-scripts` to work around a blocked install script. The cooldown is the window in which a
  malicious release is pulled, and a version installed under a lowered one lands in `bun.lock` for every later
  install, where no cooldown reads it again.
- Never delete the marker machinery while the command in `MARKERS.md` exits non-zero. A directive still in the
  tree is work a person has not done yet, and the inventory is the one list of it.
- Never hand-edit `CHANGELOG.md`, the version in `package.json` or `.release-please-manifest.json`, except the
  one template reset ([why and the exception](CONTRIBUTING.md#what-never-happens)).
- Never write a `mise.lock` line outside `mise lock`, except a checksum computed as `mise.toml` says
  ([why](CONTRIBUTING.md#what-never-happens)).
- Never merge past a red gate ([why](CONTRIBUTING.md#what-never-happens)).
- Never put a version number in prose ([why](CONTRIBUTING.md#what-never-happens)).
- Never add a check as a workflow step ([why](CONTRIBUTING.md#what-never-happens)).

## Deviations

A comment beside a line that names the handbook records a deliberate deviation. It is a decision, not a defect.

## Where the rest is

[README.md#documentation](README.md#documentation)
