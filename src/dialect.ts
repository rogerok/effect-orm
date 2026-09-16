export type DialectId = 'postgres' | 'sqlite';

export const isPostgresDialect = (dialect: DialectId): dialect is 'postgres' =>
  dialect === 'postgres';

export interface Dialect {
  readonly id: DialectId;
  readonly supportsReturning: boolean;
  readonly mapColumnType: (
    sqlType: string,
    opts: { autoIncrement?: boolean; length?: number },
  ) => string;
  readonly placeholder: (n: number) => string;
  readonly quoteIdentifier: (name: string) => string;
}

export const PgDialect: Dialect = {
  id: 'postgres',
  placeholder: (n) => `$${n}`,
  quoteIdentifier: (name) => `"${name.replace(/"/g, '""')}"`,
  mapColumnType: (t, { autoIncrement, length }) => {
    if (autoIncrement && t === 'integer') {
      return 'BIGSERIAL';
    }

    if (t === 'varchar' && Number.isInteger(length)) {
      return `VARCHAR(${length})`;
    }

    return (
      {
        blob: 'BYTEA',
        boolean: 'BOOLEAN',
        integer: 'INTEGER',
        json: 'JSONB',
        real: 'DOUBLE PRECISION',
        text: 'TEXT',
        timestamp: 'TIMESTAMPTZ',
      }[t] ?? t.toUpperCase()
    );
  },
  supportsReturning: true,
};

export const SqliteDialect: Dialect = {
  id: 'sqlite',
  placeholder: () => '?',
  quoteIdentifier: (name) => `"${name.replace(/"/g, '""')}"`,
  mapColumnType: (t, { length }) => {
    if (t === 'varchar' && Number.isInteger(length)) {
      return `VARCHAR(${length})`;
    }

    return (
      {
        blob: 'BLOB',
        boolean: 'INTEGER', //sqlite не имеет boolean - кодируем как 0 / 1
        integer: 'INTEGER',
        json: 'TEXT',
        real: 'REAL',
        text: 'TEXT',
        timestamp: 'TEXT',
      }[t] ?? t.toUpperCase()
    );
  },

  supportsReturning: true,
};
