import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Client } from "./test-helpers/models/company.js";
import { isFinderNeedsTypeCondition } from "./inheritance.js";
import { Author } from "./test-helpers/models/author.js";

describe("_instantiate STI dispatch", () => {
  fixtures([]);

  it("keeps a row without the inheritance column on the receiver subclass", () => {
    const record = Client._instantiate({ id: "7", name: "Acme" });

    expect(record).toBeInstanceOf(Client);
  });
});

describe("descends_from_active_record? column test", () => {
  fixtures(["authors"]);

  it("a virtual type attribute is not an inheritance column", () => {
    class VirtualTypeAuthor extends Author {
      static {
        this.attribute("type", "string");
      }
    }

    expect(VirtualTypeAuthor.isDescendsFromActiveRecord()).toBe(true);
  });
});

describe("ensure_proper_type on an unreflected subclass", () => {
  fixtures([]);

  it("writes the sti name without a membership guard", () => {
    class ColdClient extends Client {}

    expect(isFinderNeedsTypeCondition(ColdClient)).toBe(true);
    expect(new ColdClient({}).type).toBe("ColdClient");
  });
});

describe("descends_from_active_record? on a cold model", () => {
  it("a virtual type attribute on an unreflected model is not an inheritance column", () => {
    class ColdVirtualTypeAuthor extends Author {
      static {
        this.attribute("type", "string");
      }
    }

    expect(ColdVirtualTypeAuthor.isDescendsFromActiveRecord()).toBe(true);
  });
});

describe("initialize_dup ensure_proper_type", () => {
  fixtures(["companies"]);

  it("rewrites the inheritance column on the copy", async () => {
    const client = await Client.create({ name: "Acme" });
    client.writeAttribute("type", "Company");
    expect(client.readAttribute("type")).toBe("Company");

    const duped = client.dup();

    expect(duped.readAttribute("type")).toBe("Client");
  });
});
