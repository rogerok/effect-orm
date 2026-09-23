import { describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { expect } from 'vitest';

import { expectFailure } from '#config/result-matchers.js';
import { Driver } from '#drivers/driver.js';
import * as SqliteDriver from '#drivers/sqlite.js';
import {
  EntityAlreadyTrackedError,
  OptimisticLockError,
} from '#errors/errors.js';
import { selectFrom } from '#query/builder.js';
import { insertInto } from '#query/write-builders.js';
import { makeRepository } from '#repository/make-repository.js';
import {
  integer,
  json,
  nullable,
  primaryKey,
  text,
  timestamp,
} from '#schema/columns.js';
import { table } from '#schema/table.js';
import { UnitOfWork, UnitOfWorkLayer } from '#uow/unit-of-work.js';

const users = table('users', {
  id: primaryKey(integer()),
  name: text(),
  age: integer(),
});

const sqliteLayer = SqliteDriver.layer({ path: ':memory:' });

const versionedUsers = table(
  'versioned_users',
  {
    id: primaryKey(integer()),
    name: text(),
    age: integer(),
    revision: integer(),
    profile: json<{ city: string; tags: string[] }>(),
  },
  { versionColumn: 'revision' },
);

const createVersionedUsers = Effect.gen(function* () {
  const db = yield* Driver;
  yield* db.executeRaw(
    `CREATE TABLE versioned_users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      profile TEXT NOT NULL
    )`,
    [],
  );
  yield* insertInto(versionedUsers)
    .values([
      {
        id: 1,
        name: 'Anna',
        age: 18,
        revision: 3,
        profile: { city: 'Moscow', tags: ['user'] },
      },
      {
        id: 2,
        name: 'Boris',
        age: 30,
        revision: 7,
        profile: { city: 'Kazan', tags: [] },
      },
    ])
    .execute();
});

describe('dirty tracking', () => {
  it.effect('persists a mutated entity on commit', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      yield* db.executeRaw(
        `CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          age INTEGER NOT NULL
        )`,
        [],
      );
      yield* insertInto(users)
        .values([{ id: 1, name: 'Anna', age: 18 }])
        .execute();

      const uow = yield* UnitOfWork;
      const repo = makeRepository(users);
      const anna = yield* repo.findById(1);

      if (anna === null) {
        return yield* Effect.die(new Error('Expected user with id 1 to exist'));
      }

      anna.age = 22;

      // Read the database, not the mutated object from the identity map.
      const beforeCommit = yield* selectFrom(users, 'u').selectAll().execute();
      expect(beforeCommit).toEqual([{ id: 1, name: 'Anna', age: 18 }]);

      yield* uow.commit;

      const afterCommit = yield* selectFrom(users, 'u').selectAll().execute();
      expect(afterCommit).toEqual([{ id: 1, name: 'Anna', age: 22 }]);
    }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect('tracks an entity returned from the identity map after save', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      yield* db.executeRaw(
        'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER NOT NULL)',
        [],
      );
      const repo = makeRepository(users);
      const uow = yield* UnitOfWork;
      const saved = yield* repo.save({ id: 1, name: 'Anna', age: 18 });

      const anna = yield* repo.findById(1);
      expect(anna).toBe(saved);
      expect(yield* uow.isTracked(users, 1)).toBe(true);
      if (anna === null) {
        return yield* Effect.die(
          new Error('Expected saved user in identity map'),
        );
      }

      anna.age = 22;
      yield* uow.commit;

      expect(yield* selectFrom(users, 'u').selectAll().execute()).toEqual([
        { id: 1, name: 'Anna', age: 22 },
      ]);
    }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect(
    'tracks an entity returned from the identity map after update',
    () =>
      Effect.gen(function* () {
        const db = yield* Driver;
        yield* db.executeRaw(
          'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER NOT NULL)',
          [],
        );
        yield* insertInto(users)
          .values([{ id: 1, name: 'Anna', age: 18 }])
          .execute();
        const repo = makeRepository(users);
        const uow = yield* UnitOfWork;
        const updated = yield* repo.update(1, { name: 'Maria' });

        const maria = yield* repo.findById(1);
        expect(maria).toBe(updated);
        expect(yield* uow.isTracked(users, 1)).toBe(true);
        if (maria === null) {
          return yield* Effect.die(
            new Error('Expected updated user in identity map'),
          );
        }

        maria.age = 22;
        yield* uow.commit;

        expect(yield* selectFrom(users, 'u').selectAll().execute()).toEqual([
          { id: 1, name: 'Maria', age: 22 },
        ]);
      }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect('does not track a soft-deleted entity hidden by findById', () =>
    Effect.gen(function* () {
      const accounts = table(
        'accounts',
        {
          id: primaryKey(integer()),
          name: text(),
          deletedAt: nullable(timestamp()),
        },
        { deletedAtColumn: 'deletedAt' },
      );
      const db = yield* Driver;
      yield* db.executeRaw(
        'CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, deletedAt TEXT)',
        [],
      );
      const repo = makeRepository(accounts);
      const uow = yield* UnitOfWork;
      yield* repo.save({
        id: 1,
        name: 'Anna',
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      expect(yield* repo.findById(1)).toBeNull();
      expect(yield* uow.isTracked(accounts, 1)).toBe(false);
    }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );
  it.effect(
    'preserves entity identity and advances versions only on changes',
    () =>
      Effect.gen(function* () {
        yield* createVersionedUsers;
        const uow = yield* UnitOfWork;
        const repo = makeRepository(versionedUsers);
        const anna = yield* repo.findById(1);
        const boris = yield* repo.findById(2);
        if (anna === null || boris === null) {
          return yield* Effect.die(new Error('Expected both seeded users'));
        }

        anna.age = 22;
        yield* uow.commit;

        expect(anna).toMatchObject({ age: 22, revision: 4 });
        expect(yield* repo.findById(1)).toBe(anna);
        expect(yield* repo.findBy({ id: 1 })).toEqual(anna);

        yield* uow.commit;

        expect(anna.revision).toBe(4);
        expect(yield* repo.findBy({ id: 1 })).toMatchObject({
          age: 22,
          revision: 4,
        });

        anna.age = 18;
        boris.age = 31;
        yield* uow.commit;

        expect(anna).toMatchObject({ age: 18, revision: 5 });
        expect(boris).toMatchObject({ age: 31, revision: 8 });
        expect(yield* repo.findBy({ id: 1 })).toEqual(anna);
        expect(yield* repo.findBy({ id: 2 })).toEqual(boris);
        expect(yield* repo.findById(2)).toBe(boris);
      }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect(
    'detects nested mutations after refreshing a versioned snapshot',
    () =>
      Effect.gen(function* () {
        yield* createVersionedUsers;
        const uow = yield* UnitOfWork;
        const repo = makeRepository(versionedUsers);
        const anna = yield* repo.findById(1);
        if (anna === null) {
          return yield* Effect.die(
            new Error('Expected user with id 1 to exist'),
          );
        }

        anna.profile.city = 'Kazan';
        yield* uow.commit;
        expect(anna.revision).toBe(4);

        anna.profile.city = 'Moscow';
        anna.profile.tags.push('admin');

        expect(yield* repo.findBy({ id: 1 })).toMatchObject({
          profile: { city: 'Kazan', tags: ['user'] },
          revision: 4,
        });

        yield* uow.commit;

        expect(anna).toMatchObject({
          profile: { city: 'Moscow', tags: ['user', 'admin'] },
          revision: 5,
        });
        expect(yield* repo.findBy({ id: 1 })).toEqual(anna);

        anna.profile = { city: 'Moscow', tags: ['user', 'admin'] };
        yield* uow.commit;
        expect(anna.revision).toBe(5);
        expect(yield* repo.findBy({ id: 1 })).toEqual(anna);
      }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect(
    'rolls back the whole commit on a later version conflict without advancing tracked state',
    () =>
      Effect.gen(function* () {
        yield* createVersionedUsers;
        const db = yield* Driver;
        const uow = yield* UnitOfWork;
        const repo = makeRepository(versionedUsers);
        const anna = yield* repo.findById(1);
        const boris = yield* repo.findById(2);
        if (anna === null || boris === null) {
          return yield* Effect.die(new Error('Expected both seeded users'));
        }

        anna.age = 22;
        boris.age = 31;
        yield* uow.register(
          insertInto(versionedUsers)
            .values([
              {
                id: 3,
                name: 'Vera',
                age: 40,
                revision: 1,
                profile: { city: 'Perm', tags: [] },
              },
            ])
            .execute(),
        );

        // Simulate a committed write from another client after both reads.
        yield* db.executeRaw(
          'UPDATE versioned_users SET age = 35, revision = revision + 1 WHERE id = 2',
          [],
        );

        const failed = yield* Effect.result(uow.commit);
        expect(failed).toBeFailure(OptimisticLockError);
        expect(expectFailure(failed)).toMatchObject({
          table: 'versioned_users',
          id: 2,
          expectedVersion: 7,
        });

        expect(yield* repo.findBy({ id: 1 })).toMatchObject({
          age: 18,
          revision: 3,
        });
        expect(yield* repo.findBy({ id: 2 })).toMatchObject({
          age: 35,
          revision: 8,
        });
        expect(yield* repo.findBy({ id: 3 })).toBeNull();
        expect(anna).toMatchObject({ age: 22, revision: 3 });
        expect(boris).toMatchObject({ age: 31, revision: 7 });
        expect(yield* repo.findById(1)).toBe(anna);
        expect(yield* repo.findById(2)).toBe(boris);
        expect(yield* uow.pendingCount).toBe(1);

        // Failed commits must not accept either entity's new snapshot.
        const retried = yield* Effect.result(uow.commit);
        expect(retried).toBeFailure(OptimisticLockError);
        expect(expectFailure(retried)).toMatchObject({
          id: 2,
          expectedVersion: 7,
        });

        yield* uow.rollback;
        yield* uow.commit;
        expect(yield* uow.pendingCount).toBe(0);
        expect(yield* repo.findBy({ id: 3 })).toBeNull();

        const reloadedAnna = yield* repo.findById(1);
        const reloadedBoris = yield* repo.findById(2);
        expect(reloadedAnna).not.toBe(anna);
        expect(reloadedBoris).not.toBe(boris);
        expect(reloadedAnna).toMatchObject({ age: 18, revision: 3 });
        expect(reloadedBoris).toMatchObject({ age: 35, revision: 8 });
      }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect('rejects explicit updates of tracked entities until rollback', () =>
    Effect.gen(function* () {
      yield* createVersionedUsers;
      const repo = makeRepository(versionedUsers);
      const uow = yield* UnitOfWork;
      const explicitUpdate = repo.update(
        1,
        { name: 'Maria' },
        { expectedVersion: 3 },
      );
      const anna = yield* repo.findById(1);
      if (anna === null) {
        return yield* Effect.die(new Error('Expected user with id 1 to exist'));
      }

      const cleanFailure = yield* Effect.result(explicitUpdate);
      expect(cleanFailure).toBeFailure(EntityAlreadyTrackedError);
      expect(expectFailure(cleanFailure)).toMatchObject({
        table: 'versioned_users',
        id: 1,
      });
      expect(yield* repo.findBy({ id: 1 })).toMatchObject({
        name: 'Anna',
        age: 18,
        revision: 3,
      });
      expect(yield* repo.findById(1)).toBe(anna);

      anna.age = 22;
      const dirtyFailure = yield* Effect.result(explicitUpdate);
      expect(dirtyFailure).toBeFailure(EntityAlreadyTrackedError);
      expect(anna).toMatchObject({ name: 'Anna', age: 22, revision: 3 });
      expect(yield* repo.findBy({ id: 1 })).toMatchObject({
        name: 'Anna',
        age: 18,
        revision: 3,
      });

      yield* uow.commit;
      expect(anna).toMatchObject({ name: 'Anna', age: 22, revision: 4 });
      const committedFailure = yield* Effect.result(
        repo.update(1, { name: 'Maria' }, { expectedVersion: 4 }),
      );
      expect(committedFailure).toBeFailure(EntityAlreadyTrackedError);
      expect(yield* repo.findBy({ id: 1 })).toEqual(anna);

      yield* uow.rollback;
      const updated = yield* repo.update(
        1,
        { name: 'Maria' },
        { expectedVersion: 4 },
      );
      expect(updated).toMatchObject({ name: 'Maria', age: 22, revision: 5 });
      expect(yield* repo.findBy({ id: 1 })).toEqual(updated);
      expect(anna).toMatchObject({ name: 'Anna', age: 22, revision: 4 });
    }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect(
    'checks snapshot keys and table names independently of the identity cache',
    () =>
      Effect.gen(function* () {
        const accounts = table('accounts', {
          externalId: primaryKey(text()),
          name: text(),
        });
        const otherAccounts = table('other_accounts', {
          externalId: primaryKey(text()),
          name: text(),
        });
        const db = yield* Driver;
        yield* db.executeRaw(
          'CREATE TABLE accounts (externalId TEXT PRIMARY KEY, name TEXT NOT NULL)',
          [],
        );
        yield* db.executeRaw(
          'CREATE TABLE other_accounts (externalId TEXT PRIMARY KEY, name TEXT NOT NULL)',
          [],
        );
        yield* insertInto(accounts)
          .values([{ externalId: 'account-1', name: 'Anna' }])
          .execute();
        yield* insertInto(otherAccounts)
          .values([{ externalId: 'account-1', name: 'Boris' }])
          .execute();
        const uow = yield* UnitOfWork;
        const repo = makeRepository(accounts);
        const trackingCheck = uow.isTracked(accounts, 'account-1');
        expect(yield* trackingCheck).toBe(false);

        const anna = yield* repo.findById('account-1');
        if (anna === null) {
          return yield* Effect.die(new Error('Expected seeded account'));
        }
        anna.externalId = 'local-id';
        yield* uow.identity.clear;

        expect(yield* trackingCheck).toBe(true);
        expect(yield* uow.isTracked(accounts, 'local-id')).toBe(false);
        expect(yield* uow.isTracked(otherAccounts, 'account-1')).toBe(false);
        const sameTable = table('accounts', {
          externalId: primaryKey(text()),
          name: text(),
        });
        const rejected = yield* Effect.result(
          makeRepository(sameTable).update('account-1', { name: 'Changed' }),
        );
        expect(rejected).toBeFailure(EntityAlreadyTrackedError);
        expect(expectFailure(rejected)).toMatchObject({
          table: 'accounts',
          id: 'account-1',
        });
        expect(yield* repo.findBy({ externalId: 'account-1' })).toEqual({
          externalId: 'account-1',
          name: 'Anna',
        });

        const otherRepo = makeRepository(otherAccounts);
        yield* otherRepo.update('account-1', { name: 'Changed' });
        expect(yield* otherRepo.findBy({ externalId: 'account-1' })).toEqual({
          externalId: 'account-1',
          name: 'Changed',
        });

        yield* uow.rollback;
        expect(yield* trackingCheck).toBe(false);
      }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect(
    'rejects soft deletion of tracked rows without hiding or changing them',
    () =>
      Effect.gen(function* () {
        const accounts = table(
          'accounts',
          {
            id: primaryKey(integer()),
            name: text(),
            deletedAt: nullable(timestamp()),
          },
          { deletedAtColumn: 'deletedAt' },
        );
        const db = yield* Driver;
        yield* db.executeRaw(
          'CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, deletedAt TEXT)',
          [],
        );
        yield* insertInto(accounts)
          .values([{ id: 1, name: 'Anna', deletedAt: null }])
          .execute();
        const uow = yield* UnitOfWork;
        const repo = makeRepository(accounts);
        const anna = yield* repo.findById(1);
        if (anna === null) {
          return yield* Effect.die(new Error('Expected seeded account'));
        }

        const rejected = yield* Effect.result(repo.delete(1));
        expect(rejected).toBeFailure(EntityAlreadyTrackedError);
        expect(expectFailure(rejected)).toMatchObject({
          table: 'accounts',
          id: 1,
        });
        expect(anna.deletedAt).toBeNull();
        expect(yield* repo.findById(1)).toBe(anna);
        expect(yield* repo.findBy({ id: 1 })).toEqual({
          id: 1,
          name: 'Anna',
          deletedAt: null,
        });

        yield* uow.rollback;
        yield* repo.delete(1);
        expect(yield* repo.findBy({ id: 1 })).toBeNull();
        const deleted = yield* repo.findIncludingDeleted({ id: 1 });
        expect(deleted[0]?.deletedAt).toBeInstanceOf(Date);
      }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );

  it.effect('propagates rejected registered updates through commit', () =>
    Effect.gen(function* () {
      yield* createVersionedUsers;
      const repo = makeRepository(versionedUsers);
      const uow = yield* UnitOfWork;
      yield* uow.register(
        repo
          .update(1, { name: 'Maria' }, { expectedVersion: 3 })
          .pipe(Effect.provideService(UnitOfWork, uow)),
      );
      const anna = yield* repo.findById(1);

      const rejected = yield* Effect.result(uow.commit);
      expect(rejected).toBeFailure(EntityAlreadyTrackedError);
      expect(yield* repo.findBy({ id: 1 })).toMatchObject({
        name: 'Anna',
        revision: 3,
      });
      expect(yield* repo.findById(1)).toBe(anna);
      expect(yield* uow.pendingCount).toBe(1);
      yield* uow.rollback;
      expect(yield* uow.pendingCount).toBe(0);
    }).pipe(Effect.provide([sqliteLayer, UnitOfWorkLayer])),
  );
});
