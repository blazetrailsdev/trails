import { deterministicEncryptedAttributes, encryptedTypeOf } from "./encryptable-record.js";
import {
  AdditionalValue,
  ExtendedDeterministicQueries,
  type SerializableType,
} from "./extended-deterministic-queries.js";
import { Contexts } from "./contexts.js";

export class ExtendedDeterministicUniquenessValidator {
  private static _installed = false;
  private static _originalValidateEach: ((...args: any[]) => unknown) | undefined;

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

    this._originalValidateEach = original;
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

  static resetSupport(UniquenessValidator: {
    prototype: { validateEach: (...args: any[]) => unknown };
  }): void {
    if (!this._installed || !this._originalValidateEach) return;
    UniquenessValidator.prototype.validateEach = this._originalValidateEach;
    this._installed = false;
    this._originalValidateEach = undefined;
  }

  static get installed(): boolean {
    return this._installed;
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

  static allCiphertextsFor(klass: any, attribute: string, value: unknown): unknown[] {
    const fullType = klass.typeForAttribute(attribute) as SerializableType | undefined;
    const type = encryptedTypeOf(fullType);
    if (!fullType || !type?.deterministic) {
      return [value];
    }

    return [value, ...type.previousTypes.map((prevType) => new AdditionalValue(value, prevType))];
  }
}
