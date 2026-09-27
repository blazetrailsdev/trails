import { EncryptedFile, MissingContentError } from "./encrypted-file.js";
import { presence } from "./core-ext/object/blank.js";

export class InvalidContentError extends Error {
  constructor(contentPath: string, options: { cause?: unknown } = {}) {
    const message = `Invalid YAML in '${contentPath}'.`;
    const cause = options.cause;
    super(
      cause instanceof Error && cause.name === "YAMLParseError"
        ? `${message}\n\n  ${cause.message}`
        : message,
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

export class EncryptedConfiguration extends EncryptedFile {
  private _config: Record<string, unknown> | null = null;

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
  }

  override async read(): Promise<string> {
    try {
      return await super.read();
    } catch (e) {
      if (e instanceof MissingContentError) return "";
      throw e;
    }
  }

  /** @missingRailsCall deep_symbolize_keys — CONVERGEABLE encrypted-configuration-options-delegation-and-validate */
  async config(): Promise<Record<string, unknown>> {
    return (this._config ??= await this.deserialize(await this.read()));
  }

  /** @internal */
  private async deserialize(content: string): Promise<Record<string, unknown>> {
    const { parse } = await import("./yaml.js");
    let config: unknown;
    try {
      config = parse(content);
    } catch (e) {
      if (e instanceof Error && e.name === "YAMLParseError") {
        throw new InvalidContentError(this.contentPath, { cause: e });
      }
      throw e;
    }
    return (presence(config) as Record<string, unknown> | undefined) ?? {};
  }
}
