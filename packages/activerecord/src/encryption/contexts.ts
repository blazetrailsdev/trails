import { mattrAccessor, threadMattrAccessor } from "@blazetrails/activesupport";
import { included, last, rbEnsure, rbFSend, rbObjDup } from "@blazetrails/ruby-compat";
import { Encryption } from "../namespaces.js";
import { Context } from "./context.js";
import { NullEncryptor } from "./null-encryptor.js";
import { EncryptingOnlyEncryptor } from "./encrypting-only-encryptor.js";

export class Contexts {
  declare static defaultContext: Context;
  declare static customContexts: Context[] | null;
  declare defaultContext: Context;
  declare customContexts: Context[] | null;

  static [included](base: object): void {
    mattrAccessor.call(base, "defaultContext", { default: new Context() });
    threadMattrAccessor.call(base, "customContexts");
  }

  static withEncryptionContext<T>(properties: Partial<Context>, block: () => T): T {
    return rbEnsure(
      () => {
        this.customContexts ||= [];
        this.customContexts.push(rbObjDup(this.defaultContext));
        for (const [key, value] of Object.entries(properties)) {
          rbFSend(this.currentCustomContext, `${key}=`, value);
        }

        return block();
      },
      () => {
        this.customContexts!.pop();
      },
    );
  }

  static withoutEncryption<T>(block: () => T): T {
    return this.withEncryptionContext({ encryptor: new NullEncryptor() }, block);
  }

  static protectingEncryptedData<T>(block: () => T): T {
    return this.withEncryptionContext(
      { encryptor: new EncryptingOnlyEncryptor(), frozenEncryption: true },
      block,
    );
  }

  static get context(): Context {
    return this.currentCustomContext ?? this.defaultContext;
  }

  static get currentCustomContext(): Context | null | undefined {
    return this.customContexts && last(this.customContexts);
  }

  static resetDefaultContext(): void {
    this.defaultContext = new Context();
  }
}

Encryption.Contexts = Contexts;
