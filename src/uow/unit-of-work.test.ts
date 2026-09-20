import { describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { expect } from 'vitest';

import { expectFailure } from '#config/result-matchers.js';
import { Driver } from '#drivers/driver.js';
import * as SqliteDriver from '#drivers/sqlite.js';
import { UniqueViolationError } from '#errors/errors.js';
import { selectFrom } from '#query/builder.js';
import { insertInto } from '#query/write-builders.js';
import { makeRepository } from '#repository/make-repository.js';
import {
  bool,
  integer,
  nullable,
  primaryKey,
  text,
  withDefault,
} from '#schema/columns.js';
import { table } from '#schema/table.js';
import { IdentityMapTag } from '#uow/identity-map.js';
import { UnitOfWork, UnitOfWorkLayer } from '#uow/unit-of-work.js';

const users = table('users', {
  id: primaryKey(integer()),
  name: text(),
  nickname: nullable(text()),
  age: withDefault(integer(), 18),
  active: bool(),
});

const sqliteLayer = SqliteDriver.layer({ path: ':memory:' });
const createUsers = Effect.gen(function* () {
  const db = yield* Driver;
  const id = db.dialect.quoteIdentifier;

  yield* db.executeRaw(
    `CREATE TABLE ${id('users')} (
      ${id('id')} INTEGER PRIMARY KEY,
      ${id('name')} TEXT NOT NULL,
      ${id('nickname')} TEXT,
      ${id('active')} ${db.dialect.mapColumnType('boolean', {})},
      ${id('age')} INTEGER NOT NULL DEFAULT 18
    )`,
    [],
  );
});

describe('unit of of work', () => {
  it.effect('commit add record to table', () =>
    Effect.gen(function* () {
      yield* createUsers;
      const user = {
        name: 'Boris',
        nickname: 'B',
        age: 22,
        active: true,
        id: 1,
      };

      const uow = yield* UnitOfWork;
      const save = insertInto(users).values([user]).execute();
      yield* uow.register(save);

      const beforeCommit = yield* selectFrom(users, 'u').selectAll().execute();
      expect(beforeCommit).toEqual([]);

      yield* uow.commit;

      const afterCommit = yield* selectFrom(users, 'u').selectAll().execute();

      expect(afterCommit).toEqual([user]);
    }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect('rolls back earlier writes when a later write fails', () =>
    Effect.gen(function* () {
      yield* createUsers;
      const user = {
        name: 'Boris',
        nickname: 'B',
        age: 22,
        active: true,
        id: 1,
      };

      const uow = yield* UnitOfWork;
      const save1 = insertInto(users).values([user]).execute();
      const save2 = insertInto(users).values([user]).execute();
      yield* uow.register(save1);
      yield* uow.register(save2);

      const result = yield* Effect.result(uow.commit);

      const afterCommit = yield* selectFrom(users, 'u').selectAll().execute();

      expect(expectFailure(result)).toBeInstanceOf(UniqueViolationError);
      expect(afterCommit).toEqual([]);
    }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect('commit add record to table with repository', () =>
    Effect.gen(function* () {
      yield* createUsers;

      const user = {
        name: 'Boris',
        nickname: 'B',
        age: 22,
        active: true,
        id: 1,
      } as const;

      const uow = yield* UnitOfWork;
      const repo = makeRepository(users);

      const saveEff = repo
        .save(user)
        .pipe(Effect.provideService(IdentityMapTag, uow.identity));
      yield* uow.register(saveEff);

      const identityBeforeCommit = yield* uow.identity.get<typeof user>(
        'users',
        user.id,
      );
      expect(identityBeforeCommit).toBeNull();

      const beforeCommit = yield* selectFrom(users, 'u').selectAll().execute();
      expect(beforeCommit).toEqual([]);

      yield* uow.commit;

      const afterCommit = yield* selectFrom(users, 'u').selectAll().execute();

      const identityAfterCommit = yield* uow.identity.get<typeof user>(
        'users',
        user.id,
      );

      expect(afterCommit).toEqual([user]);
      expect(identityAfterCommit).toEqual(user);
    }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect(
    'clears retained identity and pending writes on explicit rollback after commit failure',
    () =>
      Effect.gen(function* () {
        yield* createUsers;
        const user = {
          name: 'Boris',
          nickname: 'B',
          age: 22,
          active: true,
          id: 1,
        };

        const uow = yield* UnitOfWork;
        const repo = makeRepository(users);
        const save1 = repo
          .save(user)
          .pipe(Effect.provideService(IdentityMapTag, uow.identity));
        const save2 = repo
          .save(user)
          .pipe(Effect.provideService(IdentityMapTag, uow.identity));
        yield* uow.register(save1);
        yield* uow.register(save2);

        const result = yield* Effect.result(uow.commit);
        const afterCommit = yield* selectFrom(users, 'u').selectAll().execute();

        const identityAfterCommit = yield* uow.identity.get<typeof user>(
          'users',
          user.id,
        );

        expect(identityAfterCommit).toEqual(user);
        expect(yield* uow.pendingCount).toBe(2);

        expect(expectFailure(result)).toBeInstanceOf(UniqueViolationError);
        expect(afterCommit).toEqual([]);

        yield* uow.rollback;
        const identityAfterRollback = yield* uow.identity.get<typeof user>(
          'users',
          user.id,
        );

        expect(identityAfterRollback).toBeNull();
        expect(yield* uow.pendingCount).toBe(0);
      }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );
});
