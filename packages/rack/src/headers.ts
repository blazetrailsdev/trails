import {
  ArgumentError,
  dup,
  eachPair,
  except,
  fetch,
  Hash,
  isPlainHash,
} from "@blazetrails/ruby-compat";

type PairBlock = (key: string, value: string) => unknown;

const KNOWN_HEADERS: Record<string, string> = {};
for (const str of [
  "Accept-CH",
  "Accept-Patch",
  "Accept-Ranges",
  "Access-Control-Allow-Credentials",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Origin",
  "Access-Control-Expose-Headers",
  "Access-Control-Max-Age",
  "Age",
  "Allow",
  "Alt-Svc",
  "Cache-Control",
  "Connection",
  "Content-Disposition",
  "Content-Encoding",
  "Content-Language",
  "Content-Length",
  "Content-Location",
  "Content-MD5",
  "Content-Range",
  "Content-Security-Policy",
  "Content-Security-Policy-Report-Only",
  "Content-Type",
  "Date",
  "Delta-Base",
  "ETag",
  "Expect-CT",
  "Expires",
  "Feature-Policy",
  "IM",
  "Last-Modified",
  "Link",
  "Location",
  "NEL",
  "P3P",
  "Permissions-Policy",
  "Pragma",
  "Preference-Applied",
  "Proxy-Authenticate",
  "Public-Key-Pins",
  "Referrer-Policy",
  "Refresh",
  "Report-To",
  "Retry-After",
  "Server",
  "Set-Cookie",
  "Status",
  "Strict-Transport-Security",
  "Timing-Allow-Origin",
  "Tk",
  "Trailer",
  "Transfer-Encoding",
  "Upgrade",
  "Vary",
  "Via",
  "WWW-Authenticate",
  "Warning",
  "X-Cascade",
  "X-Content-Duration",
  "X-Content-Security-Policy",
  "X-Content-Type-Options",
  "X-Correlation-ID",
  "X-Correlation-Id",
  "X-Download-Options",
  "X-Frame-Options",
  "X-Permitted-Cross-Domain-Policies",
  "X-Powered-By",
  "X-Redirect-By",
  "X-Request-ID",
  "X-Request-Id",
  "X-Runtime",
  "X-UA-Compatible",
  "X-WebKit-CS",
  "X-XSS-Protection",
]) {
  const downcased = str.toLowerCase();
  KNOWN_HEADERS[str] = KNOWN_HEADERS[downcased] = downcased;
}

export class Headers extends Hash<string, string> {
  static KNOWN_HEADERS = KNOWN_HEADERS;

  static get(...items: any[]): Headers {
    if (items.length % 2 !== 0) {
      if (items.length === 1 && (items[0] instanceof Hash || isPlainHash(items[0]))) {
        return new this().update(items[0] as Record<string, string> | Headers);
      } else {
        throw new ArgumentError("odd number of arguments for Rack::Headers");
      }
    } else {
      const hash = new this();
      for (;;) {
        if (items.length === 0) break;
        const key = items.shift();
        const value = items.shift();
        hash.set(key, value);
      }
      return hash;
    }
  }

  override get(key: string): string | undefined {
    return super.get(this.downcaseKey(key));
  }

  override set(key: string, value: string): this {
    return super.set(
      Object.hasOwn(KNOWN_HEADERS, key) ? KNOWN_HEADERS[key] : key.toLowerCase(),
      value,
    );
  }

  store(key: string, value: string): this {
    return this.set(key, value);
  }

  override assoc(key: string): [string, string] | null {
    return super.assoc(this.downcaseKey(key));
  }

  override compareByIdentity(): never {
    throw new TypeError("Rack::Headers cannot compare by identity, use regular Hash");
  }

  override delete(key: string, block?: (key: string) => string) {
    return super.delete(this.downcaseKey(key), block);
  }

  override dig(key: string, ...a: unknown[]): unknown {
    return super.dig(this.downcaseKey(key), ...a);
  }

  fetch(key: string, ...defaultValue: any[]): string {
    key = this.downcaseKey(key);
    return fetch(this as Map<string, string>, key, ...defaultValue) as string;
  }

  override fetchValues(...a: string[]): string[] {
    return super.fetchValues(...a.map((key) => this.downcaseKey(key)));
  }

  hasKey(key: string): boolean {
    return super.has(this.downcaseKey(key));
  }

  override isInclude(key: string): boolean {
    return this.hasKey(key);
  }

  invert(): Headers {
    const hash = new (this.constructor as typeof Headers)();
    this.each((key, value) => {
      hash.set(value, key);
    });
    return hash;
  }

  override merge(
    hash: Record<string, string> | Headers,
    block?: (key: string, oldVal: string, newVal: string) => string,
  ): Headers {
    return (dup(this) as Headers).update(hash, block);
  }

  reject(block: PairBlock): Headers {
    const hash = dup(this) as Headers;
    hash.rejectBang(block);
    return hash;
  }

  override replace(hash: Record<string, string> | Headers): this {
    this.clear();
    return this.update(hash);
  }

  select(block: PairBlock): Headers {
    const hash = dup(this) as Headers;
    hash.selectBang(block);
    return hash;
  }

  toProc(): (x: string) => string | undefined | null {
    return (x: string) => this.get(x);
  }

  transformValues(block: (value: string) => string): Headers {
    return (dup(this) as Headers).transformValuesBang(block);
  }

  update(
    hash: Record<string, string> | Headers,
    block?: (key: string, oldVal: string, newVal: string) => string,
  ): this {
    eachPair(hash, (key, value) => {
      this.set(
        key,
        block !== undefined && this.isInclude(key) ? block(key, this.get(key)!, value) : value,
      );
    });
    return this;
  }

  valuesAt(...keys: string[]): (string | undefined | null)[] {
    return keys.map((key) => this.get(key));
  }

  slice(...a: string[]): Headers {
    const h = new (this.constructor as typeof Headers)();
    a.forEach((k) => {
      if (this.hasKey(k)) h.set(k, this.get(k)!);
    });
    return h;
  }

  transformKeys(block: (key: string) => string): Headers {
    return (dup(this) as Headers).transformKeysBang(block);
  }

  transformKeysBang(block: (key: string) => string): this {
    const hash = new (this.constructor as typeof Headers)();
    this.each((k, v) => {
      hash.set(block(k), v);
    });
    return this.replace(hash);
  }

  except(...a: string[]): Hash<string, string> {
    return except(this as Map<string, string>, ...a.map((key) => this.downcaseKey(key)));
  }

  /** @internal */
  private downcaseKey(key: string): string {
    return typeof key === "string"
      ? Object.hasOwn(KNOWN_HEADERS, key)
        ? KNOWN_HEADERS[key]
        : key.toLowerCase()
      : key;
  }
}
