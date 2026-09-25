import { expect, test } from 'bun:test';
import { greeting } from '../src/example';

/** One name and the line it is greeted with. */
interface Case {
  readonly name: string;
  readonly want: string;
}

const cases: Case[] = [
  { name: 'Ada', want: 'Hello, Ada.' },
  { name: '  Ada  ', want: 'Hello, Ada.' },
  { name: '', want: 'Hello.' },
  { name: '   ', want: 'Hello.' },
];

test.each(cases)('greeting($name) is $want', ({ name, want }: Case) => {
  expect(greeting(name)).toBe(want);
});
