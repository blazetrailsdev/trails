// activerecord/test/fixtures/primary_key_error/primary_key_error.yml
// _fixture: model_class: Author
// This fixture intentionally triggers FixtureSetPrimaryKeyError: owned_essay
// is a belongs_to with primaryKey: :name, but Essay.primary_key is :id.
export const primaryKeyErrorFixtureData = {
  david: {
    name: "David",
    ownedEssay: "a_modest_proposal",
  },
};
