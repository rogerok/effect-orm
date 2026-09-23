import type { AnyTableDef } from '#schema/table.js';

interface RelationsColumns<
  Source extends AnyTableDef,
  Target extends AnyTableDef,
> {
  readonly columns: {
    [K in keyof Source['_columns'] & string]: Partial<
      Record<
        keyof Source['_columns'] & string,
        keyof Target['_columns'] & string
      >
    > &
      Record<K, keyof Target['_columns'] & string>;
  }[keyof Source['_columns'] & string];
  readonly onDelete: 'cascade';
}

export interface Relations<
  Source extends AnyTableDef,
  Target extends AnyTableDef,
> {
  readonly columns: RelationsColumns<Source, Target>['columns'];
  readonly onDelete: RelationsColumns<Source, Target>['onDelete'];
  readonly table: Target;
}

interface RelationHelpers<Source extends AnyTableDef> {
  readonly many: <Target extends AnyTableDef>(
    source: Target,
    options: RelationsColumns<Source, Target>,
  ) => Relations<Source, Target>;
}

const many = <Source extends AnyTableDef, Target extends AnyTableDef>(
  target: Target,
  options: RelationsColumns<Source, Target>,
) => ({
  table: target,
  onDelete: options.onDelete,
  columns: options.columns,
});

export interface TableRelations<
  Source extends AnyTableDef,
  R extends Record<string, Relations<Source, AnyTableDef>> = Record<
    string,
    Relations<Source, AnyTableDef>
  >,
> {
  readonly relations: R;
  readonly table: Source;
}

export const relations = <
  Source extends AnyTableDef,
  R extends Record<string, Relations<Source, AnyTableDef>>,
>(
  table: Source,
  cb: (helpers: RelationHelpers<Source>) => R,
) => ({ table, relations: cb({ many }) });
