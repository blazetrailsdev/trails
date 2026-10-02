import { mattrAccessor, threadMattrAccessor } from "@blazetrails/activesupport";
import { included, last, rbFSend, rbObjDup } from "@blazetrails/ruby-compat";
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
    let result: T;
    try {
      this.customContexts ||= [];
      this.customContexts.push(rbObjDup(this.defaultContext));
      for (const [key, value] of Object.entries(properties)) {
        rbFSend(this.currentCustomContext, `${key}=`, value);
      }

      result = block();
    } catch (e) {
      this.customContexts!.pop();
      throw e;
    }
    if (result && typeof (result as { then?: unknown }).then === "function") {
      return (result as unknown as Promise<unknown>).then(
        (val) => {
          this.customContexts!.pop();
          return val;
        },
        (err) => {
          this.customContexts!.pop();
          throw err;
        },
      ) as unknown as T;
    }
    this.customContexts.pop();
    return result;
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

  /** @missingRailsArgs last — CONVERGEABLE call-args-gate-reads-an-explicit-self-receiver-as-a-simple-receiver */
  static get currentCustomContext(): Context | null | undefined {
    return this.customContexts && last(this.customContexts);
  }

  static resetDefaultContext(): void {
    this.defaultContext = new Context();
  }
}

Encryption.Contexts = Contexts;
