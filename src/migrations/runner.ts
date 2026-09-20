import { Effect } from 'effect';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Driver } from '#drivers/driver.js';
import { DbError } from '#errors/errors.js';
import { withTransaction } from '#uow/transaction.js';

interface Migration {
  readonly checksum: string;
  readonly name: string;
  readonly sql: string;
}

const loadMigrations = (dir: string): Effect.Effect<Migration[], DbError> =>
  Effect.tryPromise({
    try: async () => {
      const files = (await readdir(dir))
        .filter((f) => f.endsWith('.sql'))
        .sort();

      return Promise.all(
        files.map(async (name) => {
          const sql = await readFile(path.join(dir, name), 'utf-8');
          const checksum = crypto
            .createHash('sha256')
            .update(sql)
            .digest('hex')
            .slice(0, 16);

          return { name, sql, checksum };
        }),
      );
    },
    catch: (cause) => new DbError({ cause, sql: '<load>', params: [] }),
  });

export const migrate = (dir: string) =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    const id = driver.dialect.quoteIdentifier;

    yield* driver.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${id('__migrations')} (
         name TEXT PRIMARY KEY,
         checksum TEXT NOT NULL,
         applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
      [],
    );

    const applied = yield* driver.executeRaw(
      `SELECT ${id('name')}, ${id('checksum')} FROM ${id('__migrations')}`,
      [],
    );

    const appliedMap = new Map(
      applied.rows.map((r) => [r.name, r.checksum as string]),
    );

    const migrations = yield* loadMigrations(dir);

    for (const m of migrations) {
      const previous = appliedMap.get(m.name);

      if (previous) {
        if (previous !== m.checksum) {
          return yield* new DbError({
            cause: `Migration ${m.name} was modified after apply`,
            sql: '',
            params: [],
          });
        }
        continue;
      }

      yield* withTransaction(
        Effect.gen(function* () {
          yield* driver.executeRaw(m.sql, []);
          yield* driver.executeRaw(
            `INSERT INTO ${id('__migrations')} (name, checksum) VALUES (${driver.dialect.placeholder(1)}, ${driver.dialect.placeholder(2)})`,
            [m.name, m.checksum],
          );
        }),
      );

      yield* Effect.logInfo(`Applied migration: ${m.name}`);
    }
  });
