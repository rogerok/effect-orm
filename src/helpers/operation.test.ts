import { getOperation } from '#helpers/operation.js';

const queriesTable = [
  {
    query: '   SELECT * FROM driver',
    operation: 'select',
  },
  {
    query: 'INSERT INTO users',
    operation: 'insert',
  },
  {
    query: 'CREATE TABLE users',
    operation: 'create',
  },
  {
    query: 'nonsense query',
    operation: 'other',
  },
  {
    query: '   ',
    operation: 'other',
  },
  {
    query: 'COMMIT',
    operation: 'commit',
  },
  {
    query: 'SELECT\n* FROM users',
    operation: 'select',
  },
] as const;

describe('getOperation', () => {
  it.each(queriesTable)('expect $operation', ({ operation, query }) => {
    expect(getOperation(query)).toBe(operation);
  });
});
