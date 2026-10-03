import bcryptjs from "bcryptjs";
import { Time } from "@blazetrails/date";
import {
  ArgumentError,
  Range,
  rbObjAsString,
  rbObjRespondTo,
  SecureRandom,
  toI,
  warn,
} from "@blazetrails/ruby-compat";
import { Errors } from "./error.js";
import { Password } from "./password.js";

export class Engine {
  static DEFAULT_COST: number = 12;
  static readonly MIN_COST: number = 4;
  static readonly MAX_COST: number = 31;
  static readonly MAX_SECRET_BYTESIZE: number = 72;
  static readonly MAX_SALT_LENGTH: number = 16;

  private static _cost: number | null = null;

  static get cost(): number {
    return this._cost ?? this.DEFAULT_COST;
  }

  static set cost(cost: number | null) {
    this._cost = cost;
  }

  static hashSecret(secret: unknown, salt: string | null, _: unknown = null): string {
    if (_ != null) {
      warn(
        "[DEPRECATION] Passing the third argument to " +
          "`BCrypt::Engine.hash_secret` is deprecated. " +
          "Please do not pass the third argument which " +
          "is currently not used.",
      );
    }

    if (this.isValidSecret(secret)) {
      if (this.isValidSalt(salt)) {
        secret = rbObjAsString(secret);
        return this.__bcCrypt(secret as string, salt as string);
      } else {
        throw new Errors.InvalidSalt("invalid salt");
      }
    } else {
      throw new Errors.InvalidSecret("invalid secret");
    }
  }

  static generateSalt(cost: number = this.cost): string | null {
    cost = toI(cost) as number;
    if (cost > 0) {
      if (cost < this.MIN_COST) {
        cost = this.MIN_COST;
      }
      return this.__bcSalt("$2a$", cost, SecureRandom.randomBytes(this.MAX_SALT_LENGTH));
    } else {
      throw new Errors.InvalidCost("cost must be numeric and > 0");
    }
  }

  static isValidSalt(salt: string | null): boolean {
    return salt != null && /^\$[0-9a-z]{2,}\$[0-9]{2,}\$[A-Za-z0-9./]{22,}$/.test(salt);
  }

  static isValidSecret(secret: unknown): boolean {
    return rbObjRespondTo(secret, "toString");
  }

  private static __bcSalt(
    prefix: string,
    count: number,
    input: ArrayLike<number> | null,
  ): string | null {
    const size = input == null ? 0 : input.length;
    if (
      size < 16 ||
      (count && (count < 4 || count > 31)) ||
      prefix[0] !== "$" ||
      prefix[1] !== "2" ||
      (prefix[2] !== "a" && prefix[2] !== "b" && prefix[2] !== "y")
    ) {
      return null;
    }

    if (!count) count = 5;

    return `$2${prefix[2]}$${Math.floor(count / 10)}${count % 10}$${bcryptjs.encodeBase64(input!, 16)}`;
  }

  private static __bcCrypt(key: string, setting: string): string {
    if (key.includes("\0") || setting.includes("\0")) {
      throw new ArgumentError("string contains null byte");
    }
    return bcryptjs.hashSync(key, setting);
  }

  static calibrate(upperTimeLimitInMs: number): number | Range<number> {
    const costs = new Range(Engine.MIN_COST, Engine.MAX_COST - 1);
    for (const i of costs.each()) {
      const startTime = Time.now();
      Password.create("testing testing", { cost: i + 1 });
      const endTime = Time.now().minus(startTime) as number;
      if (endTime * 1_000 > upperTimeLimitInMs) return i;
    }
    return costs;
  }

  static autodetectCost(salt: string): number {
    return toI(salt.slice(4, 6)) as number;
  }
}
