import { ArgumentError } from "../argument-error.js";
import { ConverterNotFoundError } from "../converter-not-found-error.js";
import { Encoding } from "../encoding.js";
import { InvalidByteSequenceError } from "../invalid-byte-sequence-error.js";
import { UndefinedConversionError } from "../undefined-conversion-error.js";
import { bytes, sequenceLength } from "./bytes.js";
import { forceEncoding, rbObjEncoding } from "./force-encoding.js";

const SINGLE_BYTE: Record<string, number> = {
  "US-ASCII": 0x7f,
  "ASCII-8BIT": 0x7f,
  "ISO-8859-1": 0xff,
};

/** `econv_opts`' `:invalid` / `:undef` arms (`vendor/ruby/v3.3.11/transcode.c:2489-2512`). */
function econvOpts(v: unknown, option: string): boolean {
  if (v == null) return false;
  if (v === ":replace") return true;
  throw new ArgumentError(`unknown value for ${option} character option`);
}

function dump(b: number[]): string {
  return `"${b.map((c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : `\\x${c.toString(16).toUpperCase().padStart(2, "0")}`)).join("")}"`;
}

/**
 * Ruby core `String#encode` (`vendor/ruby/v3.3.11/transcode.c:2906` `str_encode`, over
 * `str_transcode0` at `:2737`): `str` transcoded from its own encoding, which
 * {@link rbObjEncoding} reads, to `encoding`. `invalid: ":replace"` and
 * `undef: ":replace"` are `econv_opts`' two flags (`transcode.c:2489-2512`);
 * without one, an invalid byte sequence raises `Encoding::InvalidByteSequenceError`
 * and a character the destination cannot hold `Encoding::UndefinedConversionError`,
 * with `make_econv_exception`'s messages (`transcode.c:2108-2170`). The
 * replacement is `"�"` in a Unicode destination and `"?"` in any other
 * (`output_replacement_character`, `transcode.c:2291`).
 *
 * Between two equal encodings the receiver is scrubbed when `invalid` is
 * given (`transcode.c:2772-2783`) and returned as it is otherwise; ASCII-8BIT
 * and ISO-8859-1 hold no invalid byte, so their scrub is the receiver. The
 * converters here are the ones between UTF-8, US-ASCII, ASCII-8BIT and
 * ISO-8859-1; any other pair raises `Encoding::ConverterNotFoundError`, as
 * `rb_econv_open_exc` (`transcode.c:2097`) does for a pair MRI has no
 * transcoder for.
 *
 * A UTF-8 result is a JS string, and so is a US-ASCII one, which is 7-bit;
 * any other is its bytes, associated with `encoding` as {@link forceEncoding}
 * associates them.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#encode` (`vendor/ruby/v3.3.11/transcode.c:2906`).
 */
export function encode(
  str: string | Uint8Array,
  encoding: string | Encoding,
  opts: { invalid?: ":replace" | null; undef?: ":replace" | null } = {},
): string | Uint8Array {
  const invalidReplace = econvOpts(opts.invalid, "invalid");
  const undefReplace = econvOpts(opts.undef, "undefined");
  const senc = rbObjEncoding(str);
  const denc = Encoding.find(encoding);
  if (denc === null) return str;

  if (
    senc === denc &&
    !(invalidReplace && (senc === Encoding.UTF_8 || senc === Encoding.US_ASCII))
  ) {
    return str;
  }
  const unicode = (enc: Encoding): boolean => enc === Encoding.UTF_8;
  if (
    !(unicode(senc) || senc.name in SINGLE_BYTE) ||
    !(unicode(denc) || denc.name in SINGLE_BYTE)
  ) {
    throw new ConverterNotFoundError(`code converter not found (${senc} to ${denc})`);
  }

  const direct = unicode(senc) || unicode(denc);
  const steps = `in conversion from ${senc} to UTF-8 to ${denc}`;
  const rep = unicode(denc) ? 0xfffd : 0x3f;
  const max = unicode(denc) ? 0x10ffff : SINGLE_BYTE[denc.name];
  const b = typeof str === "string" ? bytes(str) : Array.from(str);
  const dest: number[] = [];

  let i = 0;
  while (i < b.length) {
    let len = 1;
    let c = b[i];
    if (unicode(senc)) {
      len = sequenceLength(b, i);
      if (len < 0) {
        if (!invalidReplace) throw invalidByteSequence(b, i, -len, senc, denc);
        dest.push(rep);
        i -= len;
        continue;
      }
      c = new TextDecoder().decode(Uint8Array.from(b.slice(i, i + len))).codePointAt(0)!;
    } else if (c > SINGLE_BYTE[senc.name]) {
      if (senc === Encoding.ASCII_8BIT) {
        if (!undefReplace) {
          throw new UndefinedConversionError(
            direct ? `${dump([c])} from ${senc} to ${denc}` : `${dump([c])} to UTF-8 ${steps}`,
          );
        }
      } else if (!invalidReplace) {
        throw invalidByteSequence(b, i, 1, senc, denc);
      }
      dest.push(rep);
      i += 1;
      continue;
    }
    if (c > max) {
      if (!undefReplace) {
        const u = `U+${c.toString(16).toUpperCase().padStart(4, "0")}`;
        throw new UndefinedConversionError(
          direct ? `${u} from ${senc} to ${denc}` : `${u} to ${denc} ${steps}`,
        );
      }
      c = rep;
    }
    dest.push(c);
    i += len;
  }

  if (unicode(denc) || denc === Encoding.US_ASCII) return String.fromCodePoint(...dest);
  return forceEncoding(Uint8Array.from(dest), denc);
}

/** `make_econv_exception`'s invalid-byte-sequence arm (`vendor/ruby/v3.3.11/transcode.c:2108-2144`). */
function invalidByteSequence(
  b: number[],
  i: number,
  len: number,
  senc: Encoding,
  denc: Encoding,
): InvalidByteSequenceError {
  const errorBytes = b.slice(i, i + len);
  const lead = b[i];
  const truncated = senc === Encoding.UTF_8 && lead >= 0xc2 && lead <= 0xf4;
  const incompleteInput = truncated && i + len === b.length;
  const readagainBytes = truncated && !incompleteInput ? [b[i + len]] : null;
  let mesg = `${dump(errorBytes)} on ${senc}`;
  if (incompleteInput) mesg = `incomplete ${mesg}`;
  else if (readagainBytes) {
    mesg = `${dump(errorBytes)} followed by ${dump(readagainBytes)} on ${senc}`;
  }
  const exc = new InvalidByteSequenceError(mesg);
  exc._errorBytes = String.fromCharCode(...errorBytes);
  exc._readagainBytes = readagainBytes && String.fromCharCode(...readagainBytes);
  exc._incompleteInput = incompleteInput;
  exc._sourceEncoding = senc;
  exc._destinationEncoding = denc;
  return exc;
}
