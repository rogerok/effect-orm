import type { PrimaryKeyName } from '#schema/columns.js';
import type { AnyTableDef } from '#schema/table.js';

import { PrimaryKeyError } from '#errors/errors.js';

export const findPrimaryKey = <T extends AnyTableDef>(
  table: T,
): PrimaryKeyName<T> => {
  const entries = Object.entries(table._columns);
  const pk = entries[entries.findIndex(([__, v]) => v._pk)]?.[0];

  if (pk === undefined) {
    //отсутствие первичного ключа можно считать нарушением предусловия фабрики: репозиторий требует таблицу с первичным ключом.
    throw new PrimaryKeyError({
      cause: 'Primary key should exist in the table',
    });
  }

  return pk as PrimaryKeyName<T>;
};
