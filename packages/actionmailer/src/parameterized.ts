import { Concern, extend } from "@blazetrails/activesupport";
import {
  NoMethodError,
  PROTOCOL_PROBES,
  rbModName,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import {
  MessageDelivery as BaseMessageDelivery,
  type MailerClass,
  type ProcessedMailer,
} from "./message-delivery.js";
import { ActionMailer } from "./namespaces.js";

interface ParameterizedMailerClass extends MailerClass {
  actionMethods(): string[];
}

interface ParameterizedHost {
  _params?: Record<string, unknown>;
}

export const ClassMethods = {
  with(this: unknown, params: Record<string, unknown>): Mailer {
    return new Parameterized.Mailer(this as ParameterizedMailerClass, params);
  },
};

/** @internal */
export class Mailer {
  /** @internal */
  protected _mailer: ParameterizedMailerClass;
  /** @internal */
  protected _params: Record<string, unknown>;

  constructor(mailer: ParameterizedMailerClass, params: Record<string, unknown>) {
    this._mailer = mailer;
    this._params = params;
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "symbol" || PROTOCOL_PROBES.has(prop) || Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        if (!target.respondToMissing(prop)) return undefined;
        return (...args: unknown[]) => target.methodMissing(prop, ...args);
      },
      has(target, prop) {
        if (Reflect.has(target, prop)) return true;
        return typeof prop === "string" && target.respondToMissing(prop);
      },
    });
  }

  /** @internal */
  methodMissing(methodName: string, ...args: unknown[]): unknown {
    if (this._mailer.actionMethods().includes(methodName)) {
      return new Parameterized.MessageDelivery(this._mailer, methodName, this._params, ...args);
    } else {
      throw new NoMethodError(
        `undefined method '${methodName}' for an instance of ${rbModName(Mailer)}`,
        methodName,
      );
    }
  }

  /** @internal */
  respondToMissing(method: string, _includeAll = false): boolean {
    return rbObjRespondTo(this._mailer, method);
  }
}

/** @internal */
export class MessageDelivery extends BaseMessageDelivery {
  /** @internal */
  declare protected _params: Record<string, unknown>;

  constructor(
    mailerClass: MailerClass,
    action: string,
    params: Record<string, unknown>,
    ...args: unknown[]
  ) {
    super(mailerClass, action, ...args);
    this._params = params;
  }

  /** @internal */
  protected override async processedMailer(): Promise<ProcessedMailer> {
    if (this._processedMailer == null) {
      const mailer = new this._mailerClass();
      mailer.params = this._params;
      await mailer.process(this._action, ...this._args);
      this._processedMailer = mailer;
    }
    return this._processedMailer;
  }

  /** @internal */
  protected override async enqueueDelivery(
    deliveryMethod: string,
    options: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (this.isProcessed()) {
      return await super.enqueueDelivery(deliveryMethod, options);
    } else {
      return await this._mailerClass.deliveryJob
        .set(options)
        .performLater(rbModName(this._mailerClass), this._action, deliveryMethod, {
          params: this._params,
          args: this._args,
        });
    }
  }
}

export const Parameterized = { ClassMethods, Mailer, MessageDelivery };
extend(Parameterized, Concern);
Concern.included.call(Parameterized as never, null, function (this: { prototype: object }) {
  Object.defineProperty(this.prototype, "params", {
    get(this: ParameterizedHost) {
      return (this._params ||= {});
    },
    set(this: ParameterizedHost, value: Record<string, unknown>) {
      this._params = value;
    },
    configurable: true,
  });
});

ActionMailer.Parameterized = Parameterized;
