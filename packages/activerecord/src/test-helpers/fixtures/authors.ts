import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/authors.yml
// Schema gap: author_address_extra_id and owned_essay_id exist in the Rails schema and YAML
// but are not declared in test-fixtures.ts Author. They'll insert fine against the real DB
// schema; add attribute() declarations to the test model when needed.
export const authorFixtureData = {
  david: {
    name: "David",
    author_address_id: ref("author_addresses", "david_address"),
    author_address_extra_id: ref("author_addresses", "david_address_extra"),
    organization_id: "No Such Agency",
    owned_essay_id: "A Modest Proposal",
  },
  mary: {
    name: "Mary",
    author_address_id: ref("author_addresses", "mary_address"),
  },
  bob: {
    name: "Bob",
    author_address_id: ref("author_addresses", "bob_address"),
  },
};
