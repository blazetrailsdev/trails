// activerecord/test/fixtures/developers.yml
// Schema gap: shared_computers exists in Rails YAML but is not declared in test-fixtures.ts Developer.
export const developerFixtureData = {
  david: {
    name: "David",
    salary: 80000,
  },
  jamis: {
    name: "Jamis",
    salary: 150000,
  },
  dev_3: { name: "fixture_3", salary: 100000 },
  dev_4: { name: "fixture_4", salary: 100000 },
  dev_5: { name: "fixture_5", salary: 100000 },
  dev_6: { name: "fixture_6", salary: 100000 },
  dev_7: { name: "fixture_7", salary: 100000 },
  dev_8: { name: "fixture_8", salary: 100000 },
  dev_9: { name: "fixture_9", salary: 100000 },
  dev_10: { name: "fixture_10", salary: 100000 },
  poor_jamis: {
    name: "Jamis",
    salary: 9000,
  },
};
