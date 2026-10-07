import { base58, camelize } from "@blazetrails/activesupport";
import { StandardError, rbModDefineMethod } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import { generateSecureTokenOn } from "./active-record.js";

export class MinimumLengthError extends StandardError {}

MinimumLengthError.prototype.name = "ActiveRecord::SecureToken::MinimumLengthError";

const MINIMUM_TOKEN_LENGTH = 24;

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

  rbModDefineMethod(
    this,
    camelize(`regenerate_${attribute}`, false),
    function (this: Base): Promise<true | undefined> {
      return this.updateBang({
        [attribute]: (this.constructor as typeof Base).generateUniqueSecureToken({ length }),
      });
    },
  );

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
