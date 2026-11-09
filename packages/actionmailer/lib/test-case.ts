import {
  Concern,
  camelize,
  classAttribute,
  constantize,
  extend,
  runLoadHooks,
  underscore,
} from "@blazetrails/activesupport";
import { ConstantLookup } from "@blazetrails/activesupport/testing/constant-lookup";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import * as DomAssertions from "@blazetrails/actionview/rails-dom-testing/assertions/dom-assertions";
import * as SelectorAssertions from "@blazetrails/actionview/rails-dom-testing/assertions/selector-assertions";
import { Encodings, Mail, type Message } from "@blazetrails/mail";
import { File, IO, StandardError, TopLevel, include, rbModName } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import "./base.js";
import { ActionMailer } from "./namespaces.js";
import { TestHelper } from "./test-helper.js";
import "./constants.test-case.generated.js";

export class NonInferrableMailerError extends StandardError {
  constructor(name: unknown) {
    super(
      `Unable to determine the mailer to test from ${String(name)}. ` +
        "You'll need to specify it using tests YourMailer in your " +
        "test case definition",
    );
  }
}

interface BehaviorClass {
  name: string;
  _mailerClass: typeof Base | null;
  setup(...args: unknown[]): void;
  teardown(...args: unknown[]): void;
  tests(mailer: unknown): typeof Base;
  determineDefaultMailer(name: string): typeof Base;
  determineConstantFromTestName(testName: string, block: (constant: unknown) => unknown): unknown;
}

/** @internal */
function clearTestDeliveries(): void {
  if (ActionMailer.Base.deliveryMethod === "test") {
    ActionMailer.Base.deliveries.length = 0;
  }
}

export const ClearTestDeliveries = { clearTestDeliveries };
extend(ClearTestDeliveries, Concern);
Concern.included.call(ClearTestDeliveries as never, null, function (this: BehaviorClass) {
  this.setup(":clearTestDeliveries");
  this.teardown(":clearTestDeliveries");
});

export const ClassMethods = {
  tests(this: BehaviorClass, mailer: unknown): typeof Base {
    if (typeof mailer === "string") {
      return (this._mailerClass = constantize(camelize(mailer)) as typeof Base);
    } else if (typeof mailer === "function") {
      return (this._mailerClass = mailer as typeof Base);
    } else {
      throw new NonInferrableMailerError(mailer);
    }
  },

  mailerClass(this: BehaviorClass): typeof Base {
    const mailer = this._mailerClass;
    if (mailer != null) {
      return mailer;
    } else {
      return this.tests(this.determineDefaultMailer(rbModName(this)!));
    }
  },

  determineDefaultMailer(this: BehaviorClass, name: string): typeof Base {
    const mailer = this.determineConstantFromTestName(name, (constant) => {
      return typeof constant === "function" && constant.prototype instanceof ActionMailer.Base;
    });
    if (mailer == null) throw new NonInferrableMailerError(name);
    return mailer as typeof Base;
  },
};

export interface Behavior extends Omit<TestHelper, "beforeSetup" | "afterTeardown"> {
  expected: Message;
  _oldPerformDeliveries: boolean;
  _oldDeliveryMethod: unknown;
  readFixture(action: string): Promise<string[]>;
  initializeTestDeliveries(): void;
  restoreTestDeliveries(): void;
  setDeliveryMethod(method: unknown): void;
  restoreDeliveryMethod(): void;
  setExpectedMail(): void;
  charset(): string;
  encode(subject: string): string;
}

export const Behavior = {
  ClassMethods,

  async readFixture(this: Behavior, action: string): Promise<string[]> {
    const klass = this.constructor as unknown as typeof ClassMethods;
    return await IO.readlinesAsync(
      File.join(
        TopLevel.Trails!.root() as string,
        "test",
        "fixtures",
        underscore(rbModName(klass.mailerClass.call(klass as never))!),
        action,
      ),
    );
  },

  /** @internal */
  initializeTestDeliveries(this: Behavior): void {
    this.setDeliveryMethod("test");
    this._oldPerformDeliveries = ActionMailer.Base.performDeliveries;
    ActionMailer.Base.performDeliveries = true;
    ActionMailer.Base.deliveries.length = 0;
  },

  /** @internal */
  restoreTestDeliveries(this: Behavior): void {
    this.restoreDeliveryMethod();
    ActionMailer.Base.performDeliveries = this._oldPerformDeliveries;
  },

  /** @internal */
  setDeliveryMethod(this: Behavior, method: unknown): void {
    this._oldDeliveryMethod = ActionMailer.Base.deliveryMethod;
    ActionMailer.Base.deliveryMethod = method as typeof Base.deliveryMethod;
  },

  /** @internal */
  restoreDeliveryMethod(this: Behavior): void {
    ActionMailer.Base.deliveries.length = 0;
    ActionMailer.Base.deliveryMethod = this._oldDeliveryMethod as typeof Base.deliveryMethod;
  },

  /** @internal */
  setExpectedMail(this: Behavior): void {
    this.expected = Mail.new();
    this.expected.contentType(["text", "plain", { charset: this.charset() }]);
    this.expected.setMimeVersion("1.0");
  },

  /** @internal */
  charset(): string {
    return "UTF-8";
  },

  /** @internal */
  encode(this: Behavior, subject: string): string {
    return Encodings.qValueEncode(subject, this.charset());
  },
};
extend(Behavior, Concern);
include(Behavior, ConstantLookup);
include(Behavior, TestHelper);
include(Behavior, SelectorAssertions);
include(Behavior, DomAssertions);
Concern.included.call(Behavior as never, null, function (this: BehaviorClass) {
  classAttribute.call(this, "_mailerClass", { default: null });
  this.setup(":initializeTestDeliveries");
  this.setup(":setExpectedMail");
  this.teardown(":restoreTestDeliveries");
  runLoadHooks("action_mailer_test_case", this);
});

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Behavior` (`actionmailer/lib/action_mailer/test_case.rb:123`). */
export interface TestCase extends Behavior {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class TestCase extends ActiveSupportTestCase {
  declare static tests: OmitThisParameter<typeof ClassMethods.tests>;
  declare static mailerClass: OmitThisParameter<typeof ClassMethods.mailerClass>;
  declare static determineDefaultMailer: OmitThisParameter<
    typeof ClassMethods.determineDefaultMailer
  >;

  static ClearTestDeliveries = ClearTestDeliveries;
  static Behavior = Behavior;
}
include(TestCase, Behavior);

ActionMailer.TestCase = TestCase;
ActionMailer.NonInferrableMailerError = NonInferrableMailerError;
