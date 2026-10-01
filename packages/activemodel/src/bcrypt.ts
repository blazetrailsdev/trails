import bcryptjs from "bcryptjs";
import { ArgumentError, StandardError, rbObjAsString, warn } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
export class Error extends StandardError {}

/** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
export const Errors = {
  InvalidSalt: class InvalidSalt extends Error {},
  InvalidHash: class InvalidHash extends Error {},
  InvalidCost: class InvalidCost extends Error {},
  InvalidSecret: class InvalidSecret extends Error {},
};

/** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
export class Engine {
  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  static readonly DEFAULT_COST: number = 12;
  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  static readonly MIN_COST: number = 4;
  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  static readonly MAX_COST: number = 31;
  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  static cost: number = 12;

  /**
   * @missingRailsCall byteslice — PERMANENT
   * @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package
   */
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

  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  static generateSalt(cost: number = this.cost): string {
    cost = Math.trunc(cost);
    if (cost > 0) {
      if (cost < this.MIN_COST) {
        cost = this.MIN_COST;
      }
      return `$2a$${bcryptjs.genSaltSync(cost).slice(4)}`;
    } else {
      throw new Errors.InvalidCost("cost must be numeric and > 0");
    }
  }

  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  static isValidSalt(salt: string): boolean {
    return /^\$[0-9a-z]{2,}\$[0-9]{2,}\$[A-Za-z0-9./]{22,}$/.test(salt);
  }

  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  static isValidSecret(secret: unknown): boolean {
    return secret == null || typeof (secret as { toString?: unknown }).toString === "function";
  }
}

/** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
export class Password extends String {
  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  readonly checksum: string;
  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  readonly salt: string;
  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  readonly version: string;
  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  readonly cost: number;

  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  static create(secret: unknown, options: { cost?: number | false | null } = {}): Password {
    const cost = options.cost != null && options.cost !== false ? options.cost : Engine.cost;
    if (cost > Engine.MAX_COST) throw new ArgumentError();
    return new Password(Engine.hashSecret(secret, Engine.generateSalt(cost)));
  }

  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  static isValidHash(h: unknown): boolean {
    return (
      (typeof h === "string" || h instanceof String) &&
      /^\$[0-9a-z]{2}\$[0-9]{2}\$[A-Za-z0-9./]{53}$/.test(String(h))
    );
  }

  constructor(rawHash: string | Password) {
    super(rawHash);
    if (this.isValidHash(rawHash)) {
      [this.version, this.cost, this.salt, this.checksum] = this.splitHash(this.toString());
    } else {
      throw new Errors.InvalidHash("invalid hash");
    }
  }

  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  equals(secret: unknown): boolean {
    return this.toString() === Engine.hashSecret(secret, this.salt);
  }

  /** @noRailsEquivalent CONVERGEABLE activemodel-bcrypt-engine-into-a-bcrypt-gem-package */
  isPassword(secret: unknown): boolean {
    return this.equals(secret);
  }

  private isValidHash(h: unknown): boolean {
    return (this.constructor as typeof Password).isValidHash(h);
  }

  private splitHash(h: string): [string, number, string, string] {
    const [, v, c, mash] = h.split("$");
    return [v, parseInt(c, 10), h.slice(0, 29), mash.slice(-31)];
  }
}
