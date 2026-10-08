import { registerConstant } from "@blazetrails/ruby-compat";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Base } from "../../base.js";

export class UnencryptedBook extends Base {
  static _tableName = "encrypted_books";
}
registerConstant("UnencryptedBook", UnencryptedBook);

export class EncryptedBook extends Base {
  declare author_id: number;
  declare created_at: RubyTime | Temporal.PlainDateTime;
  declare format: string;
  declare logo: Uint8Array;
  declare name: string | null;
  declare original_name: string;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static _tableName = "encrypted_books";

  static {
    this.encrypts("name", { deterministic: true });
  }
}
registerConstant("EncryptedBook", EncryptedBook);

export class EncryptedBookWithUniquenessValidation extends Base {
  static _tableName = "encrypted_books";

  static {
    this.validates("name", { uniqueness: true });
    this.encrypts("name", { deterministic: true });
  }
}
registerConstant("EncryptedBookWithUniquenessValidation", EncryptedBookWithUniquenessValidation);

export class EncryptedBookWithDowncaseName extends Base {
  static _tableName = "encrypted_books";

  static {
    this.validates("name", { uniqueness: true });
    this.encrypts("name", { deterministic: true, downcase: true });
  }
}
registerConstant("EncryptedBookWithDowncaseName", EncryptedBookWithDowncaseName);

function _downcaseLikeRails(v: unknown): unknown {
  if (v == null) return v;
  if (v instanceof Uint8Array) {
    const out = new Uint8Array(v.length);
    for (let i = 0; i < v.length; i++) {
      const b = v[i];
      out[i] = b >= 0x41 && b <= 0x5a ? b + 0x20 : b;
    }
    return out;
  }
  return String(v).toLowerCase();
}

export class EncryptedBookNormalizedFirst extends Base {
  static _tableName = "encrypted_books";

  static {
    this.normalizes("name", { with: _downcaseLikeRails });
    this.encrypts("name");
    this.normalizes("logo", { with: _downcaseLikeRails });
    this.encrypts("logo");
  }
}
registerConstant("EncryptedBookNormalizedFirst", EncryptedBookNormalizedFirst);

export class EncryptedBookNormalizedSecond extends Base {
  static _tableName = "encrypted_books";

  static {
    this.encrypts("name");
    this.normalizes("name", { with: _downcaseLikeRails });
    this.encrypts("logo");
    this.normalizes("logo", { with: _downcaseLikeRails });
  }
}
registerConstant("EncryptedBookNormalizedSecond", EncryptedBookNormalizedSecond);

export class EncryptedBookAttribute extends Base {
  declare name: Temporal.PlainDate;

  static _tableName = "encrypted_books";

  static {
    this.attribute("name", "date");
    this.encrypts("name");
  }
}
registerConstant("EncryptedBookAttribute", EncryptedBookAttribute);

export class EncryptedBookThatIgnoresCase extends Base {
  static _tableName = "encrypted_books";

  static {
    this.encrypts("name", { deterministic: true, ignoreCase: true });
  }
}
registerConstant("EncryptedBookThatIgnoresCase", EncryptedBookThatIgnoresCase);

export class EncryptedBookWithUnencryptedDataOptedOut extends Base {
  static _tableName = "encrypted_books";

  static {
    this.validates("name", { uniqueness: true });
    this.encrypts("name", { deterministic: true, supportUnencryptedData: false });
  }
}
registerConstant(
  "EncryptedBookWithUnencryptedDataOptedOut",
  EncryptedBookWithUnencryptedDataOptedOut,
);

export class EncryptedBookWithUnencryptedDataOptedIn extends Base {
  static _tableName = "encrypted_books";

  static {
    this.validates("name", { uniqueness: true });
    this.encrypts("name", { deterministic: true, supportUnencryptedData: true });
  }
}
registerConstant(
  "EncryptedBookWithUnencryptedDataOptedIn",
  EncryptedBookWithUnencryptedDataOptedIn,
);

export class EncryptedBookWithBinary extends Base {
  declare logo: Uint8Array | null;
  static _tableName = "encrypted_books";

  static {
    this.encrypts("logo");
  }
}
registerConstant("EncryptedBookWithBinary", EncryptedBookWithBinary);

export class EncryptedBookWithSerializedFirstBinary extends Base {
  static _tableName = "encrypted_books";

  static {
    this.serialize("logo", { coder: JSON });
    this.encrypts("logo");
  }
}
registerConstant("EncryptedBookWithSerializedFirstBinary", EncryptedBookWithSerializedFirstBinary);

export class EncryptedBookWithSerializedSecondBinary extends Base {
  static _tableName = "encrypted_books";

  static {
    this.encrypts("logo");
    this.serialize("logo", { coder: JSON });
  }
}
registerConstant(
  "EncryptedBookWithSerializedSecondBinary",
  EncryptedBookWithSerializedSecondBinary,
);

export class EncryptedBookWithSerializedDeterministicName extends Base {
  declare name: unknown;
  static _tableName = "encrypted_books";

  static {
    this.encrypts("name", { deterministic: true });
    this.serialize("name", {
      coder: {
        dump: (value: unknown) => JSON.stringify(value),
        load: (value: string) => {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        },
      },
    });
  }
}
registerConstant(
  "EncryptedBookWithSerializedDeterministicName",
  EncryptedBookWithSerializedDeterministicName,
);

export class EncryptedBookWithCustomCompressor extends Base {
  static _tableName = "encrypted_books";

  static {
    this.encrypts("name", {
      compressor: {
        deflate: (value: string): Buffer => Buffer.from(`[compressed] ${value}`),
        inflate: (data: Buffer | Uint8Array): Buffer => Buffer.from(data),
      },
    });
  }
}
registerConstant("EncryptedBookWithCustomCompressor", EncryptedBookWithCustomCompressor);
