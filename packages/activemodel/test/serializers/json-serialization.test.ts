import { describe, it, expect, beforeEach } from "vitest";
import { ActiveSupportJSON, asJson } from "@blazetrails/activesupport";
import { Contact } from "../models/contact.js";
import { Address } from "../models/address.js";

describe("JsonSerializationTest", () => {
  let contact: Contact;

  beforeEach(() => {
    contact = new Contact({});
    contact.name = "Konata Izumi";
    contact.address = new Address({
      addressLine: "Cantonment Road",
      city: "Trichy",
      state: "Tamil Nadu",
      country: "India",
    });
    contact.age = 16;
    contact.createdAt = new Date(Date.UTC(2006, 7, 1));
    contact.awesome = true;
    contact.preferences = { shows: "anime" };
  });

  it("should not include root in JSON (class method)", () => {
    const json = contact.toJSON();

    expect(json).not.toMatch(/^\{"contact":\{/);
    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).toMatch(/"age":16/);
    expect(json).toContain(
      `"createdAt":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`,
    );
    expect(json).toMatch(/"awesome":true/);
    expect(json).toMatch(/"preferences":\{"shows":"anime"\}/);
  });

  it("should include root in JSON if include_root_in_json is true", () => {
    const originalIncludeRootInJson = Contact.includeRootInJson;
    Contact.includeRootInJson = true;
    try {
      const json = contact.toJSON();

      expect(json).toMatch(/^\{"contact":\{/);
      expect(json).toMatch(/"name":"Konata Izumi"/);
      expect(json).toMatch(/"age":16/);
      expect(json).toContain(
        `"createdAt":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`,
      );
      expect(json).toMatch(/"awesome":true/);
      expect(json).toMatch(/"preferences":\{"shows":"anime"\}/);
    } finally {
      Contact.includeRootInJson = originalIncludeRootInJson;
    }
  });

  it("should include root in JSON (option) even if the default is set to false", () => {
    const json = contact.toJSON({ root: true });

    expect(json).toMatch(/^\{"contact":\{/);
  });

  it("should not include root in JSON (option)", () => {
    const json = contact.toJSON({ root: false });

    expect(json).not.toMatch(/^\{"contact":\{/);
  });

  it("should include custom root in JSON", () => {
    const json = contact.toJSON({ root: "json_contact" });

    expect(json).toMatch(/^\{"json_contact":\{/);
    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).toMatch(/"age":16/);
    expect(json).toContain(
      `"createdAt":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`,
    );
    expect(json).toMatch(/"awesome":true/);
    expect(json).toMatch(/"preferences":\{"shows":"anime"\}/);
  });

  it("should encode all encodable attributes", () => {
    const json = contact.toJSON();

    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).toMatch(/"age":16/);
    expect(json).toContain(
      `"createdAt":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`,
    );
    expect(json).toMatch(/"awesome":true/);
    expect(json).toMatch(/"preferences":\{"shows":"anime"\}/);
  });

  it("should allow attribute filtering with only", () => {
    const json = contact.toJSON({ only: ["name", "age"] });

    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).toMatch(/"age":16/);
    expect(json).not.toMatch(/"awesome":true/);
    expect(json).not.toContain(
      `"createdAt":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`,
    );
    expect(json).not.toMatch(/"preferences":\{"shows":"anime"\}/);
  });

  it("should allow attribute filtering with except", () => {
    const json = contact.toJSON({ except: ["name", "age"] });

    expect(json).not.toMatch(/"name":"Konata Izumi"/);
    expect(json).not.toMatch(/"age":16/);
    expect(json).toMatch(/"awesome":true/);
    expect(json).toContain(
      `"createdAt":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`,
    );
    expect(json).toMatch(/"preferences":\{"shows":"anime"\}/);
  });

  it("methods are called on object", () => {
    const fixture = contact as unknown as Record<string, unknown>;
    fixture.label = () => "Has cheezburger";
    fixture.favoriteQuote = () => "Constraints are liberating";

    expect(contact.toJSON({ only: "name", methods: ["label"] })).toMatch(
      /"label":"Has cheezburger"/,
    );

    const methodsJson = contact.toJSON({ only: "name", methods: ["label", "favorite_quote"] });
    expect(methodsJson).toMatch(/"label":"Has cheezburger"/);
    expect(methodsJson).toMatch(/"favorite_quote":"Constraints are liberating"/);
  });

  it("should return Hash for errors", () => {
    const c = new Contact({});
    c.errors.add("name", "can't be blank");
    c.errors.add("name", "is too short (minimum is 2 characters)");
    c.errors.add("age", "must be 16 or over");

    const hash: Record<string, string[]> = {};
    hash["name"] = ["can't be blank", "is too short (minimum is 2 characters)"];
    hash["age"] = ["must be 16 or over"];
    expect(c.errors.toJSON()).toEqual(ActiveSupportJSON.encode(hash));
  });

  it("serializable_hash should not modify options passed in argument", () => {
    const options: { except?: string; only?: string } = { except: "name" };
    contact.serializableHash(options);

    expect(options.only).toBeUndefined();
    expect(options.except).toEqual("name");
  });

  it("as_json should serialize timestamps", () => {
    expect(contact.asJson()["createdAt"]).toEqual("2006-08-01T00:00:00.000Z");
  });

  it("as_json should return a hash if include_root_in_json is true", () => {
    const originalIncludeRootInJson = Contact.includeRootInJson;
    Contact.includeRootInJson = true;
    try {
      const json = contact.asJson();

      expect(json).toBeInstanceOf(Object);
      expect(json["contact"]).toBeInstanceOf(Object);
      for (const field of ["name", "age", "createdAt", "awesome", "preferences"]) {
        expect((json["contact"] as Record<string, unknown>)[field]).toEqual(
          asJson((contact as unknown as Record<string, unknown>)[field]),
        );
      }
    } finally {
      Contact.includeRootInJson = originalIncludeRootInJson;
    }
  });

  it("as_json should work with root option set to true", () => {
    const json = contact.asJson({ root: true });

    expect(json).toBeInstanceOf(Object);
    expect(json["contact"]).toBeInstanceOf(Object);
    for (const field of ["name", "age", "createdAt", "awesome", "preferences"]) {
      expect((json["contact"] as Record<string, unknown>)[field]).toEqual(
        asJson((contact as unknown as Record<string, unknown>)[field]),
      );
    }
  });

  it("as_json should work with root option set to string", () => {
    const json = contact.asJson({ root: "connection" });

    expect(json).toBeInstanceOf(Object);
    expect(json["connection"]).toBeInstanceOf(Object);
    for (const field of ["name", "age", "createdAt", "awesome", "preferences"]) {
      expect((json["connection"] as Record<string, unknown>)[field]).toEqual(
        asJson((contact as unknown as Record<string, unknown>)[field]),
      );
    }
  });

  it("as_json should allow attribute filtering with except", () => {
    const json = contact.asJson({ except: ["age", "createdAt", "awesome", "preferences"] });

    expect(json).toBeInstanceOf(Object);
    expect(json).toEqual({ name: "Konata Izumi" });
  });

  it("as_json should allow attribute filtering with only", () => {
    const json = contact.asJson({ only: "name" });

    expect(json).toBeInstanceOf(Object);
    expect(json).toEqual({ name: "Konata Izumi" });
  });

  it("as_json should work with methods options", () => {
    const json = contact.asJson({ methods: ["social"] });

    expect(json).toBeInstanceOf(Object);
    for (const field of ["name", "age", "createdAt", "awesome", "preferences", "social"]) {
      const value = (contact as unknown as Record<string, unknown>)[field];
      expect(json[field]).toEqual(
        asJson(typeof value === "function" ? (value as () => unknown).call(contact) : value),
      );
    }
  });

  it("as_json should work with include option", () => {
    const json = contact.asJson({ include: "address" });

    expect(json).toBeInstanceOf(Object);
    expect(json["address"]).toBeInstanceOf(Object);
    for (const field of ["name", "age", "createdAt", "awesome", "preferences"]) {
      expect(json[field]).toEqual(asJson((contact as unknown as Record<string, unknown>)[field]));
    }
    for (const field of ["addressLine", "city", "state", "country"]) {
      expect((json["address"] as Record<string, unknown>)[field]).toEqual(
        asJson((contact.address as Record<string, unknown>)[field]),
      );
    }
  });

  it("as_json should work with include option paired with only filter", () => {
    const json = contact.asJson({ include: { address: { only: "city" } } });

    expect(json).toBeInstanceOf(Object);
    for (const field of ["name", "age", "createdAt", "awesome", "preferences"]) {
      expect(json[field]).toEqual(asJson((contact as unknown as Record<string, unknown>)[field]));
    }
    expect(json["address"]).toEqual({ city: "Trichy" });
  });

  it("as_json should work with include option paired with except filter", () => {
    const json = contact.asJson({
      include: { address: { except: ["addressLine", "state", "country"] } },
    });

    expect(json).toBeInstanceOf(Object);
    for (const field of ["name", "age", "createdAt", "awesome", "preferences"]) {
      expect(json[field]).toEqual(asJson((contact as unknown as Record<string, unknown>)[field]));
    }
    expect(json["address"]).toEqual({ city: "Trichy" });
  });

  it("from_json should work without a root (class attribute)", () => {
    const json = contact.toJSON();
    const result = new Contact({}).fromJson(json);

    expect(result.name).toEqual(contact.name);
    expect(result.age).toEqual(contact.age);
    expect(new Date(result.createdAt as string)).toEqual(contact.createdAt);
    expect(result.awesome).toEqual(contact.awesome);
    expect(result.preferences).toEqual(contact.preferences);
  });

  it("from_json should work without a root (method parameter)", () => {
    const json = contact.toJSON();
    const result = new Contact({}).fromJson(json, false);

    expect(result.name).toEqual(contact.name);
    expect(result.age).toEqual(contact.age);
    expect(new Date(result.createdAt as string)).toEqual(contact.createdAt);
    expect(result.awesome).toEqual(contact.awesome);
    expect(result.preferences).toEqual(contact.preferences);
  });

  it("from_json should work with a root (method parameter)", () => {
    const json = contact.toJSON({ root: ":true" });
    const result = new Contact({}).fromJson(json, true);

    expect(result.name).toEqual(contact.name);
    expect(result.age).toEqual(contact.age);
    expect(new Date(result.createdAt as string)).toEqual(contact.createdAt);
    expect(result.awesome).toEqual(contact.awesome);
    expect(result.preferences).toEqual(contact.preferences);
  });

  it("custom as_json should be honored when generating json", () => {
    (contact as unknown as Record<string, unknown>).asJson = function (this: Contact) {
      return { name: this.name, createdAt: this.createdAt };
    };
    const json = contact.toJSON();

    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).toMatch(
      new RegExp(`"createdAt":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`),
    );
    expect(json).not.toMatch(/"awesome":/);
    expect(json).not.toMatch(/"preferences":/);
  });

  it("custom as_json options should be extensible", () => {
    const superAsJson = Contact.prototype.asJson;
    (contact as unknown as Record<string, unknown>).asJson = function (
      this: Contact,
      options: Record<string, unknown> = {},
    ) {
      return superAsJson.call(this, { ...options, only: ["name"] });
    };
    const json = contact.toJSON();

    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).not.toMatch(
      new RegExp(`"createdAt":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`),
    );
    expect(json).not.toMatch(/"awesome":/);
    expect(json).not.toMatch(/"preferences":/);
  });

  it("Class.model_name should be JSON encodable", () => {
    expect(ActiveSupportJSON.encode(Contact.modelName)).toMatch(/"Contact"/);
  });
});
