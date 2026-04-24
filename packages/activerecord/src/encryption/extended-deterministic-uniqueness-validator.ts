import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { EncryptableRecord, getAttributeType } from "./encryptable-record.js";
import { AdditionalValue, ExtendedDeterministicQueries } from "./extended-deterministic-queries.js";
import { withoutEncryption } from "./context.js";

/**
 * Extends uniqueness validation for deterministic encrypted attributes.
 * When validating uniqueness, also checks against values encrypted with
 * previous schemes to prevent duplicates across migration periods.
 *
 * Mirrors: ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator
 */
export class ExtendedDeterministicUniquenessValidator {
  private static _installed = false;
  private static _originalValidateEach: Function | undefined;

  /**
   * Wraps UniquenessValidator#validateEach so uniqueness checks also cover
   * values encrypted with previous schemes. Validates the target is callable
   * before patching and saves the original for restoration via resetSupport().
   *
   * Mirrors: Rails' ExtendedDeterministicUniquenessValidator.install_support which
   * prepends EncryptedUniquenessValidator into ActiveRecord::Validations::UniquenessValidator.
   */
  static installSupport({
    UniquenessValidator,
    EncryptedUniquenessValidator: EUV,
  }: {
    UniquenessValidator: { prototype: { validateEach: Function } };
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

    // When ExtendedDeterministicQueries is also installed it already expands
    // WHERE clauses to cover all previous-scheme ciphertexts, so
    // EncryptedUniquenessValidator skips the extra previous-scheme query in
    // that case to avoid duplicate errors and redundant DB round-trips.
    const validator = new EUV();
    UniquenessValidator.prototype.validateEach = function (
      this: unknown,
      record: any,
      attribute: string,
      value: unknown,
    ) {
      validator.validateEach(original.bind(this), record, attribute, value);
    };
  }

  /** Restores the original validateEach — for use in test teardown. */
  static resetSupport(UniquenessValidator: { prototype: { validateEach: Function } }): void {
    if (!this._installed || !this._originalValidateEach) return;
    UniquenessValidator.prototype.validateEach = this._originalValidateEach;
    this._installed = false;
    this._originalValidateEach = undefined;
  }

  static get installed(): boolean {
    return this._installed;
  }
}

/**
 * Performs uniqueness validation across all encryption scheme versions.
 * Computes ciphertexts for current and previous schemes and checks
 * uniqueness against all of them in a single query using IN (...).
 *
 * Mirrors: ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator::EncryptedUniquenessValidator
 */
export class EncryptedUniquenessValidator {
  validateEach(
    originalValidateEach: (record: any, attribute: string, value: unknown) => void,
    record: any,
    attribute: string,
    value: unknown,
  ): void {
    originalValidateEach(record, attribute, value);

    const klass = record.constructor;
    const deterministicAttrs = EncryptableRecord.deterministicEncryptedAttributes(klass);
    if (!deterministicAttrs.has(attribute)) return;

    const encryptedType = getAttributeType(klass, attribute);
    if (!(encryptedType instanceof EncryptedAttributeType)) return;

    // When ExtendedDeterministicQueries is installed it already expands the
    // WHERE clause to cover all previous-scheme ciphertexts, so the first
    // originalValidateEach call above is sufficient. Only issue the extra
    // query when the WHERE expansion is not active.
    if (!ExtendedDeterministicQueries.installed) {
      const prevCiphertexts = encryptedType.previousTypes.map((pt) => pt.serialize(value));
      if (prevCiphertexts.length > 0) {
        withoutEncryption(() => {
          originalValidateEach(record, attribute, prevCiphertexts);
        });
      }
    }
  }

  /**
   * Returns all ciphertext variants for a value across current and
   * previous encryption schemes. Used by uniqueness validation to
   * check for duplicates across scheme migrations.
   */
  static allCiphertextsFor(klass: any, attribute: string, value: unknown): unknown[] {
    const type = getAttributeType(klass, attribute);
    if (!(type instanceof EncryptedAttributeType) || !type.deterministic) {
      return [value];
    }

    const results: Array<unknown | AdditionalValue> = [];
    results.push(new AdditionalValue(value, type));

    for (const prevType of type.previousTypes) {
      results.push(new AdditionalValue(value, prevType));
    }

    return results;
  }
}
