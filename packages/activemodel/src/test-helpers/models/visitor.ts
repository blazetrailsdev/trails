import { defineModelCallbacks } from "../../callbacks.js";
import { hasSecurePassword } from "../../secure-password.js";

export class Visitor {
  static {
    defineModelCallbacks.call<object, [string], void>(this, "create");
    hasSecurePassword.call(this, "password", { validations: false });
  }

  password_digest: string | null = null;
  declare _passwordConfirmation: unknown;

  get passwordConfirmation(): unknown {
    return this._passwordConfirmation ?? null;
  }

  set passwordConfirmation(value: unknown) {
    Reflect.set(Object.getPrototypeOf(Visitor.prototype), "passwordConfirmation", value, this);
  }
}
