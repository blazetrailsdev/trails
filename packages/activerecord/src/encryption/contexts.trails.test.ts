import { describe, it, expect, afterEach, vi } from "vitest";
import { NoMethodError, Thread } from "@blazetrails/ruby-compat";
import { Encryption } from "../encryption.js";
import { Context } from "./context.js";
import { NullEncryptor } from "./null-encryptor.js";

describe("ActiveRecord::Encryption::Contexts accessors", () => {
  const defaultContext = Encryption.defaultContext;

  afterEach(() => {
    Encryption.defaultContext = defaultContext;
    Encryption.customContexts = null;
  });

  it("default_context is a Context held on ActiveRecord::Encryption", () => {
    expect(Encryption.defaultContext).toBeInstanceOf(Context);
    expect(Encryption.context).toBe(Encryption.defaultContext);
  });

  it("default_context= replaces the context .context falls back to", () => {
    const context = new Context();
    Encryption.defaultContext = context;

    expect(Encryption.context).toBe(context);
  });

  it("reset_default_context writes a new Context through default_context=", () => {
    const before = Encryption.defaultContext;
    Encryption.resetDefaultContext();

    expect(Encryption.defaultContext).toBeInstanceOf(Context);
    expect(Encryption.defaultContext).not.toBe(before);
  });

  it("custom_contexts is nil until a block opens one, and empty after it closes", () => {
    expect(Encryption.customContexts).toBeNull();
    expect(Encryption.currentCustomContext).toBeNull();

    Encryption.withEncryptionContext({ frozenEncryption: true }, () => {
      expect(Encryption.customContexts).toHaveLength(1);
      expect(Encryption.currentCustomContext).toBe(Encryption.customContexts![0]);
    });

    expect(Encryption.customContexts).toEqual([]);
    expect(Encryption.currentCustomContext).toBeUndefined();
  });

  it("a custom context is a dup of the default one, so the default keeps its properties", () => {
    const encryptor = new NullEncryptor();

    Encryption.withEncryptionContext({ encryptor }, () => {
      expect(Encryption.context).not.toBe(Encryption.defaultContext);
      expect(Encryption.context).toBeInstanceOf(Context);
      expect(Encryption.context.encryptor).toBe(encryptor);
      expect(Encryption.context.cipher).toBe(Encryption.defaultContext.cipher);
      expect(Encryption.defaultContext.encryptor).not.toBe(encryptor);
    });
  });

  it("a property Context has no writer for raises NoMethodError and pops the context", () => {
    const block = vi.fn();

    expect(() =>
      Encryption.withEncryptionContext({ encryptr: new NullEncryptor() } as never, block),
    ).toThrow(NoMethodError);

    expect(block).not.toHaveBeenCalled();
    expect(Encryption.customContexts).toEqual([]);
    expect(Encryption.context).toBe(Encryption.defaultContext);
  });

  it("an async block in another thread pops that thread's stack when it settles", async () => {
    const thread = new Thread(async () => {
      const result = await Encryption.withEncryptionContext(
        { frozenEncryption: true },
        async () => {
          await Promise.resolve();
          return Encryption.context.frozenEncryption;
        },
      );
      return [result, Encryption.customContexts];
    });
    await thread.join();

    expect(await thread.value()).toEqual([true, []]);
    expect(Encryption.customContexts).toBeNull();
  });

  it("custom_contexts is thread-local: another thread does not see an open context", () => {
    const encryptor = new NullEncryptor();

    Encryption.withEncryptionContext({ encryptor }, () => {
      new Thread(() => {
        expect(Encryption.customContexts).toBeNull();
        expect(Encryption.context).toBe(Encryption.defaultContext);
      }).value();

      expect(Encryption.context.encryptor).toBe(encryptor);
    });
  });

  it("a context opened in another thread does not leak into this one", () => {
    new Thread(() => {
      Encryption.withEncryptionContext({ frozenEncryption: true }, () => {
        expect(Encryption.context.frozenEncryption).toBe(true);
      });
    }).value();

    expect(Encryption.customContexts).toBeNull();
    expect(Encryption.context.frozenEncryption).toBe(false);
  });

  it("an async block keeps its context until the promise settles", async () => {
    const encryptor = new NullEncryptor();

    const result = Encryption.withEncryptionContext({ encryptor }, async () => {
      await Promise.resolve();
      return Encryption.context.encryptor;
    });

    expect(Encryption.context.encryptor).toBe(encryptor);
    expect(await result).toBe(encryptor);
    expect(Encryption.customContexts).toEqual([]);
  });

  it("an async block that rejects still pops its context", async () => {
    await expect(
      Encryption.withEncryptionContext({ frozenEncryption: true }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(Encryption.customContexts).toEqual([]);
  });
});
