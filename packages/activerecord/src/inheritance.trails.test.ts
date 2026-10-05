import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Client, Company } from "./test-helpers/models/company.js";
import { ProtectedParams } from "./support/stubs/strong-parameters.js";
import { initializeClone, isFinderNeedsTypeCondition } from "./inheritance.js";
import { Author } from "./test-helpers/models/author.js";

describe("_instantiate STI dispatch", () => {
  fixtures([]);

  it("keeps a row without the inheritance column on the receiver subclass", () => {
    const record = Client._instantiate({ id: "7", name: "Acme" });

    expect(record).toBeInstanceOf(Client);
  });
});

describe("compute_type candidates cache", () => {
  fixtures(["authors"]);

  it("remembers the candidate that resolved, per class", () => {
    expect(Client.computeType("Author")).toBe(Author);

    const cache = (Client as unknown as { _typeCandidatesCache: Map<string, string> })
      ._typeCandidatesCache;
    expect(Object.prototype.hasOwnProperty.call(Client, "_typeCandidatesCache")).toBe(true);
    expect(cache.get("Author")).toBe("Author");
    expect(Client.computeType("Author")).toBe(Author);
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

describe("becomes! inheritance column writer", () => {
  fixtures([]);

  it("assigns the sti type through the inheritance column writer", () => {
    const written: unknown[] = [];
    class WriterClient extends Client {}
    Object.defineProperty(WriterClient.prototype, "type", {
      get(this: Client) {
        return this.readAttribute("type");
      },
      set(this: Client, value: unknown) {
        written.push(value);
        this.writeAttribute("type", value);
      },
    });

    const became = new Client({}).becomesBang(WriterClient);

    expect(written).toEqual(["WriterClient"]);
    expect(became.type).toBe("WriterClient");
  });
});

describe("Inheritance::ClassMethods#initialize_clone", () => {
  fixtures([]);

  it("runs the inherited hook, then recomputes the base class on the copy", () => {
    const copy = Object.create(Client) as typeof Client & {
      _computedBaseClass?: unknown;
      initializeClone(other: unknown): void;
    };

    copy.initializeClone(Client);

    expect(Object.prototype.hasOwnProperty.call(copy, "_computedBaseClass")).toBe(true);
    expect(copy._computedBaseClass).toBe(Client.baseClass);
  });

  it("calls super with the original before set_base_class", () => {
    const calls: unknown[] = [];
    const copy = Object.create(Client) as typeof Client;

    initializeClone.call(copy, (other) => calls.push(other), Client);

    expect(calls).toEqual([Client]);
  });
});

describe("subclass_from_attributes with permitted parameters", () => {
  fixtures([]);

  it("converts parameters with to_h before reading the inheritance column", () => {
    const params = new ProtectedParams({ type: "Client" }).permitBang();

    expect(Company.subclassFromAttributes(params as never)).toBe(Client);
  });

  it("reads the inheritance column from a Map", () => {
    expect(Company.subclassFromAttributes(new Map([["type", "Client"]]) as never)).toBe(Client);
  });
});
