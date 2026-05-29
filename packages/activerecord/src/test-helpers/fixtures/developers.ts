// activerecord/test/fixtures/developers.yml
export const developerFixtureData = {
  david: {
    id: 1,
    name: "David",
    salary: 80000,
    // Rails YAML carries `shared_computers: laptop`, but that's the
    // `has_and_belongs_to_many :shared_computers` association — it
    // materializes into the `computers_developers` join table (HABTM
    // join-table loader is a #2572 followup), not a `developers` column.
  },
  jamis: {
    id: 2,
    name: "Jamis",
    salary: 150000,
  },
  dev_3: { id: 3, name: "fixture_3", salary: 100000 },
  dev_4: { id: 4, name: "fixture_4", salary: 100000 },
  dev_5: { id: 5, name: "fixture_5", salary: 100000 },
  dev_6: { id: 6, name: "fixture_6", salary: 100000 },
  dev_7: { id: 7, name: "fixture_7", salary: 100000 },
  dev_8: { id: 8, name: "fixture_8", salary: 100000 },
  dev_9: { id: 9, name: "fixture_9", salary: 100000 },
  dev_10: { id: 10, name: "fixture_10", salary: 100000 },
  poor_jamis: {
    id: 11,
    name: "Jamis",
    salary: 9000,
  },
};
