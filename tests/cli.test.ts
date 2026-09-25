import { expect, test } from 'bun:test';
import { main, type Writer } from '../src/cli';

/** One run of the command: its arguments and everything it is expected to do. */
interface Case {
  readonly args: readonly string[];
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A writer that keeps what it is handed, in place of a process stream. */
function buffer(): Writer & { readonly text: () => string } {
  let written = '';
  return {
    write: (text: string): void => {
      written += text;
    },
    text: () => written,
  };
}

const cases: Case[] = [
  { args: ['Ada'], status: 0, stdout: 'Hello, Ada.\n', stderr: '' },
  { args: [], status: 0, stdout: 'Hello.\n', stderr: '' },
  { args: ['Ada', 'Grace'], status: 2, stdout: '', stderr: 'usage: bun src/cli.ts [name]\n' },
];

test.each(cases)('main($args) exits $status', ({ args, status, stdout, stderr }: Case) => {
  const out = buffer();
  const err = buffer();
  expect(main(args, out, err)).toBe(status);
  expect(out.text()).toBe(stdout);
  expect(err.text()).toBe(stderr);
});
