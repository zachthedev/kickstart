// TODO(kickstart): replace this placeholder command with your own entry, and tests/cli.test.ts with its tests. A repository that ships no command deletes both.

import { greeting } from './example';

/** Somewhere the command writes text: the process's streams, or a test's buffer. */
export interface Writer {
  write(text: string): unknown;
}

/**
 * Runs the command over its arguments and returns the exit status.
 *
 * @remarks
 * The streams arrive as parameters, so a test drives the command without
 * starting a process or touching the real ones.
 *
 * @param args - The arguments after the program name
 * @param stdout - Where the greeting goes
 * @param stderr - Where the usage line goes when the arguments are wrong
 * @returns 0 on success, 2 when more than one name is given
 */
export function main(args: readonly string[], stdout: Writer, stderr: Writer): number {
  if (args.length > 1) {
    stderr.write('usage: bun src/cli.ts [name]\n');
    return 2;
  }
  stdout.write(`${greeting(args[0] ?? '')}\n`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), process.stdout, process.stderr);
}
