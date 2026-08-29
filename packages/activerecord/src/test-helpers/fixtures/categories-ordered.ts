export const categoriesOrderedFixtureData = Object.fromEntries(
  Array.from({ length: 100 }, (_, i) => [
    `fixture_no_${i}`,
    { id: i, name: `Category ${i}`, type: "Category" },
  ]),
);
