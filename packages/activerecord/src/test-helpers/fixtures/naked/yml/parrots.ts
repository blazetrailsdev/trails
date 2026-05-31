// activerecord/test/fixtures/naked/yml/parrots.yml
// Has columns "arrr" and "foobar" which do not exist on the parrots table.
// Rails raises FixtureError: table "parrots" has no columns named "arrr", "foobar".
// Seeding this data via the tableless path should throw an unknown-column error.
export const nakedYmlParrotsFixtureData = {
  george: { arrr: "Curious George", foobar: "Foobar" },
};
