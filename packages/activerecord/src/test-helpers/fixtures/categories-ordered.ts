// activerecord/test/fixtures/categories_ordered.yml
// Rails ERB-renders 100 rows; we generate the same shape in TS. Loaded into
// the `categories` table via explicit class (see Rails fixtures_test.rb).
export const categoriesOrderedFixtureData = Object.fromEntries(
  Array.from({ length: 100 }, (_, i) => [
    `fixture_no_${i}`,
    { id: i, name: `Category ${i}`, type: "Category" },
  ]),
);
