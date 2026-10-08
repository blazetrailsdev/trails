import { Encryption } from "../namespaces.js";
import { prepend } from "@blazetrails/ruby-compat";
import { UniquenessValidator } from "../validations/uniqueness.js";

export class ExtendedDeterministicUniquenessValidator {
  static installSupport(): void {
    prepend(UniquenessValidator.prototype, EncryptedUniquenessValidator);
  }
}

export const EncryptedUniquenessValidator = {
  async validateEach(
    super_: (record: any, attribute: string, value: unknown) => unknown,
    record: any,
    attribute: string,
    value: unknown,
  ): Promise<void> {
    await super_(record, attribute, value);

    const klass = record.constructor;
    if (klass.deterministicEncryptedAttributes()?.includes(attribute)) {
      const encryptedType = klass.typeForAttribute(attribute);
      for (const type of encryptedType.previousTypes) {
        const encryptedValue = type.serialize(value);
        await Encryption.withoutEncryption(() => super_(record, attribute, encryptedValue));
      }
    }
  },
};

Encryption.ExtendedDeterministicUniquenessValidator = ExtendedDeterministicUniquenessValidator;
