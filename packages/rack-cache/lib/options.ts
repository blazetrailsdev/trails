import { ArgumentError, camelized, classModule, rbBlockGivenP } from "@blazetrails/ruby-compat";
import { Key } from "./key.js";
import { Storage } from "./storage.js";

type OptionsHash = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Options {
  verbose: unknown;
  /** @noRailsEquivalent PERMANENT */
  isVerbose(): boolean;
  storage: unknown;
  /** @noRailsEquivalent PERMANENT */
  isStorage(): boolean;
  metastore: unknown;
  /** @noRailsEquivalent PERMANENT */
  isMetastore(): boolean;
  cacheKey: unknown;
  /** @noRailsEquivalent PERMANENT */
  isCacheKey(): boolean;
  entitystore: unknown;
  /** @noRailsEquivalent PERMANENT */
  isEntitystore(): boolean;
  defaultTtl: unknown;
  /** @noRailsEquivalent PERMANENT */
  isDefaultTtl(): boolean;
  ignoreHeaders: unknown;
  /** @noRailsEquivalent PERMANENT */
  isIgnoreHeaders(): boolean;
  privateHeaders: unknown;
  /** @noRailsEquivalent PERMANENT */
  isPrivateHeaders(): boolean;
  allowReload: unknown;
  /** @noRailsEquivalent PERMANENT */
  isAllowReload(): boolean;
  allowRevalidate: unknown;
  /** @noRailsEquivalent PERMANENT */
  isAllowRevalidate(): boolean;
  useNativeTtl: unknown;
  /** @noRailsEquivalent PERMANENT */
  isUseNativeTtl(): boolean;
  faultTolerant: unknown;
  /** @noRailsEquivalent PERMANENT */
  isFaultTolerant(): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Options {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  /** @internal */
  declare _env: OptionsHash | null | undefined;

  /** @internal */
  declare _defaultOptions: OptionsHash;

  static optionAccessor(key: string): void {
    const name = this.optionName(key);
    const method = camelized(key.slice(1));
    Object.defineProperty(this.prototype, method, {
      get(this: Options) {
        return this.options[name];
      },
      set(this: Options, value: unknown) {
        this.options[name] = value;
      },
      configurable: true,
    });
    Object.defineProperty(this.prototype, `is${method[0].toUpperCase()}${method.slice(1)}`, {
      value(this: Options) {
        return this.options[name] != null && this.options[name] !== false;
      },
      writable: true,
      configurable: true,
    });
  }

  static optionName(key: unknown): string {
    if (typeof key === "string" && key.startsWith(":")) {
      return `rack-cache.${key.slice(1)}`;
    } else if (typeof key === "string") {
      return key;
    } else {
      throw new ArgumentError();
    }
  }

  optionName(key: unknown): string {
    return Options.optionName(key);
  }

  get options(): OptionsHash {
    return this._env ?? this._defaultOptions;
  }

  set options(hash: OptionsHash) {
    for (const [key, value] of Object.entries(hash)) this.writeOption(key, value);
  }

  set(option: unknown, ...args: unknown[]): unknown {
    const block = rbBlockGivenP(args.at(-1)) ? args.pop() : undefined;
    const value = args.length > 0 ? args[0] : this;
    if (block !== undefined) {
      return this.writeOption(option, block);
    } else if (value === this) {
      return (this.options = option as OptionsHash);
    } else {
      return this.writeOption(option, value);
    }
  }

  /** @internal */
  protected initializeOptions(options: OptionsHash = {}): void {
    this._defaultOptions = {
      "rack-cache.cache_key": Key,
      "rack-cache.verbose": true,
      "rack-cache.storage": Storage.instance(),
      "rack-cache.metastore": "heap:/",
      "rack-cache.entitystore": "heap:/",
      "rack-cache.default_ttl": 0,
      "rack-cache.ignore_headers": ["set-cookie"],
      "rack-cache.private_headers": ["Authorization", "Cookie"],
      "rack-cache.allow_reload": false,
      "rack-cache.allow_revalidate": false,
      "rack-cache.use_native_ttl": false,
      "rack-cache.fault_tolerant": false,
    };
    this.options = options;
  }

  /** @internal */
  protected readOption(key: unknown): unknown {
    return this.options[this.optionName(key)];
  }

  /** @internal */
  protected writeOption(key: unknown, value: unknown): unknown {
    return (this.options[this.optionName(key)] = value);
  }
}

Options.optionAccessor(":verbose");
Options.optionAccessor(":storage");
Options.optionAccessor(":metastore");
Options.optionAccessor(":cache_key");
Options.optionAccessor(":entitystore");
Options.optionAccessor(":default_ttl");
Options.optionAccessor(":ignore_headers");
Options.optionAccessor(":private_headers");
Options.optionAccessor(":allow_reload");
Options.optionAccessor(":allow_revalidate");
Options.optionAccessor(":use_native_ttl");
Options.optionAccessor(":fault_tolerant");
