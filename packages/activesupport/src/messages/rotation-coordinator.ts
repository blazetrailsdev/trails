import { extractKeys, isPlainObject } from "../hash-utils.js";
import type { OnRotation } from "./rotator.js";
// The `messages/` ports raise through the Ruby builtins declared in
// serializer-with-fallback.ts; activesupport has no separate errors module, and
// hash-utils' ArgumentError is the core-ext hash extensions' own copy.
import { ArgumentError, RuntimeError } from "./serializer-with-fallback.js";

/**
 * Ruby's secret generator block, `->(salt, **kwargs) { ... }`. Ruby reads the
 * block's keyword parameters with `Method#parameters` to decide which of the
 * `rotate` options belong to the generator; TypeScript has no parameter
 * reflection, so a generator that takes options declares their names on
 * `parameters` instead.
 */
export interface SecretGenerator {
  (salt: string, options: Record<string, unknown>): unknown;
  parameters?: readonly string[];
}

export interface RotateOptions extends Record<string, unknown> {
  secretGenerator?: SecretGenerator;
}

/**
 * A codec key. Ruby salts are usually Symbols but any object works, and the
 * coordinator stringifies only when it builds, so `rotate` blocks see the salt
 * in its original form.
 */
export type Salt = string | symbol;

/** Ruby's `rotate { |salt| ... }` block, which may return nil to skip a salt. */
export type RotateBlock = (salt: Salt) => RotateOptions | null | undefined;

export interface BuildOptions extends Record<string, unknown> {
  secretGenerator: SecretGenerator;
  secretGeneratorOptions: Record<string, unknown>;
  onRotation: OnRotation | null;
}

/** The codec surface `build_with_rotations` reduces over. */
export interface FallsBack<C> {
  fallBackTo(fallback: C): C;
}

export abstract class RotationCoordinator<C extends FallsBack<C>> {
  transitional: boolean | null = null;

  readonly #secretGenerator: SecretGenerator;
  #rotateOptions: (RotateOptions | RotateBlock)[] = [];
  #onRotation: OnRotation | null = null;
  #codecs = new Map<Salt, C>();

  constructor(secretGenerator?: SecretGenerator) {
    if (!secretGenerator) throw new ArgumentError("A secret generator block is required");
    this.#secretGenerator = secretGenerator;
  }

  get(salt: Salt): C {
    let codec = this.#codecs.get(salt);
    if (!codec) {
      codec = this.buildWithRotations(salt);
      this.#codecs.set(salt, codec);
    }
    return codec;
  }

  set(salt: Salt, codec: C): void {
    this.#codecs.set(salt, codec);
  }

  rotate(options: RotateOptions | RotateBlock = {}, block?: RotateBlock): this {
    const rotationBlock = typeof options === "function" ? options : block;
    const rotationOptions = typeof options === "function" ? {} : options;
    if (rotationBlock && Object.keys(rotationOptions).length > 0) {
      throw new ArgumentError("Options cannot be specified when using a block");
    }
    this.changingConfigurationBang();

    this.#rotateOptions.push(rotationBlock ?? rotationOptions);

    return this;
  }

  rotateDefaults(): this {
    return this.rotate();
  }

  clearRotations(): this {
    this.changingConfigurationBang();
    this.#rotateOptions = [];
    return this;
  }

  onRotation(callback: OnRotation): OnRotation {
    this.changingConfigurationBang();
    this.#onRotation = callback;
    return callback;
  }

  /** @internal */
  private changingConfigurationBang(): void {
    if (this.#codecs.size > 0) {
      throw new RuntimeError(
        `Cannot change ${this.constructor.name} configuration after it has already been applied.\n\n` +
          "The configuration has been applied with the following salts:\n" +
          `${[...this.#codecs.keys()].map((salt) => `- ${inspect(salt)}`).join("\n")}\n`,
      );
    }
  }

  /** @internal */
  private normalizeOptions(options: RotateOptions): BuildOptions {
    const normalized = { ...options } as Record<string, unknown>;

    normalized.secretGenerator ??= this.#secretGenerator;

    const secretGeneratorKwargs = (normalized.secretGenerator as SecretGenerator).parameters ?? [];
    normalized.secretGeneratorOptions = extractKeys(normalized, ...secretGeneratorKwargs);

    normalized.onRotation = this.#onRotation;

    return normalized as BuildOptions;
  }

  /** @internal */
  private buildWithRotations(salt: Salt): C {
    const evaluated = this.#rotateOptions.map((options) =>
      typeof options === "function" ? options(salt) : options,
    );
    const transitional = this.transitional && evaluated[0];
    let compacted = evaluated.filter((options): options is RotateOptions => options != null);
    if (transitional) {
      compacted = [...compacted.slice(0, 2).reverse(), ...compacted.slice(2)];
    }
    const rotateOptions = uniq(compacted.map((options) => this.normalizeOptions(options)));

    if (rotateOptions.length === 0)
      throw new RuntimeError(`No options have been configured for ${saltToS(salt)}`);

    return rotateOptions
      .map((options) => this.build(saltToS(salt), options))
      .reduce((codec, fallback) => codec.fallBackTo(fallback));
  }

  /** @internal */
  protected abstract build(salt: string, options: BuildOptions): C;
}

/** Ruby's `Symbol#to_s` / `String#to_s` over a salt. */
function saltToS(salt: Salt): string {
  return typeof salt === "symbol" ? (salt.description ?? "") : salt;
}

/** Ruby's `Symbol#inspect` / `String#inspect` over a salt. */
function inspect(salt: Salt): string {
  return typeof salt === "symbol" ? `:${salt.description ?? ""}` : JSON.stringify(salt);
}

/** Ruby's `Array#uniq` over option hashes, which compares them by value. */
function uniq(optionsList: BuildOptions[]): BuildOptions[] {
  const unique: BuildOptions[] = [];
  for (const options of optionsList) {
    if (!unique.some((seen) => valuesEqual(seen, options))) unique.push(options);
  }
  return unique;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => key in b && valuesEqual(a[key], b[key]));
}
