import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/authors.yml
export const authorFixtureData = {
  david: {
    id: 1,
    name: "David",
    author_address_id: ref("author_addresses", "david_address"),
    author_address_extra_id: ref("author_addresses", "david_address_extra"),
    owned_essay_id: "A Modest Proposal",
    organization_id: "No Such Agency",
  },
  mary: {
    id: 2,
    name: "Mary",
    author_address_id: ref("author_addresses", "mary_address"),
  },
  bob: {
    id: 3,
    name: "Bob",
    author_address_id: ref("author_addresses", "bob_address"),
  },
};
