import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/companies.yml
// STI hierarchy: Company (base) / Firm / Client / DependentFirm / ExclusivelyDependentFirm
// Schema gap: Rails schema also carries rating, description, ruby_on_rails_id, account_id,
// account_limit, metadata — omitted; test-fixtures.ts Company only declares name/type/firm_id/client_of.
// first_firm.firm_id is a self-ref in the Rails YAML (id=1 pointing to itself); omitted to avoid
// circular insertion ordering issues.
export const companyFixtureData = {
  first_firm: {
    type: "Firm",
    name: "37signals",
    // firm_name exists in Rails YAML but is not a column — stored as firm_name on clients only
  },
  first_client: {
    type: "Client",
    firm_id: ref("companies", "first_firm"),
    // client_of: 2 (first_client itself in Rails YAML — omitted, self-circular)
    name: "Summit",
    firm_name: "37signals",
  },
  second_client: {
    type: "Client",
    firm_id: ref("companies", "first_firm"),
    client_of: ref("companies", "first_firm"),
    name: "Microsoft",
  },
  another_firm: {
    type: "Firm",
    name: "Flamboyant Software",
  },
  another_client: {
    type: "Client",
    firm_id: ref("companies", "another_firm"),
    client_of: ref("companies", "another_firm"),
    name: "Ex Nihilo",
  },
  a_third_client: {
    type: "Client",
    firm_id: ref("companies", "another_firm"),
    client_of: ref("companies", "another_firm"),
    name: "Ex Nihilo Part Deux",
  },
  rails_core: {
    type: "DependentFirm",
    name: "RailsCore",
  },
  leetsoft: {
    // no type in Rails YAML — falls back to Company base class
    name: "Leetsoft",
    client_of: ref("companies", "rails_core"),
  },
  jadedpixel: {
    // no type in Rails YAML — falls back to Company base class
    name: "Jadedpixel",
    client_of: ref("companies", "rails_core"),
  },
  odegy: {
    type: "ExclusivelyDependentFirm",
    name: "Odegy",
  },
  another_first_firm_client: {
    type: "Client",
    firm_id: ref("companies", "first_firm"),
    client_of: ref("companies", "first_firm"),
    name: "Apex",
    firm_name: "37signals",
  },
  recursive_association_fk: {
    type: "Firm",
    name: "RVshare",
  },
};
