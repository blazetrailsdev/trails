import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/authors.yml
export const authorFixtureData = {
  david: {
    name: "David",
    author_address_id: ref("author_addresses", "david_address"),
    author_address_extra_id: ref("author_addresses", "david_address_extra"),
    owned_essay_id: ref("essays", "a modest proposal"),
    organization_id: "No Such Agency",
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
