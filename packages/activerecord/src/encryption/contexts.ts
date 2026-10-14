import { mattrAccessor, threadMattrAccessor } from "@blazetrails/activesupport";
import {
  getAsyncContext,
  included,
  last,
  rbEnsure,
  rbFSend,
  rbObjDup,
  Thread,
  type AsyncContext,
  type AsyncContextAdapter,
} from "@blazetrails/ruby-compat";
import { Encryption } from "../namespaces.js";
import { Context } from "./context.js";
import { NullEncryptor } from "./null-encryptor.js";
import { EncryptingOnlyEncryptor } from "./encrypting-only-encryptor.js";

interface Block {
  thread: Thread;
  customContexts: Context[] | null;
}

let _adapter: AsyncContextAdapter | null = null;
let _blocks: AsyncContext<Block> | null = null;

function blocks(): AsyncContext<Block> {
  const adapter = getAsyncContext();
  if (!_blocks || _adapter !== adapter) {
    _adapter = adapter;
    _blocks = adapter.create<Block>();
  }
  return _blocks;
}

function openBlock(): Block | null {
  const block = blocks().getStore();
  return block && block.thread === Thread.current() ? block : null;
}

export class Contexts {
  declare static defaultContext: Context;
  declare static customContexts: Context[] | null;
  declare defaultContext: Context;
  declare customContexts: Context[] | null;

  static [included](base: object): void {
    mattrAccessor.call(base, "defaultContext", { default: new Context() });
    threadMattrAccessor.call(base, "customContexts");

    const threadLocal = Object.getOwnPropertyDescriptor(base, "customContexts")!;
    Object.defineProperty(base, "customContexts", {
      ...threadLocal,
      get(this: object) {
        const block = openBlock();
        return block ? block.customContexts : threadLocal.get!.call(this);
      },
      set(this: object, value: Context[] | null) {
        const block = openBlock();
        if (block) block.customContexts = value;
        else threadLocal.set!.call(this, value);
      },
    });
  }

  /** @inventedArm run — CONVERGEABLE thread-local-block-stacks-fork-per-async-block-at-the-root */
  static withEncryptionContext<T>(properties: Partial<Context>, block: () => T): T {
    const own: Block = {
      thread: Thread.current(),
      customContexts: [...(this.customContexts ||= [])],
    };
    return blocks().run(own, () =>
      rbEnsure(
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
      ),
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
