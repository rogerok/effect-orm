export type DialectId = 'postgres' | 'sqlite';

export const isPostgresDialect = (dialect: DialectId): dialect is 'postgres' =>
  dialect === 'postgres';

export interface Dialect {
  readonly id: DialectId;
  readonly supportsReturning: boolean;
  readonly mapColumnType: (
    sqlType: string,
    opts: { autoIncrement: boolean },
  ) => string;
  readonly placeholder: (n: number) => string;
  readonly quoteIdentifier: (name: string) => string;
}

export const PgDialect: Dialect = {
  id: 'postgres',
  placeholder: (n) => `$${n}`,
  quoteIdentifier: (name) => `"${name.replace(/"/g, '""')}"`,
  mapColumnType: (t, { autoIncrement }) => {
    if (autoIncrement && t === 'integer') {
      return 'BIGSERIAL';
    }

    return (
      {
        integer: 'INTEGER',
        real: 'DOUBLE PRECISION',
        text: 'TEXT',
        blob: 'BYTEA',
        boolean: 'BOOLEAN',
      }[t] ?? t.toUpperCase()
    );
  },
  supportsReturning: true,
};

export const SqliteDialect: Dialect = {
  id: 'sqlite',
  placeholder: () => '?',
  quoteIdentifier: (name) => `"${name.replace(/"/g, '""')}"`,
  mapColumnType: (t) =>
    ({
      integer: 'INTEGER',
      real: 'REAL',
      text: 'TEXT',
      blob: 'BLOB',
      boolean: 'INTEGER', //sqlite не имеет boolean - кодируем как 0 / 1
    })[t] ?? t.toUpperCase(),
  supportsReturning: true,
};
