export type Expr =
  | {
      readonly _tag: 'Column';
      readonly name: string;
      readonly table?: string | undefined;
    }
  | { readonly _tag: 'Literal'; readonly value: unknown };

export type Predicate =
  | { readonly _tag: 'And' | 'Or'; readonly preds: ReadonlyArray<Predicate> }
  | {
      readonly _tag: 'Between';
      readonly expr: Expr;
      readonly max: Expr;
      readonly min: Expr;
    }
  | {
      readonly _tag: 'Eq' | 'Gt' | 'Gte' | 'Like' | 'Lt' | 'Lte' | 'Neq';
      readonly left: Expr;
      readonly right: Expr;
    }
  | {
      readonly _tag: 'In';
      readonly left: Expr;
      readonly values: ReadonlyArray<Expr>;
    }
  | { readonly _tag: 'IsNull'; readonly expr: Expr; readonly negate: boolean }
  | { readonly _tag: 'Not'; readonly pred: Predicate };
export type Join = {
  readonly kind: 'inner' | 'left';
  readonly on: Predicate;
  readonly table: string;
  readonly alias?: string;
};

export type OrderBy = { readonly dir: 'asc' | 'desc'; readonly expr: Expr };

export type Projection =
  ReadonlyArray<{ readonly expr: Expr; readonly alias?: string }> | '*';

export type SelectIR = {
  readonly _tag: 'Select';
  readonly columns: Projection;
  readonly from: { readonly table: string; readonly alias?: string };
  readonly joins: ReadonlyArray<Join>;
  readonly orderBy: ReadonlyArray<OrderBy>;
  readonly limit?: number;
  readonly offset?: number;
  readonly where?: Predicate;
};

export type InsertIR = {
  readonly _tag: 'Insert';
  readonly into: string;
  readonly returning: Projection | null;
  readonly rows: ReadonlyArray<Readonly<Record<string, Expr>>>;
};

export type UpdateIR = {
  readonly _tag: 'Update';
  readonly returning: Projection | null;
  readonly set: Readonly<Record<string, Expr>>;
  readonly table: string;
  readonly where?: Predicate;
};

export type DeleteIR = {
  readonly _tag: 'Delete';
  readonly from: string;
  readonly returning: Projection | null;
  readonly where?: Predicate;
};

export type IR = DeleteIR | InsertIR | SelectIR | UpdateIR;
