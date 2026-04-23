import { describe, it, expect } from "vitest";
import {
  AdditionalValue,
  ExtendedEncryptableType,
  RelationQueries,
} from "./extended-deterministic-queries.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { NullEncryptor } from "./null-encryptor.js";

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
  it("unwraps AdditionalValues from _encryptionExpansion to produce the current-scheme ciphertext", () => {
    // _encryptionExpansion is set by RelationQueries.where when processArguments expands
    // the condition. scopeForCreate reads it directly, bypassing WhereClause.toH() which
    // cannot extract OR chains that ArrayHandler produces for object values.
    const type = makeType(true);
    const prevType = makeType(true);
    const avCurrent = new AdditionalValue("plain@example.com", type);
    const avPrev = new AdditionalValue("plain@example.com", prevType);

    const model = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const relation = {
      _modelClass: model,
      _encryptionExpansion: { email: [avCurrent, avPrev] },
    };

    const originalScopeForCreate = () => ({});
    const result = RelationQueries.scopeForCreate(originalScopeForCreate, relation);
    expect(result.email).toBe(avCurrent.value);
  });

  it("leaves attributes alone when no expansion context is present", () => {
    const type = makeType(true);
    const model = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const relation = { _modelClass: model };

    const originalScopeForCreate = () => ({ email: "plain@example.com" });
    const result = RelationQueries.scopeForCreate(originalScopeForCreate, relation);
    expect(result.email).toBe("plain@example.com");
  });

  it("skips non-deterministic encrypted attributes", () => {
    const type = makeType(false);
    const av = new AdditionalValue("enc", type);
    const model = {
      _encryptedAttributes: new Set(["body"]),
      _attributeDefinitions: new Map([["body", { type }]]),
    };
    const relation = {
      _modelClass: model,
      _encryptionExpansion: { body: [av] },
    };

    const originalScopeForCreate = () => ({});
    const result = RelationQueries.scopeForCreate(originalScopeForCreate, relation);
    expect(result.body).toBeUndefined();
  });

  it("RelationQueries.where stores expansion context on the returned relation", () => {
    // Need a type with previousTypes so processArguments actually expands the condition.
    const prevScheme = new Scheme({ deterministic: true, encryptor: new NullEncryptor() });
    const type = new EncryptedAttributeType({
      scheme: new Scheme({
        deterministic: true,
        encryptor: new NullEncryptor(),
        previousSchemes: [prevScheme],
      }),
    });
    const model = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const returnedRelation: any = { _modelClass: model };
    const originalWhere = (_args: unknown) => returnedRelation;
    const result = RelationQueries.where(originalWhere, { _modelClass: model }, [
      { email: "x@example.com" },
    ]) as any;
    expect(result._encryptionExpansion).toBeDefined();
    expect(Array.isArray(result._encryptionExpansion.email)).toBe(true);
    expect(result._encryptionExpansion.email[0]).toBeInstanceOf(AdditionalValue);
  });
});
