import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

describe('Effect test infrastructure', () => {
  it.effect('runs an Effect program', () =>
    Effect.gen(function* () {
      const value = yield* Effect.succeed(42);

      expect(value).toBe(42);
    }),
  );
});
