import { ValueType } from "@blazetrails/activemodel";

export class IPAddr {
  constructor(
    readonly address: string,
    readonly prefixLength: number,
  ) {}

  get prefix(): number {
    return this.prefixLength;
  }

  toString(): string {
    return this.address;
  }
}

export class Cidr extends ValueType<IPAddr> {
  readonly name: string = "cidr";

  override type(): string {
    return "cidr";
  }

  cast(value: unknown): IPAddr | null {
    return this.castValue(value);
  }

  override deserialize(value: unknown): IPAddr | null {
    return this.castValue(value);
  }

  override serialize(value: unknown): string | null {
    if (value instanceof IPAddr) return `${value}/${value.prefixLength}`;
    if (value == null) return null;
    return String(value);
  }

  override isChanged(
    oldValue: unknown,
    newValue: unknown,
    _newValueBeforeTypeCast?: unknown,
  ): boolean {
    const oldC = toComparable(oldValue);
    const newC = toComparable(newValue);
    if (oldC === null && newC === null) return false;
    if (oldC === null || newC === null) return true;
    return oldC.address !== newC.address || oldC.prefix !== newC.prefix;
  }

  castValue(value: unknown): IPAddr | null {
    if (value == null) return null;
    if (value instanceof IPAddr) return value;
    if (typeof value !== "string") return null;
    return parseIpAddr(value);
  }

  override typeCastForSchema(value: unknown): string {
    if (value instanceof IPAddr) {
      if (value.prefixLength === 32) return JSON.stringify(value.address);
      return JSON.stringify(`${value.address}/${value.prefixLength}`);
    }
    return super.typeCastForSchema(value);
  }
}

function toComparable(value: unknown): { address: string; prefix: number } | null {
  if (value === null || value === undefined) return null;
  if (value instanceof IPAddr) return { address: value.address, prefix: value.prefixLength };
  if (typeof value === "string") {
    const ip = parseIpAddr(value);
    if (ip === null) return null;
    return { address: ip.address, prefix: ip.prefixLength };
  }
  return null;
}

function parseIpAddr(value: string): IPAddr | null {
  if (value === "") return null;
  const slash = value.indexOf("/");
  const address = slash === -1 ? value : value.slice(0, slash);
  const prefixStr = slash === -1 ? null : value.slice(slash + 1);

  if (isIpv4(address)) {
    if (prefixStr == null) return new IPAddr(address, 32);
    if (!isValidPrefix(prefixStr, 32)) return null;
    return new IPAddr(address, Number(prefixStr));
  }
  if (isIpv6(address)) {
    const canonical = canonicalizeIpv6(address);
    if (prefixStr == null) return new IPAddr(canonical, 128);
    if (!isValidPrefix(prefixStr, 128)) return null;
    return new IPAddr(canonical, Number(prefixStr));
  }
  return null;
}

function canonicalizeIpv6(value: string): string {
  const lastColon = value.lastIndexOf(":");
  let ipv4Tail: string | null = null;
  let head = value;

  if (lastColon !== -1 && value.slice(lastColon + 1).includes(".")) {
    ipv4Tail = value.slice(lastColon + 1);
    head = value.slice(0, lastColon + 1) + "0:0";
  }

  let groups: string[];
  if (head.includes("::")) {
    const [left, right] = head.split("::");
    const l = left === "" ? [] : left.split(":");
    const r = right === "" ? [] : right.split(":");
    const missing = 8 - l.length - r.length;
    groups = [...l, ...Array(missing).fill("0"), ...r];
  } else {
    groups = head.split(":");
  }

  groups = groups.map((g) => parseInt(g, 16).toString(16));

  if (!ipv4Tail && groups[5] === "ffff" && groups.slice(0, 5).every((g) => g === "0")) {
    const g6 = parseInt(groups[6], 16);
    const g7 = parseInt(groups[7], 16);
    ipv4Tail = `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;
  }

  const activeGroups = ipv4Tail ? groups.slice(0, 6) : groups;

  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i <= activeGroups.length; i++) {
    if (i < activeGroups.length && activeGroups[i] === "0") {
      if (curStart === -1) curStart = i;
      curLen++;
    } else {
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
      curStart = -1;
      curLen = 0;
    }
  }

  let hexResult: string;
  if (bestLen < 2) {
    hexResult = activeGroups.join(":");
  } else {
    const before = activeGroups.slice(0, bestStart).join(":");
    const after = activeGroups.slice(bestStart + bestLen).join(":");
    hexResult = `${before}::${after}`;
  }

  if (ipv4Tail) {
    return hexResult.endsWith("::") ? hexResult + ipv4Tail : hexResult + ":" + ipv4Tail;
  }
  return hexResult;
}

const IPV4_OCTET = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((p) => IPV4_OCTET.test(p));
}

const IPV6_HEXTET = /^[0-9a-fA-F]{1,4}$/;

function isIpv6(value: string): boolean {
  if (!value.includes(":")) return false;
  const doubleColons = value.match(/::/g);
  if (doubleColons && doubleColons.length > 1) return false;
  if (value === "::") return true;

  const parts = value.split(":");
  const last = parts[parts.length - 1];
  let ipv4Tail = false;
  if (last.includes(".")) {
    if (!isIpv4(last)) return false;
    ipv4Tail = true;
    parts[parts.length - 1] = "0";
    parts.push("0");
  }

  if (value.includes("::")) {
    const [left, right] = value.split("::");
    const leftParts = left === "" ? [] : left.split(":");
    let rightParts = right === "" ? [] : right.split(":");
    if (ipv4Tail) {
      rightParts = rightParts.slice(0, -1).concat(["0", "0"]);
    }
    if (
      leftParts.some((p) => !IPV6_HEXTET.test(p)) ||
      rightParts.some((p) => !IPV6_HEXTET.test(p))
    ) {
      return false;
    }
    return leftParts.length + rightParts.length < 8;
  }

  return parts.length === 8 && parts.every((p) => IPV6_HEXTET.test(p));
}

function isValidPrefix(prefix: string, max: number): boolean {
  if (!/^\d{1,3}$/.test(prefix)) return false;
  const n = Number(prefix);
  return n >= 0 && n <= max;
}
