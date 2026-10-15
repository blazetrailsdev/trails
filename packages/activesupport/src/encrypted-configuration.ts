import { rbObjId, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Psych } from "@blazetrails/ruby-compat/psych";
import { EncryptedFile, MissingContentError } from "./encrypted-file.js";
import { presence } from "./core-ext/object/blank.js";
import { deepTransformKeys } from "./hash-utils.js";
import { delegateMissingTo } from "./module-ext.js";
import { OrderedOptions } from "./ordered-options.js";

export class InvalidContentError extends Error {
  constructor(contentPath: string, options: { cause?: unknown } = {}) {
    const message = `Invalid YAML in '${contentPath}'.`;
    const cause = options.cause;
    super(
      cause instanceof Psych.SyntaxError ? `${message}\n\n  ${cause.message}` : message,
      options,
    );
    this.name = "InvalidContentError";
  }
}

export class InvalidKeyError extends Error {
  constructor(contentPath: string, key: unknown) {
    super(
      `Key '${String(key)}' is invalid, it must respond to '#to_sym' from configuration in '${contentPath}'.`,
    );
    this.name = "InvalidKeyError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface EncryptedConfiguration {
  dig(key: string, ...identifiers: (string | number)[]): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class EncryptedConfiguration extends EncryptedFile {
  static name = "ActiveSupport::EncryptedConfiguration";

  private _config: Record<string, unknown> | null = null;
  private _options: OrderedOptions | null = null;

  /** @missingRailsArgs delegate_missing_to — PERMANENT */
  constructor({
    configPath,
    keyPath,
    envKey,
    raiseIfMissingKey,
  }: {
    configPath: string;
    keyPath: string;
    envKey: string;
    raiseIfMissingKey: boolean;
  }) {
    super({ contentPath: configPath, keyPath, envKey, raiseIfMissingKey });
    return delegateMissingTo.call(this, "options", { allowNil: true }) as EncryptedConfiguration;
  }

  override async read(): Promise<string> {
    try {
      return await super.read();
    } catch (e) {
      if (e instanceof MissingContentError) return "";
      throw e;
    }
  }

  async validateBang(): Promise<void> {
    const hash = this.deserialize(await this.read());
    for (const key of hash instanceof Map ? hash.keys() : Object.keys(hash)) {
      if (typeof key !== "string") throw new InvalidKeyError(this.contentPath, key);
    }
  }

  async config(): Promise<Record<string, unknown>> {
    return (this._config ??= this.deepSymbolizeKeys(this.deserialize(await this.read())));
  }

  inspect(): string {
    const id = (rbObjId(this) * 2).toString(16).padStart(14, "0");
    return `#<${(this.constructor as { name: string }).name}:0x${id}>`;
  }

  /** @internal */
  private deepSymbolizeKeys(hash: object): Record<string, unknown> {
    return deepTransformKeys(hash, (key: unknown) => {
      if (typeof key !== "string") throw new InvalidKeyError(this.contentPath, key);
      return key;
    }) as Record<string, unknown>;
  }

  /** @internal */
  private deepTransform(hash: unknown): unknown {
    if (hash === null || typeof hash !== "object" || Array.isArray(hash)) return hash;

    const h = new OrderedOptions();
    for (const [k, v] of Object.entries(hash)) {
      h.set(k, this.deepTransform(v));
    }
    return h;
  }

  /** @internal */
  private get options(): OrderedOptions | null {
    if (this._config === null) return null;
    return (this._options ??= this.deepTransform(this._config) as OrderedOptions);
  }

  /** @internal */
  private deserialize(content: string): object {
    let config: unknown;
    try {
      config = rbObjRespondTo(Psych, "unsafeLoad")
        ? Psych.unsafeLoad(content, { filename: this.contentPath })
        : Psych.load(content, { filename: this.contentPath });
    } catch (e) {
      if (e instanceof Psych.SyntaxError) {
        throw new InvalidContentError(this.contentPath, { cause: e });
      }
      throw e;
    }
    return (presence(config) as object | undefined) ?? {};
  }
}
