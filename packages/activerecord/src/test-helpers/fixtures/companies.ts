import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/companies.yml
// STI hierarchy: Company (base) / Firm / Client / DependentFirm / ExclusivelyDependentFirm
export const companyFixtureData = {
  first_firm: {
    id: 1,
    type: "Firm",
    name: "37signals",
    firm_id: ref("companies", "first_firm"),
  },
  first_client: {
    id: 2,
    type: "Client",
    firm_id: ref("companies", "first_firm"),
    client_of: ref("companies", "first_client"),
    name: "Summit",
    firm_name: "37signals",
  },
  second_client: {
    id: 3,
    type: "Client",
    firm_id: ref("companies", "first_firm"),
    client_of: ref("companies", "first_firm"),
    name: "Microsoft",
  },
  another_firm: {
    id: 4,
    type: "Firm",
    name: "Flamboyant Software",
  },
  another_client: {
    id: 5,
    type: "Client",
    firm_id: ref("companies", "another_firm"),
    client_of: ref("companies", "another_firm"),
    name: "Ex Nihilo",
  },
  a_third_client: {
    id: 10,
    type: "Client",
    firm_id: ref("companies", "another_firm"),
    client_of: ref("companies", "another_firm"),
    name: "Ex Nihilo Part Deux",
  },
  rails_core: {
    id: 6,
    type: "DependentFirm",
    name: "RailsCore",
  },
  leetsoft: {
    id: 7,
    // no type in Rails YAML — falls back to Company base class
    name: "Leetsoft",
    client_of: ref("companies", "rails_core"),
  },
  jadedpixel: {
    id: 8,
    // no type in Rails YAML — falls back to Company base class
    name: "Jadedpixel",
    client_of: ref("companies", "rails_core"),
  },
  odegy: {
    id: 9,
    type: "ExclusivelyDependentFirm",
    name: "Odegy",
  },
  another_first_firm_client: {
    id: 11,
    type: "Client",
    firm_id: ref("companies", "first_firm"),
    client_of: ref("companies", "first_firm"),
    name: "Apex",
    firm_name: "37signals",
  },
  recursive_association_fk: {
    id: 15,
    type: "Firm",
    name: "RVshare",
  },
};
