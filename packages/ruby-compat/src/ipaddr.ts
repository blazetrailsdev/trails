import { ArgumentError } from "./argument-error.js";

const AF_UNSPEC = 0;
const AF_INET = 2;
const AF_INET6 = 10;

/**
 * Ruby stdlib `IPAddr` (`vendor/ruby/lib/ipaddr.rb`), the part Rails reaches
 * from `OID::Cidr` (`postgresql/oid/cidr.rb`).
 *
 * @noRailsEquivalent PERMANENT — Ruby's ipaddr library (`vendor/ruby/lib/ipaddr.rb:42`), which
 * Rails calls without defining.
 */
export class IPAddr {
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:46` */
  static readonly IN4MASK = 0xffffffffn;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:48` */
  static readonly IN6MASK = 0xffffffffffffffffffffffffffffffffn;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:53` */
  static readonly RE_IPV4ADDRLIKE = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:60` */
  static readonly RE_IPV6ADDRLIKE_FULL =
    /^(?:(?:[\da-f]{1,4}:){7}[\da-f]{1,4}|((?:[\da-f]{1,4}:){6})(\d+)\.(\d+)\.(\d+)\.(\d+))$/i;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:72` */
  static readonly RE_IPV6ADDRLIKE_COMPRESSED =
    /^((?:(?:[\da-f]{1,4}:)*[\da-f]{1,4})?)::(((?:[\da-f]{1,4}:)*)(?:[\da-f]{1,4}|(\d+)\.(\d+)\.(\d+)\.(\d+)))?$/i;

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:103` */
  family: number | null = null;
  private _addr: bigint | null = null;
  private _maskAddr: bigint | null = null;
  private _zoneId: string | null = null;

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:150` */
  equals(other: unknown): boolean {
    let coerced: IPAddr;
    try {
      coerced = this.coerceOther(other);
    } catch {
      return false;
    }
    return this.family === coerced.family && this._addr === coerced.toI();
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:184` */
  toI(): bigint {
    return this._addr!;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:189` */
  toString(): string {
    let str = this._toString(this._addr!);
    if (this.family === AF_INET6) str += this._zoneId ?? "";
    if (this.isIpv4()) return str;

    str = str.replace(/\b0{1,3}([\da-f]+)\b/gi, "$1");
    for (const re of [
      /^0:0:0:0:0:0:0:0$/,
      /\b0:0:0:0:0:0:0\b/,
      /\b0:0:0:0:0:0\b/,
      /\b0:0:0:0:0\b/,
      /\b0:0:0:0\b/,
      /\b0:0:0\b/,
      /\b0:0\b/,
    ]) {
      if (re.test(str)) {
        str = str.replace(re, re.source.startsWith("^") ? "::" : ":");
        break;
      }
    }
    str = str.replace(/:{3,}/, "::");

    const m = /^::(ffff:)?([\da-f]{1,4}):([\da-f]{1,4})$/i.exec(str);
    if (m) {
      const hi = parseInt(m[2], 16);
      const lo = parseInt(m[3], 16);
      str = `::${m[1] ?? ""}${Math.floor(hi / 256)}.${hi % 256}.${Math.floor(lo / 256)}.${lo % 256}`;
    }
    return str;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:240` */
  isIpv4(): boolean {
    return this.family === AF_INET;
  }

  /**
   * Ruby compares `hash` (`vendor/ruby/lib/ipaddr.rb:401-403`, built from
   * `@addr`, `@mask_addr`, `@zone_id` and the family); JS has no `hash`
   * protocol, so the same components are compared directly.
   *
   * @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:396`
   */
  eql(other: unknown): boolean {
    return (
      other instanceof IPAddr &&
      this.constructor === other.constructor &&
      this._addr === other._addr &&
      this._maskAddr === other._maskAddr &&
      this._zoneId === other._zoneId &&
      this.isIpv4() === other.isIpv4() &&
      this.equals(other)
    );
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:411` */
  get prefix(): number {
    let n: bigint;
    let i: number;
    switch (this.family) {
      case AF_INET:
        n = IPAddr.IN4MASK ^ this._maskAddr!;
        i = 32;
        break;
      case AF_INET6:
        n = IPAddr.IN6MASK ^ this._maskAddr!;
        i = 128;
        break;
      default:
        throw new IPAddr.AddressFamilyError("unsupported address family");
    }
    while (n > 0n) {
      n >>= 1n;
      i -= 1;
    }
    return i;
  }

  protected set(addr: bigint, ...family: number[]): this {
    switch (family[0] ? family[0] : this.family) {
      case AF_INET:
        if (addr < 0n || addr > IPAddr.IN4MASK) {
          throw new IPAddr.InvalidAddressError(`invalid address: ${this._addr ?? ""}`);
        }
        break;
      case AF_INET6:
        if (addr < 0n || addr > IPAddr.IN6MASK) {
          throw new IPAddr.InvalidAddressError(`invalid address: ${this._addr ?? ""}`);
        }
        break;
      default:
        throw new IPAddr.AddressFamilyError("unsupported address family");
    }
    this._addr = addr;
    if (family[0]) {
      this.family = family[0];
      if (this.family === AF_INET && this._maskAddr !== null) this._maskAddr &= IPAddr.IN4MASK;
    }
    return this;
  }

  protected maskBang(mask: string | number): this {
    let prefixlen: number;
    if (typeof mask === "string") {
      if (/^(0|[1-9]+\d*)$/.test(mask)) {
        prefixlen = Number(mask);
      } else if (/^\d+$/.test(mask)) {
        throw new IPAddr.InvalidPrefixError("leading zeros in prefix");
      } else {
        const m = new IPAddr(mask);
        if (m.family !== this.family) {
          throw new IPAddr.InvalidPrefixError(`address family is not same: ${this._addr}`);
        }
        this._maskAddr = m.toI();
        const n = this._maskAddr ^ m._maskAddr!;
        if (((n + 1n) & n) !== 0n) {
          throw new IPAddr.InvalidPrefixError(`invalid mask ${mask}: ${this._addr}`);
        }
        this._addr = this._addr! & this._maskAddr;
        return this;
      }
    } else {
      prefixlen = mask;
    }
    let masklen: bigint;
    switch (this.family) {
      case AF_INET:
        if (prefixlen < 0 || prefixlen > 32) {
          throw new IPAddr.InvalidPrefixError(`invalid length: ${this._addr}`);
        }
        masklen = BigInt(32 - prefixlen);
        this._maskAddr = (IPAddr.IN4MASK >> masklen) << masklen;
        break;
      case AF_INET6:
        if (prefixlen < 0 || prefixlen > 128) {
          throw new IPAddr.InvalidPrefixError(`invalid length: ${this._addr}`);
        }
        masklen = BigInt(128 - prefixlen);
        this._maskAddr = (IPAddr.IN6MASK >> masklen) << masklen;
        break;
      default:
        throw new IPAddr.AddressFamilyError("unsupported address family");
    }
    this._addr = (this._addr! >> masklen) << masklen;
    return this;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:593` */
  constructor(addr: string | bigint = "::", family: number = AF_UNSPEC) {
    this._maskAddr = null;
    if (typeof addr !== "string") {
      switch (family) {
        case AF_INET:
        case AF_INET6:
          this.set(addr, family);
          this._maskAddr = family === AF_INET ? IPAddr.IN4MASK : IPAddr.IN6MASK;
          return;
        case AF_UNSPEC:
          throw new IPAddr.AddressFamilyError("address family must be specified");
        default:
          throw new IPAddr.AddressFamilyError(`unsupported address family: ${family}`);
      }
    }
    const slash = addr.indexOf("/");
    let prefix = slash === -1 ? addr : addr.slice(0, slash);
    const prefixlen = slash === -1 ? null : addr.slice(slash + 1);
    let m = /^\[(.*)\]$/i.exec(prefix);
    if (m) {
      prefix = m[1];
      family = AF_INET6;
    }
    let zoneId: string | null = null;
    m = /^(.*)(%\w+)$/.exec(prefix);
    if (m) {
      prefix = m[1];
      zoneId = m[2];
      family = AF_INET6;
    }
    this._addr = this.family = null;
    if (family === AF_UNSPEC || family === AF_INET) {
      this._addr = this.inAddr(prefix);
      if (this._addr !== null) this.family = AF_INET;
    }
    if (this._addr === null && (family === AF_UNSPEC || family === AF_INET6)) {
      this._addr = this.in6Addr(prefix);
      this.family = AF_INET6;
    }
    this._zoneId = zoneId;
    if (family !== AF_UNSPEC && this.family !== family) {
      throw new IPAddr.AddressFamilyError("address family mismatch");
    }
    if (prefixlen !== null) {
      this.maskBang(prefixlen);
    } else {
      this._maskAddr = this.family === AF_INET ? IPAddr.IN4MASK : IPAddr.IN6MASK;
    }
  }

  private coerceOther(other: unknown): IPAddr {
    if (other instanceof IPAddr) return other;
    if (typeof other === "string") return new (this.constructor as typeof IPAddr)(other);
    return new (this.constructor as typeof IPAddr)(BigInt(other as bigint), this.family!);
  }

  private inAddr(addr: string | string[]): bigint | null {
    let octets: string[];
    if (Array.isArray(addr)) {
      octets = addr;
    } else {
      const m = IPAddr.RE_IPV4ADDRLIKE.exec(addr);
      if (!m) return null;
      octets = m.slice(1, 5);
    }
    return octets.reduce((i, s) => {
      const n = parseInt(s, 10);
      if (!(n < 256)) throw new IPAddr.InvalidAddressError(`invalid address: ${this._addr ?? ""}`);
      if (/^0./.test(s)) {
        throw new IPAddr.InvalidAddressError(
          `zero-filled number in IPv4 address is ambiguous: ${this._addr ?? ""}`,
        );
      }
      return (i << 8n) | BigInt(n);
    }, 0n);
  }

  private in6Addr(left: string): bigint | null {
    let addr: bigint;
    let right: string;
    let m: RegExpExecArray | null;
    if ((m = IPAddr.RE_IPV6ADDRLIKE_FULL.exec(left))) {
      if (m[2] !== undefined) {
        addr = this.inAddr(m.slice(2, 6))!;
        left = m[1] + ":";
      } else {
        addr = 0n;
      }
      right = "";
    } else if ((m = IPAddr.RE_IPV6ADDRLIKE_COMPRESSED.exec(left))) {
      if (m[4] !== undefined) {
        if (!(left.split(":").length - 1 <= 6)) {
          throw new IPAddr.InvalidAddressError(`invalid address: ${this._addr ?? ""}`);
        }
        addr = this.inAddr(m.slice(4, 8))!;
        left = m[1];
        right = m[3] + "0:0";
      } else {
        const one = m[1];
        const two = m[2] ?? "";
        if (!(left.split(":").length - 1 <= (one === "" || two === "" ? 8 : 7))) {
          throw new IPAddr.InvalidAddressError(`invalid address: ${this._addr ?? ""}`);
        }
        left = one;
        right = two;
        addr = 0n;
      }
    } else {
      throw new IPAddr.InvalidAddressError(`invalid address: ${this._addr ?? ""}`);
    }
    const l = left === "" ? [] : left.split(":").filter((_, i, a) => i < a.length - 1 || _ !== "");
    const r = right === "" ? [] : right.split(":");
    const rest = 8 - l.length - r.length;
    if (rest < 0) return null;
    return (
      [...l, ...Array<string>(rest).fill("0"), ...r].reduce(
        (i, s) => (i << 16n) | BigInt(parseInt(s, 16) || 0),
        0n,
      ) | addr
    );
  }

  private _toString(addr: bigint): string {
    switch (this.family) {
      case AF_INET:
        return [0, 1, 2, 3].map((i) => (addr >> BigInt(24 - 8 * i)) & 0xffn).join(".");
      case AF_INET6:
        return addr
          .toString(16)
          .padStart(32, "0")
          .replace(/.{4}(?!$)/g, "$&:");
      default:
        throw new IPAddr.AddressFamilyError("unsupported address family");
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IPAddr {
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:89` */
  export class Error extends ArgumentError {}
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:92` */
  export class InvalidAddressError extends Error {}
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:97` */
  export class AddressFamilyError extends Error {}
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/lib/ipaddr.rb:100` */
  export class InvalidPrefixError extends InvalidAddressError {}
}
