import { afterEach, describe, expect, it } from "vitest";
import { BigDecimal, assertEmpty, assertNotEmpty } from "@blazetrails/activesupport";
import { DecimalType } from "@blazetrails/activemodel";
import { Base, RecordInvalid } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import { Topic } from "./test-helpers/models/topic.js";
import { WrongReply } from "./test-helpers/models/reply.js";
import { Developer } from "./test-helpers/models/developer.js";
import { Parrot } from "./test-helpers/models/parrot.js";
import { Company } from "./test-helpers/models/company.js";
import { PriceEstimate } from "./test-helpers/models/price-estimate.js";

describe("ValidationsTest", () => {
  fixtures(["topics", "developers"]);

  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("valid uses create context when new", async () => {
    const r = new WrongReply();
    r.title = "Wrong Create";
    expect(await r.isValid()).toBeFalsy();
    expect(r.errors.messagesFor("title").length > 0).toBeTruthy();
    expect(r.errors.messagesFor("title")).toEqual(["is Wrong Create"]);
  });

  it("valid uses update context when persisted", async () => {
    const r = new WrongReply();
    r.title = "Bad";
    r.content = "Good";
    expect(await r.save()).toBeTruthy();

    r.title = "Wrong Update";
    expect(await r.isValid()).toBeFalsy();

    expect(r.errors.messagesFor("title").length > 0).toBeTruthy();
    expect(r.errors.messagesFor("title")).toEqual(["is Wrong Update"]);
  });

  it("valid using special context", async () => {
    const r = new WrongReply({ title: "Valid title" });
    expect(await r.isValid("specialCase")).toBeFalsy();
    expect(r.errors.messagesFor("author_name").join("")).toBe("Invalid");

    r.author_name = "secret";
    r.content = "Good";
    expect(await r.isValid("specialCase")).toBeTruthy();

    r.author_name = null as unknown as string;
    expect(await r.isValid("specialCase")).toBeFalsy();
    expect(r.errors.messagesFor("author_name").join("")).toBe("Invalid");

    r.author_name = "secret";
    expect(await r.isValid("specialCase")).toBeTruthy();
  });

  it("invalid using multiple contexts", async () => {
    const r = new WrongReply({ title: "Wrong Create" });
    expect(await r.isInvalid(["specialCase", "create"])).toBeTruthy();
    expect(r.errors.messagesFor("author_name").join("")).toBe("Invalid");
    expect(r.errors.messagesFor("title").join("")).toBe("is Wrong Create");
  });

  it("validate", async () => {
    const r = new WrongReply();

    await r.validate();
    assertEmpty(r.errors.messagesFor("author_name"));

    await r.validate("specialCase");
    assertNotEmpty(r.errors.messagesFor("author_name"));

    r.author_name = "secret";

    await r.validate("specialCase");
    assertEmpty(r.errors.messagesFor("author_name"));
  });

  it("invalid record exception", async () => {
    await expect(WrongReply.createBang()).rejects.toThrow(RecordInvalid);
    await expect(new WrongReply().saveBang()).rejects.toThrow(RecordInvalid);

    const r = new WrongReply();
    let invalid: RecordInvalid | undefined;
    await expect(
      r.saveBang().catch((e) => {
        invalid = e;
        throw e;
      }),
    ).rejects.toThrow(RecordInvalid);
    expect(invalid!.record).toBe(r);
  });

  it("validate with bang", async () => {
    await expect(async () => new WrongReply().validateBang()).rejects.toThrow(RecordInvalid);
  });

  it("validate with bang and context", async () => {
    await expect(async () => new WrongReply().validateBang("specialCase")).rejects.toThrow(
      RecordInvalid,
    );
    const r = new WrongReply({ title: "Valid title", author_name: "secret", content: "Good" });
    expect(await r.validateBang("specialCase")).toBeTruthy();
  });

  it("exception on create bang many", async () => {
    await expect(
      WrongReply.createBang([{ title: "OK" }, { title: "Wrong Create" }]),
    ).rejects.toThrow(RecordInvalid);
  });

  it("exception on create bang with block", async () => {
    await expect(
      WrongReply.createBang({ title: "OK" }, (r: WrongReply) => {
        r.content = null as unknown as string;
      }),
    ).rejects.toThrow(RecordInvalid);
  });

  it("exception on create bang many with block", async () => {
    await expect(
      WrongReply.createBang([{ title: "OK" }, { title: "Wrong Create" }], (r: WrongReply) => {
        r.content = null as unknown as string;
      }),
    ).rejects.toThrow(RecordInvalid);
  });

  it("save without validation", async () => {
    const reply = new WrongReply();
    expect(await reply.save()).toBeFalsy();
    expect(await reply.save({ validate: false })).toBeTruthy();
  });

  it("validates acceptance of with non existent table", () => {
    class IncorporealModel extends Base {}

    expect(() => IncorporealModel.validatesAcceptanceOf("incorporeal_column")).not.toThrow();
  });

  it("throw away typing", async () => {
    const d = new Developer({ name: "David", salary: "100,000" });
    expect(await d.isValid()).toBeFalsy();
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

  it("numericality validation with mutation", async () => {
    class Klass extends Topic {
      static name = "Topic";
    }
    Klass.attribute("wibble", "string");
    Klass.validatesNumericalityOf("wibble", { onlyInteger: true });

    const topic = Klass.new({ wibble: "123-4567" });
    topic.writeAttribute("wibble", String(topic.readAttribute("wibble")).replaceAll("-", ""));

    expect(await topic.isValid()).toBeTruthy();
  });

  it("numericality validation checks against raw value", async () => {
    class Klass extends Topic {
      static name = "Topic";
    }
    Klass.attribute("wibble", new DecimalType({ scale: 2, precision: 9 }));
    Klass.validatesNumericalityOf("wibble", { greaterThanOrEqualTo: new BigDecimal("97.18") });

    for (const rawValue of ["97.179", 97.179, new BigDecimal("97.179")]) {
      const subject = Klass.new({ wibble: rawValue });
      expect((subject.readAttribute("wibble") as BigDecimal).toString()).toBe("97.18");
      expect(await subject.isValid()).toBeTruthy();
    }

    for (const rawValue of ["97.174", 97.174, new BigDecimal("97.174")]) {
      const subject = Klass.new({ wibble: rawValue });
      expect((subject.readAttribute("wibble") as BigDecimal).toString()).toBe("97.17");
      expect(await subject.isValid()).toBeFalsy();
    }
  });

  it("numericality validator wont be affected by custom getter", async () => {
    const priceEstimate = new PriceEstimate({ price: 50 });

    expect(priceEstimate.price).toBe("$50.00");
    expect(priceEstimate.readAttributeBeforeTypeCast("price")).toBe(50);
    expect(priceEstimate.readAttribute("price")).toBe(50);

    expect(
      (priceEstimate as unknown as { priceCameFromUser: boolean }).priceCameFromUser,
    ).toBeTruthy();
    expect(await priceEstimate.isValid()).toBeTruthy();

    await priceEstimate.saveBang();

    expect(
      (priceEstimate as unknown as { priceCameFromUser: boolean }).priceCameFromUser,
    ).toBeFalsy();
    expect(await priceEstimate.isValid()).toBeTruthy();
  });

  it("acceptance validator doesnt require db connection", async () => {
    class Klass extends Base {
      static _tableName = "posts";
    }
    void Klass.resetColumnInformation();

    await assertNoQueries(false, () => {
      Klass.validatesAcceptanceOf("foo");
    });
  });
});
