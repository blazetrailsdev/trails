/**
 * Mirrors: activerecord/test/cases/validations_test.rb
 *
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Rails declares `repair_validations(Topic)` so any validators a test adds to
 * Topic are cleared afterward; the ported tests only add validators to
 * anonymous subclasses of Topic (`Class.new(Topic)`), so Topic itself is never
 * mutated. We still clear Topic's validators in `afterEach` to mirror the
 * repair behavior exactly.
 */
import { afterEach, describe, expect, it, beforeAll } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { DecimalType } from "@blazetrails/activemodel";
import { Base, RecordInvalid, registerModel } from "../index.js";
import { fixtures, setupFixtures } from "../test-helpers/fixtures.js";
import { assertNoQueries } from "../testing/query-assertions.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply, WrongReply } from "../test-helpers/models/reply.js";
import { Developer } from "../test-helpers/models/developer.js";
import { Parrot } from "../test-helpers/models/parrot.js";
import { Company } from "../test-helpers/models/company.js";
import { PriceEstimate } from "../test-helpers/models/price-estimate.js";

setupFixtures();

// `isAttributeCameFromUser` is mixed into Base instances but not surfaced on the
// model's declared instance type, so narrow it through a typed shim.
function cameFromUser(record: object, attr: string): boolean {
  return (record as { isAttributeCameFromUser(a: string): boolean }).isAttributeCameFromUser(attr);
}

describe("ValidationsTest", () => {
  // Rails `fixtures :topics, :developers`. Loading the topics set registers the
  // Topic/Reply STI subtree; loading developers builds the developers table.
  fixtures(["topics", "developers"]);

  beforeAll(() => {
    registerModel("Topic", Topic);
    registerModel("Reply", Reply);
    registerModel("WrongReply", WrongReply);
    registerModel("Developer", Developer);
    registerModel("Parrot", Parrot);
    registerModel("Company", Company);
    registerModel("PriceEstimate", PriceEstimate);
  });

  // Rails: `repair_validations(Topic)` — Topic is never mutated by these tests,
  // but mirror the cleanup anyway.
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("valid uses create context when new", () => {
    const r = new WrongReply();
    r.title = "Wrong Create";
    expect(r.isValid()).toBe(false);
    expect(r.errors.messagesFor("title").length).toBeGreaterThan(0);
    expect(r.errors.messagesFor("title")).toEqual(["is Wrong Create"]);
  });

  it("valid uses update context when persisted", async () => {
    const r = new WrongReply();
    r.title = "Bad";
    r.content = "Good";
    expect(await r.save()).toBe(true);

    r.title = "Wrong Update";
    expect(r.isValid()).toBe(false);

    expect(r.errors.messagesFor("title").length).toBeGreaterThan(0);
    expect(r.errors.messagesFor("title")).toEqual(["is Wrong Update"]);
  });

  it("valid using special context", () => {
    const r = new WrongReply({ title: "Valid title" });
    expect(r.isValid("specialCase")).toBe(false);
    expect(r.errors.messagesFor("author_name").join("")).toBe("Invalid");

    r.author_name = "secret";
    r.content = "Good";
    expect(r.isValid("specialCase")).toBe(true);

    r.author_name = null as unknown as string;
    expect(r.isValid("specialCase")).toBe(false);
    expect(r.errors.messagesFor("author_name").join("")).toBe("Invalid");

    r.author_name = "secret";
    expect(r.isValid("specialCase")).toBe(true);
  });

  it("invalid using multiple contexts", () => {
    const r = new WrongReply({ title: "Wrong Create" });
    expect(r.isInvalid(["specialCase", "create"])).toBe(true);
    expect(r.errors.messagesFor("author_name").join("")).toBe("Invalid");
    expect(r.errors.messagesFor("title").join("")).toBe("is Wrong Create");
  });

  it("validate", () => {
    const r = new WrongReply();

    r.validate();
    expect(r.errors.messagesFor("author_name")).toEqual([]);

    r.validate("specialCase");
    expect(r.errors.messagesFor("author_name").length).toBeGreaterThan(0);

    r.author_name = "secret";

    r.validate("specialCase");
    expect(r.errors.messagesFor("author_name")).toEqual([]);
  });

  it("invalid record exception", async () => {
    await expect(WrongReply.createBang()).rejects.toBeInstanceOf(RecordInvalid);
    await expect(new WrongReply().saveBang()).rejects.toBeInstanceOf(RecordInvalid);

    const r = new WrongReply();
    const invalid = await r.saveBang().catch((e) => e);
    expect(invalid).toBeInstanceOf(RecordInvalid);
    expect(invalid.record).toBe(r);
  });

  it("validate with bang", async () => {
    await expect(async () => new WrongReply().validateBang()).rejects.toBeInstanceOf(RecordInvalid);
  });

  it("validate with bang and context", async () => {
    await expect(async () => new WrongReply().validateBang("specialCase")).rejects.toBeInstanceOf(
      RecordInvalid,
    );
    const r = new WrongReply({ title: "Valid title", author_name: "secret", content: "Good" });
    expect(r.validateBang("specialCase")).toBe(true);
  });

  it("exception on create bang many", async () => {
    await expect(
      WrongReply.createBang([{ title: "OK" }, { title: "Wrong Create" }]),
    ).rejects.toBeInstanceOf(RecordInvalid);
  });

  it("exception on create bang with block", async () => {
    await expect(
      WrongReply.createBang({ title: "OK" }, (r: WrongReply) => {
        r.content = null as unknown as string;
      }),
    ).rejects.toBeInstanceOf(RecordInvalid);
  });

  it("exception on create bang many with block", async () => {
    await expect(
      WrongReply.createBang([{ title: "OK" }, { title: "Wrong Create" }], (r: WrongReply) => {
        r.content = null as unknown as string;
      }),
    ).rejects.toBeInstanceOf(RecordInvalid);
  });

  it("save without validation", async () => {
    const reply = new WrongReply();
    expect(await reply.save()).toBe(false);
    expect(await reply.save({ validate: false })).toBe(true);
  });

  it("validates acceptance of with non existent table", () => {
    class IncorporealModel extends Base {}

    expect(() => IncorporealModel.validatesAcceptanceOf("incorporeal_column")).not.toThrow();
  });

  it("throw away typing", () => {
    const d = new Developer({ name: "David", salary: "100,000" });
    expect(d.isValid()).toBe(false);
    expect(d.salary).toBe(100);
    expect(d.readAttributeBeforeTypeCast("salary")).toBe("100,000");
  });

  it("validates acceptance of with undefined attribute methods", () => {
    class Klass extends Topic {
      static name = "Topic";
    }
    Klass.validatesAcceptanceOf("approved");
    const topic = Klass.new({ approved: true });
    Klass.undefineAttributeMethods();
    expect(topic.readAttribute("approved")).toBeTruthy();
  });

  it("validates acceptance of as database column", async () => {
    class Klass extends Topic {
      static name = "Topic";
    }
    Klass.validatesAcceptanceOf("approved");
    const topic = await Klass.create({ approved: true });
    expect(topic.readAttribute("approved")).toBeTruthy();
  });

  it("validators", () => {
    expect(Parrot.validators().length).toBe(1);
    expect(Company.validators().length).toBe(1);
    expect(Parrot.validatorsOn("name").length).toBe(1);
    expect(Company.validatorsOn("name").length).toBe(1);
  });

  it("numericality validation with mutation", () => {
    class Klass extends Topic {
      static name = "Topic";
    }
    Klass.attribute("wibble", "string", { virtual: true });
    Klass.validatesNumericalityOf("wibble", { onlyInteger: true });

    const topic = Klass.new({ wibble: "123-4567" });
    // Ruby mutates the string in place with `gsub!`; JS strings are immutable,
    // so reassign the cleaned value — the behavior under test is that the
    // current attribute value (now all digits) validates.
    topic.writeAttribute("wibble", String(topic.readAttribute("wibble")).replaceAll("-", ""));

    expect(topic.isValid()).toBe(true);
  });

  it("numericality validation checks against raw value", () => {
    class Klass extends Topic {
      static name = "Topic";
    }
    Klass.attribute("wibble", new DecimalType({ scale: 2, precision: 9 }), { virtual: true });
    Klass.validatesNumericalityOf("wibble", { greaterThanOrEqualTo: new BigDecimal("97.18") });

    for (const rawValue of ["97.179", 97.179, new BigDecimal("97.179")]) {
      const subject = Klass.new({ wibble: rawValue });
      expect((subject.readAttribute("wibble") as BigDecimal).toString()).toBe("97.18");
      expect(subject.isValid()).toBe(true);
    }

    for (const rawValue of ["97.174", 97.174, new BigDecimal("97.174")]) {
      const subject = Klass.new({ wibble: rawValue });
      expect((subject.readAttribute("wibble") as BigDecimal).toString()).toBe("97.17");
      expect(subject.isValid()).toBe(false);
    }
  });

  it("numericality validator wont be affected by custom getter", async () => {
    const priceEstimate = new PriceEstimate({ price: 50 });

    expect(priceEstimate.price).toBe("$50.00");
    expect(priceEstimate.readAttributeBeforeTypeCast("price")).toBe(50);
    expect(priceEstimate.readAttribute("price")).toBe(50);

    expect(cameFromUser(priceEstimate, "price")).toBe(true);
    expect(priceEstimate.isValid()).toBe(true);

    await priceEstimate.saveBang();

    expect(cameFromUser(priceEstimate, "price")).toBe(false);
    expect(priceEstimate.isValid()).toBe(true);
  });

  it("acceptance validator doesnt require db connection", async () => {
    class Klass extends Base {
      static _tableName = "posts";
    }
    Klass.resetColumnInformation();

    await assertNoQueries(false, () => {
      Klass.validatesAcceptanceOf("foo");
    });
  });
});
