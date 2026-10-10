import { Encryption } from "../namespaces.js";
import { Module } from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";
import { UniquenessValidator } from "../validations/uniqueness.js";

export class ExtendedDeterministicUniquenessValidator {
  static installSupport(): void {
    prepend(UniquenessValidator, EncryptedUniquenessValidator);
  }
}

export const EncryptedUniquenessValidator: Module = new Module((mod) => {
  mod.defineMethod(
    "validateEach",
    async function (this: object, record: any, attribute: string, value: unknown): Promise<void> {
      await EncryptedUniquenessValidator.superMethod(this, "validateEach")!(
        record,
        attribute,
        value,
      );

      const klass = record.constructor;
      if (klass.deterministicEncryptedAttributes()?.includes(attribute)) {
        const encryptedType = klass.typeForAttribute(attribute);
        for (const type of encryptedType.previousTypes) {
          const encryptedValue = type.serialize(value);
          await Encryption.withoutEncryption(() =>
            EncryptedUniquenessValidator.superMethod(this, "validateEach")!(
              record,
              attribute,
              encryptedValue,
            ),
          );
        }
      }
    },
  );
});

Encryption.ExtendedDeterministicUniquenessValidator = ExtendedDeterministicUniquenessValidator;
