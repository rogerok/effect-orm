import { describe, expect, expectTypeOf, it } from 'vitest';

import type { InferInsert } from '#schema/infer.js';

import { integer, primaryKey, text, withDefault } from '#schema/columns.js';
import { table } from '#schema/table.js';

const articles = table('articles', {
  id: primaryKey(integer()),
  title: text(),
  likes: withDefault(integer(), 0),
});

describe('E1.1', () => {
  it('runtime: _hasDefault = true, _default доступен', () => {
    expect(articles._columns.likes._default).toBe(0);
    expect(articles._columns.likes._hasDefault).toBe(true);
  });

  it('types: колонка с default опциональна в insert', () => {
    expectTypeOf<{ title: string }>().toExtend<InferInsert<typeof articles>>();
  });
});
