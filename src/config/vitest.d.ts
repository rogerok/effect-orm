import type { Cause, Result } from 'effect';

import 'vitest';

type FailureOf<T> =
  T extends Result.Result<unknown, infer Failure> ? Failure : never;

type SuccessOf<T> =
  T extends Result.Result<infer Success, unknown> ? Success : never;

declare module 'vitest' {
  interface Matchers<T> {
    toBeResultFailure<
      ErrorType extends Cause.YieldableError & FailureOf<T>,
      Args extends Array<unknown>,
    >(
      ErrorClass: new (...args: Args) => ErrorType,
      expectedFields: Partial<ErrorType>,
    ): void;

    toBeResultSuccess(expected: SuccessOf<T>): void;
  }
}
