import { deterministicEncryptedAttributes, encryptedTypeOf } from "./encryptable-record.js";
import { ExtendedDeterministicQueries } from "./extended-deterministic-queries.js";
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
    const deterministicAttrs = deterministicEncryptedAttributes.call(klass);
    if (!deterministicAttrs.has(attribute)) return;

    const encryptedType = encryptedTypeOf(klass.typeForAttribute(attribute));
    if (!encryptedType) return;

    if (!ExtendedDeterministicQueries.installed) {
      const prevCiphertexts = encryptedType.previousTypes.map((pt) => pt.serialize(value));
      if (prevCiphertexts.length > 0) {
        await Contexts.withoutEncryption(() =>
          originalValidateEach(record, attribute, prevCiphertexts),
        );
      }
    }
  }
}
