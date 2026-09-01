import { describe, expect, it } from '@effect/vitest';
import { Data, Result } from 'effect';

import { expectFailure, expectSuccess } from './result-matchers.js';

class TestError extends Data.TaggedError('TestError')<{
  readonly code: number;
}> {}

describe('Result matchers', () => {
  it('checks Result variants and failure classes', () => {
    expect(Result.succeed(1)).toBeSuccess();
    expect(Result.fail('boom')).toBeFailure();
    expect(Result.fail(new TestError({ code: 42 }))).toBeFailure(TestError);

    expect(Result.fail('boom')).not.toBeSuccess();
    expect(Result.succeed(1)).not.toBeFailure();
    expect(Result.fail(new Error('boom'))).not.toBeFailure(TestError);
  });

  it('compares Success and Failure values deeply', () => {
    expect(Result.succeed(new Set([{ id: 1 }]))).toEqualSuccess(
      new Set([{ id: 1 }]),
    );
    expect(
      Result.fail({ code: 42, metadata: new Map([['retryable', false]]) }),
    ).toEqualFailure({
      code: 42,
      metadata: new Map([['retryable', false]]),
    });

    expect(Result.succeed({ id: 1 })).not.toEqualSuccess({ id: 2 });
    expect(Result.fail({ code: 1 })).not.toEqualFailure({ code: 2 });
  });

  it('returns variant values from extraction helpers', () => {
    expect(expectSuccess(Result.succeed({ id: 1 }))).toEqual({ id: 1 });
    expect(expectFailure(Result.fail(new TestError({ code: 42 })))).toEqual(
      new TestError({ code: 42 }),
    );
  });

  it('reports the expected variant and received Result', () => {
    expect(() => expect(Result.fail('boom')).toBeSuccess()).toThrow(
      /Expected result to be Result\.Success[\s\S]*Received: Result\.Failure/,
    );
    expect(() => expect(Result.succeed(1)).not.toBeSuccess()).toThrow(
      /Expected result not to be Result\.Success/,
    );
    expect(() => expect(Result.succeed(1)).toBeFailure()).toThrow(
      /Expected result to be Result\.Failure[\s\S]*Received: Result\.Success/,
    );
  });

  it('reports equality and failure-class mismatches', () => {
    expect(() => expect(Result.succeed(1)).toEqualSuccess(2)).toThrow(
      /Expected Result\.Success value to equal/,
    );
    expect(() =>
      expect(Result.fail('actual')).toEqualFailure('expected'),
    ).toThrow(/Expected Result\.Failure value to equal/);
    expect(() =>
      expect(Result.fail(new Error('boom'))).toBeFailure(TestError),
    ).toThrow(/Expected Result\.Failure error to be an instance of TestError/);
  });

  it('formats values in extraction-helper failures', () => {
    expect(() =>
      expectSuccess(Result.fail(new TestError({ code: 42 }))),
    ).toThrow(/code: 42/);
    expect(() => expectFailure(Result.succeed({ id: 1 }))).toThrow(
      /Expected result to be Result\.Failure[\s\S]*id: 1/,
    );
  });

  it('rejects non-Result received values', () => {
    expect(() => expect('not a result').toBeSuccess()).toThrow(
      /toBeSuccess expected a Result value/,
    );
  });
});
