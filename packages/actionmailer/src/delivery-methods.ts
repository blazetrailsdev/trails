import {
  Concern,
  cattrAccessor,
  classAttribute,
  extend,
  type Included,
} from "@blazetrails/activesupport";
import { FileDelivery, Sendmail, SMTP, TestMailer, type Message } from "@blazetrails/mail";
import { Dir, RuntimeError, TopLevel, rbInspect } from "@blazetrails/ruby-compat";
import { ActionMailer } from "./namespaces.js";

type Settings = Record<string, unknown>;

interface DeliveryMethodsClass {
  deliveryMethods: Readonly<Record<string, unknown>>;
  deliveryMethod: unknown;
  performDeliveries: boolean;
  raiseDeliveryErrors: boolean;
  [settings: `${string}Settings`]: Settings | null | undefined;
  addDeliveryMethod(symbol: string, klass: unknown, defaultOptions?: Settings): void;
}

export function addDeliveryMethod(
  this: DeliveryMethodsClass,
  symbol: string,
  klass: unknown,
  defaultOptions: Settings = {},
): void {
  if (!(`${symbol}Settings` in this)) classAttribute.call(this, `${symbol}Settings`);
  this[`${symbol}Settings`] = defaultOptions;
  this.deliveryMethods = Object.freeze({ ...this.deliveryMethods, [symbol]: klass });
}

/** @internal */
export function wrapDeliveryBehavior(
  this: DeliveryMethodsClass,
  mail: Message,
  method: unknown = null,
  options: unknown = null,
): void {
  if (method == null || method === false) method = this.deliveryMethod;
  mail.deliveryHandler = this;

  if (method == null) {
    throw new RuntimeError("Delivery method cannot be nil");
  } else if (typeof method === "string") {
    const klass = this.deliveryMethods[method];
    if (klass != null) {
      mail.deliveryMethod(klass, {
        ...(this[`${method}Settings`] ?? {}),
        ...((options as Settings | null) ?? {}),
      });
    } else {
      throw new RuntimeError(`Invalid delivery method ${rbInspect(`:${method}`)}`);
    }
  } else {
    mail.deliveryMethod(method);
  }

  mail.performDeliveries = this.performDeliveries;
  mail.raiseDeliveryErrors = this.raiseDeliveryErrors;
}

export const ClassMethods = {
  get deliveries(): Message[] {
    return TestMailer.deliveries;
  },
  set deliveries(value: Message[]) {
    TestMailer.deliveries = value;
  },
  addDeliveryMethod,
  wrapDeliveryBehavior,
};

/** @internal */
export function wrapDeliveryBehaviorBang(
  this: {
    message: unknown;
    constructor: { wrapDeliveryBehavior(mail: Message, ...args: unknown[]): void };
  },
  ...args: unknown[]
): void {
  this.constructor.wrapDeliveryBehavior(this.message as Message, ...args);
}

export const DeliveryMethods = { ClassMethods, wrapDeliveryBehaviorBang };
extend(DeliveryMethods, Concern);
Concern.included.call(DeliveryMethods as never, null, function (this: DeliveryMethodsClass) {
  cattrAccessor.call(this, "raiseDeliveryErrors", { default: true });
  cattrAccessor.call(this, "performDeliveries", { default: true });

  classAttribute.call(this, "deliveryMethods", { default: Object.freeze({}) });
  classAttribute.call(this, "deliveryMethod", { default: "smtp" });

  this.addDeliveryMethod("smtp", SMTP, {
    address: "localhost",
    port: 25,
    domain: "localhost.localdomain",
    userName: null,
    password: null,
    authentication: null,
    enableStarttlsAuto: true,
  });

  this.addDeliveryMethod("file", FileDelivery, {
    location:
      TopLevel.Trails?.root != null
        ? `${TopLevel.Trails.root()}/tmp/mails`
        : `${Dir.tmpdir()}/mails`,
  });

  this.addDeliveryMethod("sendmail", Sendmail, {
    location: "/usr/sbin/sendmail",
    arguments: ["-i"],
  });

  this.addDeliveryMethod("test", TestMailer);
});

export type DeliveryMethodsIncluded = Included<typeof DeliveryMethods>;

ActionMailer.DeliveryMethods = DeliveryMethods;
