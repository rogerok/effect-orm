import { Schema } from 'effect';

import { makeLiteralUnionSchema } from '#schema/utils.js';

export const OperationsSchema = makeLiteralUnionSchema([
  'alter',
  'begin',
  'commit',
  'create',
  'delete',
  'drop',
  'insert',
  'other',
  'pragma',
  'rollback',
  'select',
  'update',
]);
const isOperation = Schema.is(OperationsSchema);

export const DbOperations = OperationsSchema.values;
export type Operation = Schema.Schema.Type<typeof OperationsSchema>;

export const getOperation = (sql: string): Operation => {
  const normalized = sql.trimStart().toLowerCase();
  const [op] = normalized.split(/\s+/, 1);

  return isOperation(op) ? op : DbOperations.other;
};
