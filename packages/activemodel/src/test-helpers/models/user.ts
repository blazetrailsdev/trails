/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   `include ActiveModel::Attributes` / `include ActiveModel::Dirty` are spelled with `include()`;
   the empty class/interface merge beside the class is how those members surface on the type side. */
import { include } from "@blazetrails/activesupport";
import { Model } from "../../index.js";
import { Attributes, type AttributesClassHalf } from "../../attributes.js";
import { Dirty } from "../../dirty.js";
import { defineModelCallbacks } from "../../callbacks.js";
import { hasSecurePassword } from "../../secure-password.js";

const SecurePasswordModel = Model as unknown as {
  new (attributes?: Record<string, unknown>): Model & {
    get password(): unknown;
    set password(value: unknown);
  };
};

export class User extends SecurePasswordModel {
  declare static attribute: AttributesClassHalf["attribute"];

  static {
    include(this, Attributes);
    include(this, Dirty);
    defineModelCallbacks.call<object, [string], void>(this, "create");
    this.attribute("password_digest");
    hasSecurePassword.call(this, "password");
    this.attribute("recovery_password_digest");
    hasSecurePassword.call(this, "recovery_password", {
      validations: false,
    });
  }

  passwordCalled: number | null = null;

  override get password(): unknown {
    return super.password;
  }

  override set password(unencryptedPassword: unknown) {
    this.passwordCalled ??= 0;
    this.passwordCalled += 1;
    super.password = unencryptedPassword;
  }
}

export interface User extends Attributes, Dirty {
  password_digest: string | null;
  recovery_password_digest: string | null;
  recovery_password: unknown;
  passwordConfirmation: unknown;
  passwordChallenge: unknown;
  readonly passwordSalt: string | null;
  authenticate(unencryptedPassword: unknown): User | false;
  authenticatePassword(unencryptedPassword: unknown): User | false;
  authenticateRecoveryPassword(unencryptedPassword: unknown): User | false;
}
