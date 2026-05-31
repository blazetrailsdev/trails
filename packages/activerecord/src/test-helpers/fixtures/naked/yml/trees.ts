// activerecord/test/fixtures/naked/yml/trees.yml
// Symbol keys (:id, :name) — Rails strips the leading colon before inserting.
// The equivalent TS data uses plain string keys.
export const nakedYmlTreesFixtureData = {
  root: { id: 1, name: "The Root" },
};
