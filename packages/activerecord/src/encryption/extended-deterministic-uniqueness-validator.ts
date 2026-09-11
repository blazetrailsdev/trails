import { deterministicEncryptedAttributes } from "./encryptable-record.js";
import { Contexts } from "./contexts.js";

export class ExtendedDeterministicUniquenessValidator {
  private static _installed = false;

  /** @missingRailsCall prepend — PERMANENT */
  static installSupport({
    UniquenessValidator,
    EncryptedUniquenessValidator: EUV,
  }: {
    UniquenessValidator: { prototype: { validateEach: (...args: any[]) => unknown } };
    EncryptedUniquenessValidator: typeof EncryptedUniquenessValidator;
  }): void {
    if (this._installed) return;

    const original = UniquenessValidator.prototype.validateEach;
    if (typeof original !== "function") {
      throw new Error(
        "ExtendedDeterministicUniquenessValidator: UniquenessValidator.prototype.validateEach is not callable",
      );
    }

    this._installed = true;

    const validator = new EUV();
    UniquenessValidator.prototype.validateEach = function (
      this: unknown,
      record: any,
      attribute: string,
      value: unknown,
    ) {
      return validator.validateEach(original.bind(this), record, attribute, value);
    };
  }
}

export class EncryptedUniquenessValidator {
  async validateEach(
    originalValidateEach: (record: any, attribute: string, value: unknown) => unknown,
    record: any,
    attribute: string,
    value: unknown,
  ): Promise<void> {
    await originalValidateEach(record, attribute, value);

    const klass = record.constructor;
    if (deterministicEncryptedAttributes.call(klass)?.has(attribute)) {
      const encryptedType = klass.typeForAttribute(attribute);
      for (const type of encryptedType.previousTypes) {
        const encryptedValue = type.serialize(value);
        await Contexts.withoutEncryption(() =>
          originalValidateEach(record, attribute, encryptedValue),
        );
      }
    }
  }
}
