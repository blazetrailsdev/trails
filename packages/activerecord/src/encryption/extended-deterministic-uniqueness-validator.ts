import { prepend } from "@blazetrails/activesupport";
import { deterministicEncryptedAttributes } from "./encryptable-record.js";
import { Contexts } from "./contexts.js";

export class ExtendedDeterministicUniquenessValidator {
  private static _installed = false;

  /** @missingRailsArgs prepend — PERMANENT */
  static installSupport({
    UniquenessValidator,
    EncryptedUniquenessValidator,
  }: {
    UniquenessValidator: { prototype: { validateEach: (...args: any[]) => unknown } };
    EncryptedUniquenessValidator: EncryptedUniquenessValidatorModule;
  }): void {
    if (this._installed) return;

    if (typeof UniquenessValidator.prototype.validateEach !== "function") {
      throw new Error(
        "ExtendedDeterministicUniquenessValidator: UniquenessValidator.prototype.validateEach is not callable",
      );
    }

    this._installed = true;

    prepend(UniquenessValidator.prototype, EncryptedUniquenessValidator);
  }
}

type EncryptedUniquenessValidatorModule = typeof EncryptedUniquenessValidator;

export const EncryptedUniquenessValidator = {
  async validateEach(
    super_: (record: any, attribute: string, value: unknown) => unknown,
    record: any,
    attribute: string,
    value: unknown,
  ): Promise<void> {
    await super_(record, attribute, value);

    const klass = record.constructor;
    if (deterministicEncryptedAttributes.call(klass)?.has(attribute)) {
      const encryptedType = klass.typeForAttribute(attribute);
      for (const type of encryptedType.previousTypes) {
        const encryptedValue = type.serialize(value);
        await Contexts.withoutEncryption(() => super_(record, attribute, encryptedValue));
      }
    }
  },
};
