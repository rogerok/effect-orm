import { expect } from '@effect/vitest';
import { type Cause, Result } from 'effect';

expect.extend({
  toBeResultFailure<
    ErrorType extends Cause.YieldableError,
    Args extends Array<unknown>,
  >(
    received: unknown,
    ErrorClass: new (...args: Args) => ErrorType,
    expectedFields: Partial<ErrorType>,
  ) {
    if (!Result.isResult(received)) {
      return {
        pass: false,
        actual: received,
        expected: 'Result.Failure',
        message: () =>
          [
            'Expected received value to be a Result',
            `Received: ${this.utils.printReceived(received)}`,
          ].join('\n'),
      };
    }

    if (!Result.isFailure(received)) {
      return {
        pass: false,
        actual: received,
        expected: 'Result.Failure',
        message: () =>
          [
            'Expected Result.Failure, but received Result.Success',
            `Received: ${this.utils.printReceived(received)}`,
          ].join('\n'),
      };
    }

    if (!(received.failure instanceof ErrorClass)) {
      return {
        pass: false,
        actual: received.failure,
        expected: ErrorClass,
        message: () =>
          [
            'Expected Result failure to be an instance of:',
            this.utils.printExpected(ErrorClass),
            'Received:',
            this.utils.printReceived(received.failure),
          ].join('\n'),
      };
    }

    const pass = this.equals(received.failure, expectedFields, [
      ...this.customTesters,
      this.utils.iterableEquality,
      this.utils.subsetEquality,
    ]);

    return {
      pass,
      actual: received.failure,
      expected: expectedFields,
      message: () =>
        pass
          ? [
              'Expected Result failure not to match:',
              this.utils.printExpected(expectedFields),
              'Received:',
              this.utils.printReceived(received.failure),
            ].join('\n')
          : [
              'Expected Result failure to match:',
              this.utils.printExpected(expectedFields),
              'Received:',
              this.utils.printReceived(received.failure),
            ].join('\n'),
    };
  },
});
