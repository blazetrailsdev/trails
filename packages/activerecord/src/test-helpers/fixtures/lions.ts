// Rails has no test/fixtures/lions.yml — `lions` (schema.rb:740) is a
// schema-only table whose tests build records directly. The set exists so
// `fixtures(["lions"])` wires the connection handler for `Lion < abstract Cat`;
// the single row satisfies the registry's non-empty-data conformance guard and
// respects Cat's `default_scope { where(is_vegetarian: false) }`.
export const lionFixtureData = {
  vegetarian_lion: {
    id: 1,
    gender: 0,
    is_vegetarian: true,
  },
  meat_eating_lion: {
    id: 2,
    gender: 1,
    is_vegetarian: false,
  },
};
