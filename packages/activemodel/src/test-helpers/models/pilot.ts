/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   `include ActiveModel::Attributes` is spelled with `include()`; the empty class/interface merge
   beside the class is how those members surface on the type side. */
import { include } from "@blazetrails/activesupport";
import { Model } from "../../index.js";
import { Attributes, type AttributesClassHalf } from "../../attributes.js";
import { hasSecurePassword } from "../../secure-password.js";

export class Pilot extends Model {
  declare static attribute: AttributesClassHalf["attribute"];
  declare static findByPasswordResetToken: (token: string) => string;
  declare static findByPasswordResetTokenBang: (token: string) => string;

  static expiresIn: number | null = null;

  static generatesTokenFor(purpose: string, { expiresIn }: { expiresIn?: number } = {}): void {
    void purpose;
    Pilot.expiresIn = expiresIn ?? null;
  }

  static findByTokenFor(purpose: string, token: string): string {
    return `finding-for-${purpose}-by-${token}`;
  }

  static findByTokenForBang(purpose: string, token: string): string {
    return `finding-for-${purpose}-by-${token}!`;
  }

  generateTokenFor(purpose: string): string {
    return `${purpose}-token-${Pilot.expiresIn}`;
  }

  static {
    include(this, Attributes);
    this.attribute("password_digest");
    hasSecurePassword.call(this, "password");
  }
}

export interface Pilot extends Attributes {
  readonly passwordResetToken: string;
}
