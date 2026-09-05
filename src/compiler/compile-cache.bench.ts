import { Effect } from 'effect';

import type { SelectIR } from '#compiler/ir.js';

import { makeCompileCache } from '#compiler/compile-cache.js';
import { compile } from '#compiler/compiler.js';
import { and, col, eq, lit } from '#compiler/ir-constructors.js';
import { PgDialect } from '#dialect.js';

const N = 10_000;
const WARMUP = 200;

const bigIr = (): SelectIR => ({
  _tag: 'Select' as const,
  from: { table: 'users' },
  columns: '*',
  joins: [],
  orderBy: [],
  where: and(
    ...Array.from({ length: 500 }, (_, i) => eq(col(`c${i}`), lit(i))),
  ),
});

const msBetween = (start: bigint, end: bigint): number =>
  Number(end - start) / 1_000_000;

const measure = (run: () => void): number => {
  const start = process.hrtime.bigint();
  for (let i = 0; i < N; i++) run();
  const end = process.hrtime.bigint();

  return msBetween(start, end);
};

const cache = makeCompileCache(PgDialect);

// Прогрев обеих линий: JIT, CPU-частота, разовые инициализации Effect
for (let i = 0; i < WARMUP; i++) compile(bigIr(), PgDialect);
for (let i = 0; i < WARMUP; i++) Effect.runSync(cache(bigIr()));

// Сценарий A: свежие деревья на каждое обращение — цена поиска по содержимому
const baselineFreshMs = measure(() => compile(bigIr(), PgDialect));
const cachedFreshMs = measure(() => Effect.runSync(cache(bigIr())));

// Сценарий B: один объект IR — сам механизм кеша
const ir = bigIr();
const baselineSameMs = measure(() => compile(ir, PgDialect));

Effect.runSync(cache(ir)); // заселяем кеш до замера

const cachedSameMs = measure(() => Effect.runSync(cache(ir)));

console.log({
  freshTrees: {
    baselineMs: baselineFreshMs,
    cachedMs: cachedFreshMs,
    speedup: baselineFreshMs / cachedFreshMs,
  },
  sameObject: {
    baselineMs: baselineSameMs,
    cachedMs: cachedSameMs,
    speedup: baselineSameMs / cachedSameMs,
  },
});
