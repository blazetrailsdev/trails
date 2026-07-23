import { EncryptableRecord, getAttributeType, encryptedTypeOf } from "./encryptable-record.js";
import {
  AdditionalValue,
  ExtendedDeterministicQueries,
  type SerializableType,
} from "./extended-deterministic-queries.js";
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
  private static _originalValidateEach: ((...args: any[]) => unknown) | undefined;

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

    // When ExtendedDeterministicQueries is also installed it already expands
    // WHERE clauses to cover all previous-scheme ciphertexts, so
    // EncryptedUniquenessValidator skips the extra previous-scheme query in
    // that case to avoid duplicate errors and redundant DB round-trips.
    const validator = new EUV();
    // `original` (UniquenessValidator#validateEach) is async — it awaits the
    // `SELECT 1 ... WHERE attr = ?` round-trip. The wrapper must return that
    // promise so the validation chain awaits it; dropping it leaves the query
    // in flight and its errors land on the record at an arbitrary later tick.
    UniquenessValidator.prototype.validateEach = function (
      this: unknown,
      record: any,
      attribute: string,
      value: unknown,
    ) {
      return validator.validateEach(original.bind(this), record, attribute, value);
    };
  }

  /** Restores the original validateEach — for use in test teardown. */
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

/**
 * Performs uniqueness validation across all encryption scheme versions.
 * Computes ciphertexts for current and previous schemes and checks
 * uniqueness against all of them in a single query using IN (...).
 *
 * Mirrors: ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator::EncryptedUniquenessValidator
 */
export class EncryptedUniquenessValidator {
  async validateEach(
    originalValidateEach: (record: any, attribute: string, value: unknown) => unknown,
    record: any,
    attribute: string,
    value: unknown,
  ): Promise<void> {
    await originalValidateEach(record, attribute, value);

    const klass = record.constructor;
    const deterministicAttrs = EncryptableRecord.deterministicEncryptedAttributes(klass);
    if (!deterministicAttrs.has(attribute)) return;

    const encryptedType = encryptedTypeOf(getAttributeType(klass, attribute));
    if (!encryptedType) return;

    // When ExtendedDeterministicQueries is installed it already expands the
    // WHERE clause to cover all previous-scheme ciphertexts, and buildRelation
    // uses hash-style WHERE for supportUnencryptedData attributes so the plain-
    // text variant is included in the IN list. No extra per-scheme query needed.
    if (!ExtendedDeterministicQueries.installed) {
      const prevCiphertexts = encryptedType.previousTypes.map((pt) => pt.serialize(value));
      if (prevCiphertexts.length > 0) {
        await withoutEncryption(() => originalValidateEach(record, attribute, prevCiphertexts));
      }
    }
  }

  /**
   * Returns all ciphertext variants for a value across current and
   * previous encryption schemes. Used by uniqueness validation to
   * check for duplicates across scheme migrations.
   */
  static allCiphertextsFor(klass: any, attribute: string, value: unknown): unknown[] {
    // Rails shape: the current-scheme candidate stays as raw plaintext at
    // index 0 (the PredicateBuilder serializes it through the attribute's
    // resolved type); only previous-scheme candidates are
    // AdditionalValue-wrapped. Gating reaches the inner type via
    // encryptedTypeOf — Rails' DelegateClass delegation.
    const fullType = getAttributeType(klass, attribute) as SerializableType | undefined;
    const type = encryptedTypeOf(fullType);
    if (!fullType || !type?.deterministic) {
      return [value];
    }

    return [value, ...type.previousTypes.map((prevType) => new AdditionalValue(value, prevType))];
  }
}
