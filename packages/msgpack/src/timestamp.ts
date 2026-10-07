import { pack, rbEqual, rbModConstSet, rbObjClass, unpack } from "@blazetrails/ruby-compat";
import { MessagePack } from "./namespaces.js";

export class Timestamp {
  static readonly TYPE = -1;

  static readonly TIMESTAMP32_MAX_SEC = 2 ** 32 - 1;
  static readonly TIMESTAMP64_MAX_SEC = 2 ** 34 - 1;

  readonly sec: number | bigint;

  readonly nsec: number;

  constructor(sec: number | bigint, nsec: number) {
    this.sec = sec;
    this.nsec = nsec;
  }

  static fromMsgpackExt(data: Uint8Array): Timestamp {
    switch (data.length) {
      case 4: {
        const [sec] = unpack(data, "L>") as number[];
        return new this(sec, 0);
      }
      case 8: {
        const [n, s] = unpack(data, "L>2") as number[];
        const sec = Number(((BigInt(n) & 0b11n) << 32n) | BigInt(s));
        const nsec = n >>> 2;
        return new this(sec, nsec);
      }
      case 12: {
        const [nsec, sec] = unpack(data, "L>q>") as [number, number | bigint];
        return new this(sec, nsec);
      }
      default:
        throw new MessagePack.MalformedFormatError(`Invalid timestamp data size: ${data.length}`);
    }
  }

  static toMsgpackExt(sec: number | bigint, nsec: number): Uint8Array {
    let packed: string;
    if (sec >= 0 && nsec >= 0 && sec <= Timestamp.TIMESTAMP64_MAX_SEC) {
      if (nsec === 0 && sec <= Timestamp.TIMESTAMP32_MAX_SEC) {
        packed = pack([sec], "L>");
      } else {
        const nsec30 = BigInt(nsec) << 2n;
        const secHigh2 = BigInt(sec) >> 32n;
        const secLow32 = BigInt(sec) & 0xffffffffn;
        packed = pack([nsec30 | secHigh2, secLow32], "L>2");
      }
    } else {
      packed = pack([nsec, sec], "L>q>");
    }
    return Uint8Array.from(packed, (c) => c.charCodeAt(0));
  }

  toMsgpackExt(): Uint8Array {
    return (rbObjClass(this) as typeof Timestamp).toMsgpackExt(this.sec, this.nsec);
  }

  equals(other: unknown): boolean {
    return (
      rbObjClass(other) === rbObjClass(this) &&
      rbEqual(this.sec, (other as Timestamp).sec) &&
      this.nsec === (other as Timestamp).nsec
    );
  }
}

rbModConstSet(MessagePack, "Timestamp", Timestamp);
