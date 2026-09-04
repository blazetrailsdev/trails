/** `b64_table` (`vendor/ruby/pack.c:789`). */
const b64Table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * `encodes` (`vendor/ruby/pack.c:791`) for `type == 'm'`: `len` bytes of `s0`
 * as Base64, with the trailing newline `tail_lf` asks for.
 */
function encodes(res: string[], s: Uint8Array, s0: number, len: number, tailLf: number): void {
  const trans = b64Table;
  const padding = "=";
  const buff: string[] = [];
  let s1 = s0;

  while (len >= 3) {
    buff.push(trans[0o77 & (s[s1] >> 2)]);
    buff.push(trans[0o77 & (((s[s1] << 4) & 0o60) | ((s[s1 + 1] >> 4) & 0o17))]);
    buff.push(trans[0o77 & (((s[s1 + 1] << 2) & 0o74) | ((s[s1 + 2] >> 6) & 0o3))]);
    buff.push(trans[0o77 & s[s1 + 2]]);
    s1 += 3;
    len -= 3;
  }

  if (len === 2) {
    buff.push(trans[0o77 & (s[s1] >> 2)]);
    buff.push(trans[0o77 & (((s[s1] << 4) & 0o60) | ((s[s1 + 1] >> 4) & 0o17))]);
    buff.push(trans[0o77 & ((s[s1 + 1] << 2) & 0o74)]);
    buff.push(padding);
  } else if (len === 1) {
    buff.push(trans[0o77 & (s[s1] >> 2)]);
    buff.push(trans[0o77 & ((s[s1] << 4) & 0o60)]);
    buff.push(padding);
    buff.push(padding);
  }
  if (tailLf) buff.push("\n");
  res.push(buff.join(""));
}

/**
 * `pack_pack` (`vendor/ruby/pack.c:197`), narrowed to the `m` directive
 * (`pack.c:663-690`) — Base64, wrapped at `len` input bytes per line, or
 * strict with no line breaks at all when the count is an explicit `0`.
 *
 * `m0` is the directive `Rack::Test::Session#basic_authorize` packs with
 * (`vendor/rack-test/lib/rack/test.rb:199`). `*` is `1` for the `PMm` types
 * rather than the array remainder (`pack.c:281-284`), so `m*` is `m`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Array#pack`
 * (`vendor/ruby/pack.c:197`).
 */
export function pack(ary: ReadonlyArray<string>, fmt: string): string {
  const res: string[] = [];
  let p = 0;
  let idx = 0;

  while (p < fmt.length) {
    const type = fmt[p++];
    if (type === " " || type === "\t" || type === "\n" || type === "\v" || type === "\f") continue;
    let len = 1;
    if (fmt[p] === "*") {
      len = 1;
      p++;
    } else if (fmt[p] >= "0" && fmt[p] <= "9") {
      let digits = "";
      while (fmt[p] >= "0" && fmt[p] <= "9") digits += fmt[p++];
      len = Number(digits);
    }

    if (type !== "m") {
      throw new TypeError(`unknown pack directive '${type}' in '${fmt}'`);
    }

    const from = ary[idx++];
    const s = new TextEncoder().encode(String(from));
    let ptr = 0;
    let plen = s.length;

    if (len === 0) {
      encodes(res, s, ptr, plen, 0);
      continue;
    }
    if (len <= 2) len = 45;
    else len = Math.floor(len / 3) * 3;
    while (plen > 0) {
      const todo = plen > len ? len : plen;
      encodes(res, s, ptr, todo, 1);
      plen -= todo;
      ptr += todo;
    }
  }

  return res.join("");
}
