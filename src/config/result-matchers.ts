import { Result } from 'effect';
import { inspect } from 'node:util';

type ErrorClass<Error extends object = object> = abstract new (
  ...args: never[]
) => Error;

type SuccessOf<T> =
  T extends Result.Result<infer Success, unknown> ? Success : never;

type FailureOf<T> =
  T extends Result.Result<unknown, infer Failure> ? Failure : never;

declare module 'vitest' {
  interface Matchers<T> {
    toBeFailure<Failure extends FailureOf<T> & object>(
      errorClass?: ErrorClass<Failure>,
    ): void;
    toBeSuccess(): void;
    toEqualFailure(expected: FailureOf<T>): void;
    toEqualSuccess(expected: SuccessOf<T>): void;
  }
}

const show = (value: unknown): string =>
  inspect(value, { breakLength: 80, colors: false, depth: 5 });

type PrintValue = (value: unknown) => string;
type ResultVariant = 'Failure' | 'Success';

const describeResult = (
  result: Result.Result<unknown, unknown>,
  printReceived: PrintValue,
): string =>
  Result.isSuccess(result)
    ? `Result.Success(${printReceived(result.success)})`
    : `Result.Failure(${printReceived(result.failure)})`;

const makeVariantMessage = (
  variant: ResultVariant,
  result: Result.Result<unknown, unknown>,
  isNot: boolean,
  printReceived: PrintValue,
): string =>
  [
    `Expected result ${isNot ? 'not ' : ''}to be Result.${variant}`,
    `Received: ${describeResult(result, printReceived)}`,
  ].join('\n');

const makeEqualityMessage = (
  variant: ResultVariant,
  actual: unknown,
  expected: unknown,
  isNot: boolean,
  printReceived: PrintValue,
  printExpected: PrintValue,
): string =>
  [
    `Expected Result.${variant} value ${isNot ? 'not ' : ''}to equal:`,
    printExpected(expected),
    'Received:',
    printReceived(actual),
  ].join('\n');

const makeErrorClassMessage = (
  failure: unknown,
  errorClass: ErrorClass,
  isNot: boolean,
  printReceived: PrintValue,
): string =>
  [
    `Expected Result.Failure error ${isNot ? 'not ' : ''}to be an instance of ${errorClass.name}`,
    'Received:',
    printReceived(failure),
  ].join('\n');

const asResult = (
  received: unknown,
  matcher: string,
  printReceived: PrintValue,
): Result.Result<unknown, unknown> => {
  if (!Result.isResult(received)) {
    throw new TypeError(
      [
        `${matcher} expected a Result value`,
        `Received: ${printReceived(received)}`,
      ].join('\n'),
    );
  }

  return received;
};

expect.extend({
  toBeSuccess(received: unknown) {
    const result = asResult(received, 'toBeSuccess', this.utils.printReceived);

    return {
      pass: Result.isSuccess(result),
      message: () =>
        makeVariantMessage(
          'Success',
          result,
          this.isNot,
          this.utils.printReceived,
        ),
    };
  },

  toEqualSuccess(received: unknown, expected: unknown) {
    const result = asResult(
      received,
      'toEqualSuccess',
      this.utils.printReceived,
    );
    if (Result.isFailure(result)) {
      return {
        pass: false,
        message: () =>
          makeVariantMessage(
            'Success',
            result,
            this.isNot,
            this.utils.printReceived,
          ),
      };
    }

    const pass = this.equals(result.success, expected, [
      ...this.customTesters,
      this.utils.iterableEquality,
    ]);

    return {
      pass,
      actual: result.success,
      expected,
      message: () =>
        makeEqualityMessage(
          'Success',
          result.success,
          expected,
          this.isNot,
          this.utils.printReceived,
          this.utils.printExpected,
        ),
    };
  },

  toBeFailure(received: unknown, errorClass?: ErrorClass) {
    const result = asResult(received, 'toBeFailure', this.utils.printReceived);

    if (Result.isSuccess(result)) {
      return {
        pass: false,
        message: () =>
          makeVariantMessage(
            'Failure',
            result,
            this.isNot,
            this.utils.printReceived,
          ),
      };
    }

    if (errorClass === undefined) {
      return {
        pass: true,
        message: () =>
          makeVariantMessage(
            'Failure',
            result,
            this.isNot,
            this.utils.printReceived,
          ),
      };
    }

    const pass = result.failure instanceof errorClass;

    return {
      pass,
      message: () =>
        makeErrorClassMessage(
          result.failure,
          errorClass,
          this.isNot,
          this.utils.printReceived,
        ),
    };
  },

  toEqualFailure(received: unknown, expected: unknown) {
    const result = asResult(
      received,
      'toEqualFailure',
      this.utils.printReceived,
    );

    if (Result.isSuccess(result)) {
      return {
        pass: false,
        message: () =>
          makeVariantMessage(
            'Failure',
            result,
            this.isNot,
            this.utils.printReceived,
          ),
      };
    }

    const pass = this.equals(result.failure, expected, [
      ...this.customTesters,
      this.utils.iterableEquality,
    ]);

    return {
      pass,
      actual: result.failure,
      expected,
      message: () =>
        makeEqualityMessage(
          'Failure',
          result.failure,
          expected,
          this.isNot,
          (value) => this.utils.printReceived(value),
          (value) => this.utils.printExpected(value),
        ),
    };
  },
});

export const expectSuccess = <A, E>(result: Result.Result<A, E>): A => {
  if (Result.isFailure(result)) {
    throw new Error(makeVariantMessage('Success', result, false, show));
  }

  return result.success;
};

export const expectFailure = <A, E>(result: Result.Result<A, E>): E => {
  if (Result.isSuccess(result)) {
    throw new Error(makeVariantMessage('Failure', result, false, show));
  }

  return result.failure;
};
