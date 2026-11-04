import { Time } from "@blazetrails/date";
import {
  forceEncoding,
  IO,
  kernelRand,
  Process,
  rbObjAsString,
  rbObjId,
  rbStrToI,
  sprintf,
  Thread,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Configuration } from "./configuration.js";
import type { Message } from "./message.js";
import type { Part } from "./part.js";
import type { CommonField } from "./fields/common-field.js";

interface MailConstants {
  Message: typeof Message;
  Part: typeof Part;
  Parsers?: typeof import("./parsers.js");
  "new"(...args: unknown[]): Message;
  read(filename: string): Promise<Message>;
  defaults(block: (this: Configuration) => unknown): unknown;
  RANDOM_TAG: string;
  randomTag(): string;
  somethingRandom(): number | bigint;
  uniq(): number | bigint;
  registerObserver(observer: DeliveryObserver): void;
  unregisterObserver(observer: DeliveryObserver): void;
  registerInterceptor(interceptor: DeliveryInterceptor): void;
  unregisterInterceptor(interceptor: DeliveryInterceptor): void;
  informObservers(mail: Message): void;
  informInterceptors(mail: Message): void;
}

export interface DeliveryObserver {
  deliveredEmail(mail: Message): unknown;
}

export interface DeliveryInterceptor {
  deliveringEmail(mail: Message): unknown;
}

const deliveryNotificationObservers: DeliveryObserver[] = [];
const deliveryInterceptors: DeliveryInterceptor[] = [];

type FieldConstant = new (...args: never[]) => CommonField;

export const Mail: MailConstants & Record<`${string}Field`, FieldConstant> = {
  RANDOM_TAG: "%x%x_%x%x%d%x",

  new(...args: unknown[]) {
    const block = typeof args.at(-1) === "function" ? args.pop() : undefined;
    return new Mail.Message(args, block);
  },

  defaults(block: (this: Configuration) => unknown) {
    return block.call(Configuration.instance());
  },

  registerObserver(observer: DeliveryObserver) {
    if (!deliveryNotificationObservers.includes(observer)) {
      deliveryNotificationObservers.push(observer);
    }
  },

  unregisterObserver(observer: DeliveryObserver) {
    for (let i = deliveryNotificationObservers.indexOf(observer); i !== -1; ) {
      deliveryNotificationObservers.splice(i, 1);
      i = deliveryNotificationObservers.indexOf(observer);
    }
  },

  registerInterceptor(interceptor: DeliveryInterceptor) {
    if (!deliveryInterceptors.includes(interceptor)) {
      deliveryInterceptors.push(interceptor);
    }
  },

  unregisterInterceptor(interceptor: DeliveryInterceptor) {
    for (let i = deliveryInterceptors.indexOf(interceptor); i !== -1; ) {
      deliveryInterceptors.splice(i, 1);
      i = deliveryInterceptors.indexOf(interceptor);
    }
  },

  informObservers(mail: Message) {
    for (const observer of deliveryNotificationObservers) observer.deliveredEmail(mail);
  },

  informInterceptors(mail: Message) {
    for (const interceptor of deliveryInterceptors) interceptor.deliveringEmail(mail);
  },

  /**
   * @missingRailsCall open — CONVERGEABLE ruby-compat-io-read-async-to-eof
   * @missingRailsCall read — CONVERGEABLE ruby-compat-io-read-async-to-eof
   * @inventedArm forceEncoding — CONVERGEABLE mail-message-parses-binary-raw-source
   */
  async read(filename: string): Promise<Message> {
    return Mail.new(forceEncoding((await IO.binreadAsync(filename))!, "UTF-8"));
  },

  randomTag(): string {
    const t = Time.now();
    return sprintf(
      Mail.RANDOM_TAG,
      t.toI(),
      t.usec,
      Process.pid,
      Math.abs(Number(rbObjId(Thread.current))),
      Mail.uniq(),
      kernelRand(255),
    );
  },

  /** @internal */
  somethingRandom(): number | bigint {
    const random = (Number(rbObjId(Thread.current)) * Number(kernelRand(255))) / Time.now().toF();
    return rbStrToI(rbObjAsString(random).slice(-3));
  },

  /** @internal */
  uniq(): number | bigint {
    return (_uniq = BigInt(_uniq) + 1n);
  },
} as unknown as MailConstants & Record<`${string}Field`, FieldConstant>;

TopLevel.Mail = Mail;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Mail?: typeof Mail;
  }
}

let _uniq: number | bigint = Mail.somethingRandom();
