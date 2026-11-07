import { describe, expect, it, type TestContext } from "vitest";
import type {} from "@blazetrails/activesupport/testing/autorun";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { TopLevel, constSet, include } from "@blazetrails/ruby-compat";
import { Base } from "../lib/base.js";
import { TestCase } from "../lib/test-case.js";

class TestTestMailer extends Base {}
constSet(TopLevel, "TestTestMailer", TestTestMailer);

class ClearTestDeliveriesMixinTest extends ActiveSupportTestCase {
  _originalDeliveryMethod: unknown;

  override async beforeSetup(): Promise<void> {
    [Base.deliveryMethod, this._originalDeliveryMethod] = ["test", Base.deliveryMethod];
    Base.deliveries.push("better clear me, setup" as never);
    await super.beforeSetup();
  }

  override async afterTeardown(): Promise<void> {
    await super.afterTeardown();
    expect(Base.deliveries).toEqual([]);
    Base.deliveryMethod = this._originalDeliveryMethod as typeof Base.deliveryMethod;
  }
}
include(ClearTestDeliveriesMixinTest, TestCase.ClearTestDeliveries);
constSet(TopLevel, "ClearTestDeliveriesMixinTest", ClearTestDeliveriesMixinTest);

describe("ClearTestDeliveriesMixinTest", () => {
  it("deliveries are cleared on setup and teardown", () => {
    expect(Base.deliveries).toEqual([]);
    Base.deliveries.push("better clear me, teardown" as never);
  });
});

class MailerDeliveriesClearingTest extends TestCase {
  override async beforeSetup(): Promise<void> {
    Base.deliveries.push("better clear me, setup" as never);
    await super.beforeSetup();
  }

  override async afterTeardown(): Promise<void> {
    await super.afterTeardown();
    expect(Base.deliveries).toEqual([]);
  }
}
constSet(TopLevel, "MailerDeliveriesClearingTest", MailerDeliveriesClearingTest);

describe("MailerDeliveriesClearingTest", () => {
  it("deliveries are cleared on setup and teardown", () => {
    expect(Base.deliveries).toEqual([]);
    Base.deliveries.push("better clear me, teardown" as never);
  });
});

class ManuallySetNameMailerTest extends TestCase {
  static {
    this.tests(TestTestMailer);
  }
}
constSet(TopLevel, "ManuallySetNameMailerTest", ManuallySetNameMailerTest);

describe("ManuallySetNameMailerTest", () => {
  it("set mailer class manual", ({ testCase }: TestContext) => {
    expect((testCase.constructor as typeof TestCase).mailerClass()).toBe(TestTestMailer);
  });
});

class ManuallySetSymbolNameMailerTest extends TestCase {
  static {
    this.tests("test_test_mailer");
  }
}
constSet(TopLevel, "ManuallySetSymbolNameMailerTest", ManuallySetSymbolNameMailerTest);

describe("ManuallySetSymbolNameMailerTest", () => {
  it("set mailer class manual using symbol", ({ testCase }: TestContext) => {
    expect((testCase.constructor as typeof TestCase).mailerClass()).toBe(TestTestMailer);
  });
});

class ManuallySetStringNameMailerTest extends TestCase {
  static {
    this.tests("test_test_mailer");
  }
}
constSet(TopLevel, "ManuallySetStringNameMailerTest", ManuallySetStringNameMailerTest);

describe("ManuallySetStringNameMailerTest", () => {
  it("set mailer class manual using string", ({ testCase }: TestContext) => {
    expect((testCase.constructor as typeof TestCase).mailerClass()).toBe(TestTestMailer);
  });
});
