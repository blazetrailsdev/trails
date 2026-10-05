import { base58, camelize } from "@blazetrails/activesupport";
import { StandardError } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import { generateSecureTokenOn } from "./active-record.js";

export class MinimumLengthError extends StandardError {}

MinimumLengthError.prototype.name = "ActiveRecord::SecureToken::MinimumLengthError";

const MINIMUM_TOKEN_LENGTH = 24;

/** @missingRailsCall define_method — CONVERGEABLE define-method-on-a-class-receiver-goes-through-ruby-compat */
export function hasSecureToken(
  this: typeof Base,
  attribute: string = "token",
  {
    length = MINIMUM_TOKEN_LENGTH,
    on = generateSecureTokenOn(),
  }: { length?: number; on?: "create" | "initialize" } = {},
): void {
  if (length < MINIMUM_TOKEN_LENGTH) {
    throw new MinimumLengthError(
      `Token requires a minimum length of ${MINIMUM_TOKEN_LENGTH} characters.`,
    );
  }

  Object.defineProperty(this.prototype, camelize(`regenerate_${attribute}`, false), {
    value: function (this: Base): Promise<true | undefined> {
      return this.updateBang({
        [attribute]: (this.constructor as typeof Base).generateUniqueSecureToken({ length }),
      });
    },
    writable: true,
    configurable: true,
  });

  this.setCallback(on, on === "initialize" ? "after" : "before", function (this: any) {
    if (this.isNewRecord() && !this.queryAttribute(attribute)) {
      this[attribute] = (this.constructor as typeof Base).generateUniqueSecureToken({ length });
    }
  });
}

export function generateUniqueSecureToken({
  length = MINIMUM_TOKEN_LENGTH,
}: { length?: number } = {}): string {
  return base58(length);
}
