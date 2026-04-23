import { describe, it, expect } from "vitest";
import {
  AdditionalValue,
  ExtendedEncryptableType,
  RelationQueries,
} from "./extended-deterministic-queries.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { NullEncryptor } from "./null-encryptor.js";
import { Base } from "../base.js";
import { createTestAdapter } from "../test-adapter.js";
import "../relation.js";

describe("ActiveRecord::Encryption::ExtendedDeterministicQueriesTest", () => {
  it.skip("Finds records when data is unencrypted", () => {});
  it.skip("Finds records when data is encrypted", () => {});
  it.skip("Works well with downcased attributes", () => {});
  it.skip("Works well with string attribute names", () => {});
  it.skip("find_or_create_by works", () => {});
  it.skip("does not mutate arguments", () => {});
  it.skip("where(...).first_or_create works", () => {});
  it.skip("exists?(...) works", () => {});
  it.skip("If support_unencrypted_data is opted out at the attribute level, cannot find unencrypted data", () => {});
  it.skip("If support_unencrypted_data is opted out at the attribute level, can find encrypted data", () => {});
  it.skip("If support_unencrypted_data is opted in at the attribute level, can find unencrypted data", () => {});
  it.skip("If support_unencrypted_data is opted in at the attribute level, can find encrypted data", () => {});
});

function makeType(deterministic = true): EncryptedAttributeType {
  return new EncryptedAttributeType({
    scheme: new Scheme({ deterministic, encryptor: new NullEncryptor() }),
  });
}

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries::AdditionalValue", () => {
  it("stores the serialized value", () => {
    const type = makeType();
    const av = new AdditionalValue("hello", type);
    expect(av.type).toBe(type);
    expect(av.value).toBe("hello");
  });

  it("toString returns the string value", () => {
    const type = makeType();
    const av = new AdditionalValue("hello", type);
    expect(String(av)).toBe(String(av.value));
  });

  it("[Symbol.toPrimitive] with number hint returns the numeric value", () => {
    const type = makeType();
    const av = new AdditionalValue("42", type);
    expect(+av).toBe(42);
  });
});

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries::ExtendedEncryptableType", () => {
  it("passes AdditionalValue through without re-serializing", () => {
    const type = makeType();
    const av = new AdditionalValue("hello", type);
    const serialize = (v: unknown) => `serialized(${v})`;
    expect(ExtendedEncryptableType.serialize(serialize, av)).toBe(av.value);
  });

  it("delegates to originalSerialize for non-AdditionalValue", () => {
    const serialize = (v: unknown) => `serialized(${v})`;
    expect(ExtendedEncryptableType.serialize(serialize, "hello")).toBe("serialized(hello)");
  });
});

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries::RelationQueries#scopeForCreate", () => {
  it("unwraps AdditionalValues from whereValuesHash() to produce the current-scheme ciphertext", () => {
    const type = makeType(true);
    const prevType = makeType(true);
    const avCurrent = new AdditionalValue("plain@example.com", type);
    const avPrev = new AdditionalValue("plain@example.com", prevType);

    const model = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const relation = {
      model,
      whereValuesHash: () => ({ email: [avCurrent, avPrev] }),
    };

    const result = RelationQueries.scopeForCreate(() => ({}), relation);
    expect(result.email).toBe(avCurrent.value);
  });

  it("leaves attributes alone when whereValuesHash has no matching entry", () => {
    const type = makeType(true);
    const model = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const relation = { model, whereValuesHash: () => ({}) };

    const result = RelationQueries.scopeForCreate(() => ({ email: "plain@example.com" }), relation);
    expect(result.email).toBe("plain@example.com");
  });

  it("skips non-deterministic encrypted attributes", () => {
    const type = makeType(false);
    const av = new AdditionalValue("enc", type);
    const model = {
      _encryptedAttributes: new Set(["body"]),
      _attributeDefinitions: new Map([["body", { type }]]),
    };
    const relation = { model, whereValuesHash: () => ({ body: [av] }) };

    const result = RelationQueries.scopeForCreate(() => ({}), relation);
    expect(result.body).toBeUndefined();
  });

  it("ignores scalar (non-array) where values", () => {
    const type = makeType(true);
    const model = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const relation = {
      model,
      whereValuesHash: () => ({ email: "plain@example.com" }),
    };
    const result = RelationQueries.scopeForCreate(() => ({}), relation);
    expect(result.email).toBeUndefined();
  });

  it("reads IN-array values from a real Relation via whereValuesHash() (integration)", () => {
    const adapter = createTestAdapter();
    class Contact extends Base {
      static {
        this._tableName = "contacts";
        this.attribute("id", "integer");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }
    const rel = Contact.all().where({ email: ["a@x", "b@x"] });
    expect(rel.whereValuesHash()).toEqual({ email: ["a@x", "b@x"] });
    // scope_for_create filters the IN array out (Rails: equality_only=true).
    expect(rel.scopeForCreate()).toEqual({});
  });

  it("unwraps AdditionalValue trailers end-to-end on a real Relation", () => {
    const adapter = createTestAdapter();
    const type = makeType(true);
    const prevType = makeType(true);

    class Contact extends Base {
      static {
        this._tableName = "contacts";
        this.attribute("id", "integer");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }
    (Contact as any)._encryptedAttributes = new Set(["email"]);
    const defs = (Contact as any)._attributeDefinitions as Map<string, { type: unknown }>;
    defs.set("email", { type });

    const avCurrent = new AdditionalValue("plain@example.com", type);
    const avPrev = new AdditionalValue("plain@example.com", prevType);
    const rel = Contact.all().where({ email: [avCurrent, avPrev] });

    const hash = rel.whereValuesHash();
    expect(Array.isArray(hash.email)).toBe(true);
    expect((hash.email as unknown[])[0]).toBe(avCurrent);

    const scope = RelationQueries.scopeForCreate(() => ({}), rel);
    expect(scope.email).toBe(avCurrent.value);
  });
});
