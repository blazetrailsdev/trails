import { ArgumentError } from "./argument-error.js";

/** `toofew` (`vendor/ruby/pack.c:120`). */
const toofew = "too few arguments";

/** `b64_table` (`vendor/ruby/pack.c:789`). */
const b64Table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** `unknown_directive` (`vendor/ruby/pack.c:160`). */
function unknownDirective(mode: string, type: string, fmt: string): never {
  throw new ArgumentError(`unknown ${mode} directive '${type}' in '${fmt}'`);
}

/**
 * `encodes` (`vendor/ruby/pack.c:791`) for `type == 'm'` — `len` bytes of `s0`
 * as Base64, plus the trailing newline `tailLf` asks for. MRI's `buff_size`
 * flush has no analogue: a JS array grows.
 */
function encodes(str: string[], s0: Uint8Array, len: number, tailLf: number): void {
  const buff: string[] = [];
  const trans = b64Table;
  const padding = "=";
  const s = s0;
  let i = 0;

  while (len >= 3) {
    buff.push(trans[0o77 & (s[i] >> 2)]);
    buff.push(trans[0o77 & (((s[i] << 4) & 0o60) | ((s[i + 1] >> 4) & 0o17))]);
    buff.push(trans[0o77 & (((s[i + 1] << 2) & 0o74) | ((s[i + 2] >> 6) & 0o3))]);
    buff.push(trans[0o77 & s[i + 2]]);
    i += 3;
    len -= 3;
  }

  if (len === 2) {
    buff.push(trans[0o77 & (s[i] >> 2)]);
    buff.push(trans[0o77 & (((s[i] << 4) & 0o60) | ((s[i + 1] >> 4) & 0o17))]);
    buff.push(trans[0o77 & (((s[i + 1] << 2) & 0o74) | ((0 >> 6) & 0o3))]);
    buff.push(padding);
  } else if (len === 1) {
    buff.push(trans[0o77 & (s[i] >> 2)]);
    buff.push(trans[0o77 & (((s[i] << 4) & 0o60) | ((0 >> 4) & 0o17))]);
    buff.push(padding);
    buff.push(padding);
  }
  if (tailLf) buff.push("\n");
  str.push(buff.join(""));
}

/**
 * `pack_pack` (`vendor/ruby/pack.c:197`), narrowed to the `m` directive
 * (`pack.c:663-690`) — Base64, wrapped at `len` input bytes per line, or
 * strict with no line breaks at all when the count is an explicit `0`. `m0` is
 * what `Rack::Test::Session#basic_authorize` packs with
 * (`vendor/rack-test/lib/rack/test.rb:199`). Every other directive is a
 * separate port, so each reaches `unknown_directive` (`pack.c:761`) here.
 *
 * `*` is `1` for the `PMm` types rather than the array remainder
 * (`pack.c:281-284`), so `m*` is `m`. The `u`-only `len > 63` clamp
 * (`pack.c:676`) is not reachable without that directive.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Array#pack`
 * (`vendor/ruby/pack.c:197`).
 */
export function pack(ary: ReadonlyArray<string>, fmt: string): string {
  const res: string[] = [];
  let p = 0;
  const pend = fmt.length;
  let idx = 0;

  const nextfrom = (): string => {
    if (idx >= ary.length) throw new ArgumentError(toofew);
    return ary[idx++];
  };

  while (p < pend) {
    const type = fmt[p++];

    if (/\s/.test(type)) continue;
    if (type === "#") {
      while (p < pend && fmt[p] !== "\n") {
        p++;
      }
      continue;
    }

    let len: number;
    if (fmt[p] === "*") {
      len = 1;
      p++;
    } else if (fmt[p] >= "0" && fmt[p] <= "9") {
      let digits = "";
      while (fmt[p] >= "0" && fmt[p] <= "9") digits += fmt[p++];
      len = Number(digits);
    } else {
      len = 1;
    }

    if (type !== "m") unknownDirective("pack", type, fmt);

    const from = nextfrom();
    const s = new TextEncoder().encode(from);
    let ptr = 0;
    let plen = s.length;

    if (len === 0) {
      encodes(res, s.subarray(ptr), plen, 0);
      continue;
    }
    if (len <= 2) len = 45;
    else len = Math.floor(len / 3) * 3;
    while (plen > 0) {
      const todo = plen > len ? len : plen;
      encodes(res, s.subarray(ptr), todo, 1);
      plen -= todo;
      ptr += todo;
    }
  }

  return res.join("");
}
