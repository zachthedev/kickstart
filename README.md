# kickstart

<!-- TODO(kickstart): rewrite this file for your project. Keep what a reader needs: what it is, how to get it in
one line, the documentation table, the gate command and the license. -->

The Bun template every `zachthedev` TypeScript or Bun repository starts from, and the base every other kickstart
duplicates. It ships the tooling alone: the gate, the hooks, the workflows, a placeholder module with its tests,
and every boilerplate file the [handbook](https://github.com/zachthedev/.github/blob/main/HANDBOOK.md) names for a
`bun-tooling` repository. A new repository is created from it as a GitHub template. An existing one is aligned by
matching it.

The handbook's Files table says which files are copied verbatim and which have slots.

## Using it

1. Create the repository from this template with GitHub's "Use this template" button.
2. Work through every template marker. `MARKERS.md` lists them, and [Template markers](#template-markers) says
   how.
3. Install and run the gate. [docs/dev.md](docs/dev.md) names what the machine needs and the first-run commands.
4. Trim what the repository does not need and add what it does ([below](#trim-and-extend)). Record each deviation
   from the handbook at its drift site: a comment beside the deviating line, in the file where the change is made.

## The gate

```sh
bun run check
```

CI runs the same gate, by its file, on Linux, macOS and Windows. `bun run check:rows` lists its rows.
[CONTRIBUTING.md#the-gate](CONTRIBUTING.md#the-gate) says what each needs and what runs in CI alone.

## Documentation

| Document                           | Holds                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, the gate, commit messages, where code goes, tests, code, dependencies, releases, what never happens. |
| [docs/dev.md](docs/dev.md)         | Prerequisites, the first run, running it, generated files, tests that need a real thing.                    |
| [SECURITY.md](SECURITY.md)         | What counts as a vulnerability here, and how to report one privately.                                       |
| [AGENTS.md](AGENTS.md)             | What an agent reads first, runs to verify, and never does in a session. `CLAUDE.md` imports it.             |
| [MARKERS.md](MARKERS.md)           | Generated: every file carrying a template marker, and the command that proves the template is absorbed.     |

## Template markers

Every place a clone must act carries a `TODO` comment in the `(kickstart)` scope.
`git grep -nE 'TODO[(]kickstart[)]:' -- ':(top)' ':(top,exclude)MARKERS.md'` finds each one and nothing else, from any
directory in the tree.

`MARKERS.md` is the generated inventory: every file carrying a marker and how many, plus the command that proves
the template is absorbed. `bun run markers` rewrites it, and the gate's `markers` row fails when the committed copy
is stale. Act on each directive, delete its comment, regenerate, and stop when the inventory's command exits 0.

The machinery comes out once the template is absorbed, in one commit, as the last step: `MARKERS.md`,
`scripts/markers.ts`, the `markers` row in `scripts/check.ts`, the `markers` script in `package.json`, this
section, and the `MARKERS.md` row in the table above.

## Trim and extend

The template ships the `bun-tooling` shape: a repository that ships nothing but a release. A repository takes what
it needs from it.

### A service

A `bun-service` repository, such as a Cloudflare Worker, starts here and takes its Worker from the Cloudflare CLI:

1. Run `bun create cloudflare` in a scratch directory outside the clone.
2. Merge the generated Worker boilerplate into the clone.
3. Add the deploy job to `cd.yml`, chained on `publish`, and write `docs/deploy.md` and `docs/usage.md`, as the
   handbook says for a `bun-service` repository.

### The placeholder

`src/` holds a placeholder module and command, each with its test under `tests/`. Replace them with the
repository's own code. A repository that ships no command deletes `src/cli.ts` and its test.

### Everything else

The gate's rows, the hooks, the workflows, the release flow and the lockfile assertions are handbook rows. Keep
them. An ESLint rule that is wrong for the code is turned off in `eslint.config.ts` with its reason beside it.

## License

<!-- TODO(kickstart): set the year in LICENSE to the year GitHub created your repository, and name your license
here if it is not MIT. -->

[MIT](LICENSE).
