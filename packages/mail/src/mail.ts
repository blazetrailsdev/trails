import { Time } from "@blazetrails/date";
import {
  kernelRand,
  Process,
  rbObjAsString,
  rbObjId,
  rbStrToI,
  sprintf,
  Thread,
} from "@blazetrails/ruby-compat";
import type { CommonField } from "./fields/common-field.js";

interface MailConstants {
  RANDOM_TAG: string;
  randomTag(): string;
  somethingRandom(): number | bigint;
  uniq(): number | bigint;
}

type FieldConstant = new (...args: never[]) => CommonField;

export const Mail: MailConstants & Record<`${string}Field`, FieldConstant> = {
  RANDOM_TAG: "%x%x_%x%x%d%x",

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
} as MailConstants & Record<`${string}Field`, FieldConstant>;

let _uniq: number | bigint = Mail.somethingRandom();
