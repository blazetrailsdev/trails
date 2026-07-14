// Rails has no test/fixtures/lions.yml — `lions` (schema.rb:740) is a
// schema-only table whose own Rails tests (default_scoping_test.rb:689-709)
// only assert generated SQL, so they never need rows. The set exists so
// `fixtures(["lions"])` wires the connection handler for `Lion < abstract Cat`.
// The two rows straddle Cat's `default_scope { where(is_vegetarian: false) }`
// so a test can prove the inherited scope actually filters.
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
