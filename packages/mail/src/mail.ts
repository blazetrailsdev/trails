import { Time } from "@blazetrails/date";
import {
  kernelRand,
  Process,
  rbObjAsString,
  rbObjId,
  rbStrToI,
  sprintf,
  Thread,
  TopLevel,
} from "@blazetrails/ruby-compat";
import type { Message } from "./message.js";
import type { Part } from "./part.js";
import type { CommonField } from "./fields/common-field.js";

interface MailConstants {
  Message: typeof Message;
  Part: typeof Part;
  Parsers: { name: string };
  "new"(...args: unknown[]): Message;
  RANDOM_TAG: string;
  randomTag(): string;
  somethingRandom(): number | bigint;
  uniq(): number | bigint;
}

type FieldConstant = new (...args: never[]) => CommonField;

export const Mail: MailConstants & Record<`${string}Field`, FieldConstant> = {
  Parsers: { name: "Mail::Parsers" },

  RANDOM_TAG: "%x%x_%x%x%d%x",

  new(...args: unknown[]) {
    const block = typeof args.at(-1) === "function" ? args.pop() : undefined;
    return new Mail.Message(args, block);
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
