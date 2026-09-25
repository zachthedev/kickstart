// TODO(kickstart): replace this placeholder module with your project's code, and tests/example.test.ts with its tests.

/**
 * The line the placeholder command prints for a name.
 *
 * @param name - Who is greeted. Surrounding whitespace is dropped, and an
 * empty name greets nobody in particular
 * @returns The greeting, ending in a period
 *
 * @example
 * ```typescript
 * greeting(' Ada ');
 * // 'Hello, Ada.'
 * ```
 */
export function greeting(name: string): string {
  const trimmed = name.trim();
  return trimmed.length === 0 ? 'Hello.' : `Hello, ${trimmed}.`;
}
