import bcryptjs from "bcryptjs";
import { rbObjAsString, toI, warn } from "@blazetrails/ruby-compat";
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

  static hashSecret(secret: unknown, salt: string, _: unknown = null): string {
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
        return bcryptjs.hashSync(rbObjAsString(secret), salt);
      } else {
        throw new Errors.InvalidSalt("invalid salt");
      }
    } else {
      throw new Errors.InvalidSecret("invalid secret");
    }
  }

  static generateSalt(cost: number = this.cost): string {
    cost = toI(cost) as number;
    if (cost > 0) {
      if (cost < this.MIN_COST) {
        cost = this.MIN_COST;
      }
      return `$2a$${bcryptjs.genSaltSync(cost).slice(4)}`;
    } else {
      throw new Errors.InvalidCost("cost must be numeric and > 0");
    }
  }

  static isValidSalt(salt: string): boolean {
    return /^\$[0-9a-z]{2,}\$[0-9]{2,}\$[A-Za-z0-9./]{22,}$/.test(salt);
  }

  static isValidSecret(secret: unknown): boolean {
    return secret == null || typeof (secret as { toString?: unknown }).toString === "function";
  }

  static calibrate(upperTimeLimitInMs: number): number | undefined {
    for (let i = Engine.MIN_COST; i <= Engine.MAX_COST - 1; i++) {
      const startTime = performance.now() / 1_000;
      Password.create("testing testing", { cost: i + 1 });
      const endTime = performance.now() / 1_000 - startTime;
      if (endTime * 1_000 > upperTimeLimitInMs) return i;
    }
  }

  static autodetectCost(salt: string): number {
    return toI(salt.slice(4, 6)) as number;
  }
}
