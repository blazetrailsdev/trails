import { AbstractController } from "@blazetrails/actionpack";
import {
  camelize,
  classAttribute,
  constantize,
  include,
  isAnonymous,
  isPresent,
  Notifications,
  presence,
  underscore,
  type EventPayload,
} from "@blazetrails/activesupport";
import { Address, Mail, type Message } from "@blazetrails/mail";
import { NoMethodError, rbModName } from "@blazetrails/ruby-compat";
import { Callbacks } from "./callbacks.js";
import { ActionMailer } from "./namespaces.js";
import { Rescuable } from "./rescuable.js";

type Observer = Parameters<typeof Mail.registerObserver>[0];
type Interceptor = Parameters<typeof Mail.registerInterceptor>[0];

export class Base extends AbstractController.Base {
  declare static defaultParams: Readonly<Record<string, unknown>>;

  /** @internal */
  protected static _mailerName?: string;

  static registerObservers(...observers: unknown[]): void {
    for (const observer of observers.flat(Infinity).filter((x) => x != null)) {
      this.registerObserver(observer as Observer | string);
    }
  }

  static unregisterObservers(...observers: unknown[]): void {
    for (const observer of observers.flat(Infinity).filter((x) => x != null)) {
      this.unregisterObserver(observer as Observer | string);
    }
  }

  static registerInterceptors(...interceptors: unknown[]): void {
    for (const interceptor of interceptors.flat(Infinity).filter((x) => x != null)) {
      this.registerInterceptor(interceptor as Interceptor | string);
    }
  }

  static unregisterInterceptors(...interceptors: unknown[]): void {
    for (const interceptor of interceptors.flat(Infinity).filter((x) => x != null)) {
      this.unregisterInterceptor(interceptor as Interceptor | string);
    }
  }

  static registerObserver(observer: Observer | string): void {
    Mail.registerObserver(this.observerClassFor(observer) as Observer);
  }

  static unregisterObserver(observer: Observer | string): void {
    Mail.unregisterObserver(this.observerClassFor(observer) as Observer);
  }

  static registerInterceptor(interceptor: Interceptor | string): void {
    Mail.registerInterceptor(this.observerClassFor(interceptor) as Interceptor);
  }

  static unregisterInterceptor(interceptor: Interceptor | string): void {
    Mail.unregisterInterceptor(this.observerClassFor(interceptor) as Interceptor);
  }

  /** @internal */
  protected static observerClassFor(value: unknown): unknown {
    if (typeof value === "string") {
      return constantize(camelize(value));
    } else {
      return value;
    }
  }

  static mailerName(): string {
    if (!Object.hasOwn(this, "_mailerName") || this._mailerName == null) {
      this._mailerName = isAnonymous(this) ? "anonymous" : underscore(rbModName(this)!);
    }
    return this._mailerName;
  }

  static setMailerName(value: string): void {
    this._mailerName = value;
  }

  static override controllerPath(): string {
    return this.mailerName();
  }

  static default(value: Record<string, unknown> | null = null): Readonly<Record<string, unknown>> {
    if (value != null) this.defaultParams = Object.freeze({ ...this.defaultParams, ...value });
    return this.defaultParams;
  }

  static set defaultOptions(value: Record<string, unknown> | null) {
    this.default(value);
  }

  /** @internal */
  static deliverMail<T>(mail: Message, block: () => T): T {
    return Notifications.instrument("deliver.action_mailer", {}, (payload) => {
      this.setPayloadForMail(payload, mail);
      return block();
    }) as T;
  }

  static emailAddressWithName(address: string, name: string | null): string {
    const builder = new Address();
    builder.setAddress(address);
    builder.setDisplayName(presence(name));
    return builder.toString();
  }

  /** @internal */
  protected static setPayloadForMail(payload: EventPayload, mail: Message): void {
    payload.mail = mail.encoded();
    payload.mailer = rbModName(this);
    payload.messageId = mail.messageId();
    payload.subject = mail.subject();
    payload.to = mail.to();
    payload.from = mail.from();
    if (isPresent(mail.bcc())) payload.bcc = mail.bcc();
    if (isPresent(mail.cc())) payload.cc = mail.cc();
    payload.date = mail.date();
    payload.performDeliveries = mail.performDeliveries;
  }

  /** @internal */
  static methodMissing(methodName: string, ...args: unknown[]): unknown {
    if (this.actionMethods().includes(methodName)) {
      return new ActionMailer.MessageDelivery!(this, methodName, ...args);
    } else {
      throw new NoMethodError(`undefined method '${methodName}' for class ${rbModName(this)}`);
    }
  }

  /** @internal */
  static respondToMissing(method: string, _includeAll = false): boolean {
    return this.actionMethods().includes(method);
  }

  /** @internal */
  _mailWasCalled: boolean;
  /** @internal */
  _message: Message | NullMail;

  get message(): Message | NullMail {
    return this._message;
  }
  set message(value: Message | NullMail) {
    this._message = value;
  }

  constructor() {
    super();
    this._mailWasCalled = false;
    this._message = Mail.new();
  }

  /**
   * @internal
   * @inlinedFrom ActionMailer::Rescuable#process rails/v8.0.2/actionmailer/lib/action_mailer/rescuable.rb:27-31
   */
  override async process(methodName: string, ...args: unknown[]): Promise<unknown> {
    const payload = {
      mailer: rbModName(this.constructor),
      action: methodName,
      args: args,
    };
    return Notifications.instrument("process.action_mailer", payload, async () => {
      await (this as unknown as typeof Rescuable).handleExceptions.call(this as never, () =>
        super.process(methodName, ...args),
      );
      if (!this._mailWasCalled) this._message = new NullMail();
    });
  }

  mailerName(): string {
    return (this.constructor as typeof Base).mailerName();
  }

  emailAddressWithName(address: string, name: string | null): string {
    return (this.constructor as typeof Base).emailAddressWithName(address, name);
  }

  /** @internal */
  static override supportsPath(): boolean {
    return false;
  }
}

/** @internal */
export class NullMail {
  body(): string {
    return "";
  }

  header(): Record<string, unknown> {
    return {};
  }

  isRespondTo(_string: string, _includeAll = false): boolean {
    return true;
  }

  methodMissing(..._args: unknown[]): null {
    return null;
  }
}

include(Base, Callbacks);
include(Base, Rescuable);
Base.abstractBang();
classAttribute.call(Base, "defaultParams", {
  default: Object.freeze({
    mimeVersion: "1.0",
    charset: "UTF-8",
    contentType: "text/plain",
    partsOrder: ["text/plain", "text/enriched", "text/html"],
  }),
});
Object.setPrototypeOf(
  Base,
  new Proxy(Object.getPrototypeOf(Base) as object, {
    get(target, prop, receiver: typeof Base) {
      const value = Reflect.get(target, prop, receiver);
      if (
        value !== undefined ||
        typeof prop === "symbol" ||
        Reflect.has(target, prop) ||
        !(receiver === Base || Object.prototype.isPrototypeOf.call(Base, receiver))
      ) {
        return value;
      }
      if (receiver.respondToMissing(prop, false)) {
        return (...args: unknown[]) => receiver.methodMissing(prop, ...args);
      }
      return value;
    },
  }),
);

ActionMailer.Base = Base as typeof ActionMailer.Base;
