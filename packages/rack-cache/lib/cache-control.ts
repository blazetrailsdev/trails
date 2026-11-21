import { Hash, toI } from "@blazetrails/ruby-compat";
import { stringSplit } from "@blazetrails/ruby-compat";

export class CacheControl extends Hash<string, string | boolean> {
  constructor(value: string | null = null) {
    super();
    this.parse(value);
  }

  isPublic(): string | boolean | undefined {
    return this.get("public");
  }

  isPrivate(): string | boolean | undefined {
    return this.get("private");
  }

  isNoCache(): string | boolean | undefined {
    return this.get("no-cache");
  }

  isNoStore(): string | boolean | undefined {
    return this.get("no-store");
  }

  maxAge(): number | bigint | null {
    if (this.has("max-age")) return toI(this.get("max-age"));
    return null;
  }

  sharedMaxAge(): number | bigint | null {
    if (this.has("s-maxage")) return toI(this.get("s-maxage"));
    return null;
  }

  sMaxage(): number | bigint | null {
    return this.sharedMaxAge();
  }

  reverseMaxAge(): number | bigint | null {
    if (this.has("r-maxage")) return toI(this.get("r-maxage"));
    return null;
  }

  rMaxage(): number | bigint | null {
    return this.reverseMaxAge();
  }

  isMustRevalidate(): string | boolean | undefined {
    return this.get("must-revalidate");
  }

  isProxyRevalidate(): string | boolean | undefined {
    return this.get("proxy-revalidate");
  }

  override toString(): string {
    const bools: string[] = [];
    const vals: string[] = [];
    for (const [key, value] of this) {
      if (value === true) {
        bools.push(key);
      } else if (value != null && value !== false) {
        vals.push(`${key}=${value}`);
      }
    }
    return [...bools.sort(), ...vals.sort()].join(", ");
  }

  /** @internal */
  private parse(value: string | null): this | undefined {
    if (value == null || value.length === 0) return;
    for (const part of value.replaceAll(" ", "").split(",")) {
      if (part.length === 0) continue;
      const [name, value] = stringSplit(part, "=", 2);
      if (name.length !== 0) this.set(name.toLowerCase(), value ?? true);
    }
    return this;
  }
}
