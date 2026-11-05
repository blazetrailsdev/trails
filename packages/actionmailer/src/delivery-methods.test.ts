import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionView } from "@blazetrails/actionpack";
import { assertCalled, assertNothingRaised } from "@blazetrails/activesupport";
import { Message, SMTP, TestMailer } from "@blazetrails/mail";
import { Dir, NoMethodError, RuntimeError, TopLevel } from "@blazetrails/ruby-compat";
import { Base as ActionMailerBase } from "./base.js";
import type { DeliveryMethodsClass } from "./delivery-methods.js";
import type { MessageDelivery } from "./message-delivery.js";

class MyCustomDelivery {}

class MyOptionedDelivery {
  options: Record<string, unknown>;
  constructor(options: Record<string, unknown>) {
    this.options = options;
  }
}

class BogusDelivery {
  constructor(..._args: unknown[]) {}

  deliverBang(_mail: unknown): never {
    throw new RuntimeError("failed");
  }
}

type Settings = Record<string, unknown>;
const Base = ActionMailerBase as typeof ActionMailerBase &
  DeliveryMethodsClass & { smtpSettings: Settings };
const settingsOf = (name: string) => (Base as unknown as Record<string, Settings>)[name];

describe("DefaultsDeliveryMethodsTest", () => {
  it("default smtp settings", () => {
    const settings = {
      address: "localhost",
      port: 25,
      domain: "localhost.localdomain",
      userName: null,
      password: null,
      authentication: null,
      enableStarttlsAuto: true,
    };
    expect(Base.smtpSettings).toEqual(settings);
  });

  it("default file delivery settings (with Rails.root)", () => {
    const root = TopLevel.Trails?.root?.();
    const settings = { location: root != null ? `${root}/tmp/mails` : `${Dir.tmpdir()}/mails` };
    expect(settingsOf("fileSettings")).toEqual(settings);
  });

  it("default sendmail settings", () => {
    const settings = {
      location: "/usr/sbin/sendmail",
      arguments: ["-i"],
    };
    expect(settingsOf("sendmailSettings")).toEqual(settings);
  });
});

describe("CustomDeliveryMethodsTest", () => {
  let oldDeliveryMethod: typeof Base.deliveryMethod;

  beforeEach(() => {
    oldDeliveryMethod = Base.deliveryMethod;
    Base.addDeliveryMethod("custom", MyCustomDelivery);
  });

  afterEach(() => {
    Base.deliveryMethod = oldDeliveryMethod;
    const newMethods: Record<string, unknown> = { ...Base.deliveryMethods };
    delete newMethods.custom;
    Base.deliveryMethods = newMethods;
  });

  it("allow to add custom delivery method", () => {
    Base.deliveryMethod = "custom";
    expect(Base.deliveryMethod).toBe("custom");
  });

  it("allow to customize custom settings", () => {
    (Base as unknown as Record<string, Settings>).customSettings = { foo: "bar" };
    expect(settingsOf("customSettings")).toEqual({ foo: "bar" });
  });

  it("respond to custom settings", () => {
    expect(Base).toRespondTo("customSettings");
    expect(Object.getOwnPropertyDescriptor(Base, "customSettings")?.set).toBeTypeOf("function");
  });

  it("does not respond to unknown settings", () => {
    expect(() => (Base as unknown as { anotherSettings(): unknown }).anotherSettings()).toThrow(
      TypeError,
    );
    expect(NoMethodError).toBeDefined();
  });
});

class DeliveryMailer extends ActionMailerBase {
  static DEFAULT_HEADERS = {
    to: "mikel@test.lindsaar.net",
    from: "jose@test.plataformatec.com",
  };

  static {
    this.prependViewPath(
      new ActionView.FixtureResolver({ "delivery-mailer/welcome.html.tse": "" }),
    );
  }

  welcome(hash: Record<string, unknown> = {}) {
    return this.mail({ ...DeliveryMailer.DEFAULT_HEADERS, ...hash });
  }
}
const Mailer = DeliveryMailer as typeof DeliveryMailer & {
  welcome(hash?: Record<string, unknown>): MessageDelivery;
};

describe("MailDeliveryTest", () => {
  let oldDeliveryMethod: typeof Base.deliveryMethod;

  beforeEach(() => {
    oldDeliveryMethod = DeliveryMailer.deliveryMethod;
  });

  afterEach(() => {
    DeliveryMailer.deliveryMethod = oldDeliveryMethod;
    DeliveryMailer.deliveries.length = 0;
  });

  it("ActionMailer should be told when Mail gets delivered", async () => {
    DeliveryMailer.deliveryMethod = "test";
    await assertCalled(
      DeliveryMailer as unknown as { deliverMail(): void },
      "deliverMail",
      null,
      {},
      async () => {
        await Mailer.welcome().deliverNow();
      },
    );
  });

  // BLOCKED: stub-any-instance-does-not-intercept-js-new
  it.skip("delivery method can be customized per instance", () => {});

  it("delivery method can be customized in subclasses not changing the parent", async () => {
    DeliveryMailer.deliveryMethod = "test";
    expect(Base.deliveryMethod).toBe("smtp");
    const email = (await Mailer.welcome().deliverNow()) as Message;
    expect(email.deliveryMethod()).toBeInstanceOf(TestMailer);
  });

  it("delivery method options default to class level options", async () => {
    const defaultOptions = { a: "b" };
    Base.addDeliveryMethod("optioned", MyOptionedDelivery, defaultOptions);
    const mailInstance = await Mailer.welcome({ deliveryMethod: "optioned" }).message();
    expect((mailInstance.deliveryMethod() as MyOptionedDelivery).options).toEqual(defaultOptions);
  });

  it("delivery method options can be overridden per mail instance", async () => {
    const defaultOptions = { a: "b" };
    Base.addDeliveryMethod("optioned", MyOptionedDelivery, defaultOptions);
    const overriddenOptions = { a: "a" };
    const mailInstance = await Mailer.welcome({
      deliveryMethod: "optioned",
      deliveryMethodOptions: overriddenOptions,
    }).message();
    expect((mailInstance.deliveryMethod() as MyOptionedDelivery).options).toEqual(
      overriddenOptions,
    );
  });

  it("default delivery options can be overridden per mail instance", async () => {
    const settings = {
      address: "localhost",
      port: 25,
      domain: "localhost.localdomain",
      userName: null,
      password: null,
      authentication: null,
      enableStarttlsAuto: true,
    };
    expect(Base.smtpSettings).toEqual(settings);
    const overriddenOptions = { userName: "overridden", password: "somethingobtuse" };
    const mailInstance = await Mailer.welcome({
      deliveryMethodOptions: overriddenOptions,
    }).message();
    const deliveryMethodInstance = mailInstance.deliveryMethod() as SMTP;
    expect(deliveryMethodInstance.settings.userName).toBe("overridden");
    expect(deliveryMethodInstance.settings.password).toBe("somethingobtuse");
    expect(deliveryMethodInstance.settings).toEqual({
      ...deliveryMethodInstance.settings,
      ...overriddenOptions,
    });

    expect(Base.smtpSettings).toEqual(settings);
  });

  it("non registered delivery methods raises errors", async () => {
    DeliveryMailer.deliveryMethod = "unknown";
    const error = await Mailer.welcome()
      .deliverNow()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RuntimeError);
    expect((error as Error).message).toBe("Invalid delivery method :unknown");
  });

  it("undefined delivery methods raises errors", async () => {
    DeliveryMailer.deliveryMethod = null;
    const error = await Mailer.welcome()
      .deliverNow()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RuntimeError);
    expect((error as Error).message).toBe("Delivery method cannot be nil");
  });

  // BLOCKED: stub-any-instance-does-not-intercept-js-new
  it.skip("does not perform deliveries if requested", () => {});

  it("does not append the deliveries collection if told not to perform the delivery", async () => {
    const oldPerformDeliveries = DeliveryMailer.performDeliveries;
    try {
      DeliveryMailer.performDeliveries = false;
      await Mailer.welcome().deliverNow();
      expect(DeliveryMailer.deliveries).toEqual([]);
    } finally {
      DeliveryMailer.performDeliveries = oldPerformDeliveries;
    }
  });

  it("raise errors on bogus deliveries", async () => {
    DeliveryMailer.deliveryMethod = BogusDelivery;
    await expect(Mailer.welcome().deliverNow()).rejects.toThrow(RuntimeError);
  });

  it("does not increment the deliveries collection on error", async () => {
    DeliveryMailer.deliveryMethod = BogusDelivery;
    await expect(Mailer.welcome().deliverNow()).rejects.toThrow(RuntimeError);
    expect(DeliveryMailer.deliveries).toEqual([]);
  });

  it("does not raise errors on bogus deliveries if set", async () => {
    const oldRaiseDeliveryErrors = DeliveryMailer.raiseDeliveryErrors;
    try {
      DeliveryMailer.deliveryMethod = BogusDelivery;
      DeliveryMailer.raiseDeliveryErrors = false;
      await assertNothingRaised(async () => {
        await Mailer.welcome().deliverNow();
      });
    } finally {
      DeliveryMailer.raiseDeliveryErrors = oldRaiseDeliveryErrors;
    }
  });

  it("does not increment the deliveries collection on bogus deliveries", async () => {
    const oldRaiseDeliveryErrors = DeliveryMailer.raiseDeliveryErrors;
    try {
      DeliveryMailer.deliveryMethod = BogusDelivery;
      DeliveryMailer.raiseDeliveryErrors = false;
      await Mailer.welcome().deliverNow();
      expect(DeliveryMailer.deliveries).toEqual([]);
    } finally {
      DeliveryMailer.raiseDeliveryErrors = oldRaiseDeliveryErrors;
    }
  });
});
