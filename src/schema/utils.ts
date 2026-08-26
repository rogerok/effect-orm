import { Schema } from 'effect';

type LiteralUnionValues<Literals extends ReadonlyArray<string>> = {
  readonly [Literal in Literals[number]]: Literal;
};

export const makeLiteralUnionSchema = <
  const Literals extends ReadonlyArray<string>,
>(
  literals: Literals,
) => {
  const values = Object.fromEntries(
    literals.map((l) => [l, l]),
  ) as LiteralUnionValues<Literals>;

  return Object.assign(Schema.Literals(literals), {
    values: Object.freeze(values),
  });
};
