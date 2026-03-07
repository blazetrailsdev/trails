/**
 * KeyGenerator — derives cryptographic keys using PBKDF2.
 * Mirrors Rails ActiveSupport::KeyGenerator.
 */

import { pbkdf2Sync, randomBytes } from "crypto";

export class KeyGenerator {
  private readonly secret: string;
  private readonly iterations: number;

  constructor(secret: string, options: { iterations?: number } = {}) {
    this.secret = secret;
    this.iterations = options.iterations ?? 65536;
  }

  /**
   * generateKey — derives a key of the given length (in bytes) for the given salt.
   * Returns the key as a Buffer.
   */
  generateKey(salt: string, keySize: number = 64): Buffer {
    return pbkdf2Sync(this.secret, salt, this.iterations, keySize, "sha1");
  }

  inspect(): string {
    return `#<KeyGenerator secret="[FILTERED]" iterations=${this.iterations}>`;
  }
}

/**
 * CachingKeyGenerator — wraps KeyGenerator with a memoization cache.
 * Mirrors Rails ActiveSupport::CachingKeyGenerator.
 */
export class CachingKeyGenerator {
  private readonly generator: KeyGenerator;
  private readonly cache = new Map<string, Buffer>();

  constructor(generator: KeyGenerator) {
    this.generator = generator;
  }

  generateKey(salt: string, keySize: number = 64): Buffer {
    const cacheKey = `${salt}|${keySize}`;
    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, this.generator.generateKey(salt, keySize));
    }
    return this.cache.get(cacheKey)!;
  }
}

// ── SecureRandom extensions ───────────────────────────────────────────────────

const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE36_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomCharFrom(chars: string): string {
  const bytes = randomBytes(1);
  return chars[bytes[0] % chars.length];
}

/**
 * secureRandomBase58 — generates a random base-58 string of given length.
 * Mirrors Ruby's SecureRandom.base58.
 */
export function secureRandomBase58(n: number = 16): string {
  return Array.from({ length: n }, () => randomCharFrom(BASE58_CHARS)).join("");
}

/**
 * secureRandomBase36 — generates a random base-36 (alphanumeric lowercase) string.
 * Mirrors Ruby's SecureRandom.base36.
 */
export function secureRandomBase36(n: number = 16): string {
  return Array.from({ length: n }, () => randomCharFrom(BASE36_CHARS)).join("");
}

// ── BacktraceCleaner ──────────────────────────────────────────────────────────

type LineFilter = (line: string) => string;
type LineSilencer = (line: string) => boolean;

/**
 * BacktraceCleaner — filters and silences backtrace lines.
 * Mirrors Rails ActiveSupport::BacktraceCleaner.
 */
export class BacktraceCleaner {
  private _filters: LineFilter[] = [];
  private _silencers: LineSilencer[] = [];

  /** addFilter — adds a filter that transforms backtrace lines. */
  addFilter(filter: LineFilter): this {
    this._filters.push(filter);
    return this;
  }

  /** addSilencer — adds a silencer that removes matching lines. */
  addSilencer(silencer: LineSilencer): this {
    this._silencers.push(silencer);
    return this;
  }

  /** removeFilters — removes all filters. */
  removeFilters(): this {
    this._filters = [];
    return this;
  }

  /** removeSilencers — removes all silencers. */
  removeSilencers(): this {
    this._silencers = [];
    return this;
  }

  /** clean — applies all filters and silencers to a backtrace array. */
  clean(backtrace: string[]): string[] {
    return backtrace
      .map((line) => this._applyFilters(line))
      .filter((line) => !this._isSilenced(line));
  }

  private _applyFilters(line: string): string {
    return this._filters.reduce((l, filter) => filter(l), line);
  }

  private _isSilenced(line: string): boolean {
    return this._silencers.some((s) => s(line));
  }

  dup(): BacktraceCleaner {
    const copy = new BacktraceCleaner();
    copy._filters = [...this._filters];
    copy._silencers = [...this._silencers];
    return copy;
  }
}
