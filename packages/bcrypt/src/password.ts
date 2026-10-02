import { ArgumentError, toI } from "@blazetrails/ruby-compat";
import { Engine } from "./engine.js";
import { Errors } from "./error.js";

export class Password extends String {
  readonly checksum: string;
  readonly salt: string;
  readonly version: string;
  readonly cost: number;

  static create(secret: unknown, options: { cost?: number | false | null } = {}): Password {
    const cost = options.cost != null && options.cost !== false ? options.cost : Engine.cost;
    if (cost > Engine.MAX_COST) throw new ArgumentError();
    return new Password(Engine.hashSecret(secret, Engine.generateSalt(cost)));
  }

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

  equals(secret: unknown): boolean {
    return this.toString() === Engine.hashSecret(secret, this.salt);
  }

  isPassword(secret: unknown): boolean {
    return this.equals(secret);
  }

  private isValidHash(h: unknown): boolean {
    return (this.constructor as typeof Password).isValidHash(h);
  }

  private splitHash(h: string): [string, number, string, string] {
    const [, v, c, mash] = h.split("$");
    return [v, toI(c) as number, h.slice(0, 29), mash.slice(-31)];
  }
}
