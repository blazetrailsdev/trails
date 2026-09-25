import { describe, expect, it } from "vitest";
import { Encoding } from "../encoding.js";
import { MatchData } from "../match-data.js";
import { Range } from "../range.js";
import { TypeError } from "../type-error.js";
import { bytes } from "./bytes.js";
import { rbStrSend } from "./method-table.js";

type Row = [string, string, unknown[], unknown];

const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function enc(v: unknown): unknown {
  if (typeof v === "string") return LONE.test(v) ? { s: { bytes: bytes(v) } } : { s: v };
  if (typeof v === "bigint") return { big: v.toString() };
  if (typeof v === "number") return Number.isInteger(v) ? v : { f: v };
  if (v === null || v === undefined || typeof v === "boolean") return v ?? null;
  if (Array.isArray(v)) return v.map(enc);
  if (v instanceof MatchData) return { md: v.toA().map(enc) };
  if (v instanceof Encoding) return { enc: v.name };
  if (typeof (v as Iterator<unknown>).next === "function") {
    return { enum: Array.from(v as Iterable<unknown>).map(enc) };
  }
  return { other: String(v) };
}

function send(recv: string, method: string, args: unknown[]): unknown {
  try {
    const [res, after] = rbStrSend(recv, method, ...args);
    return { res: enc(res), recv: enc(after) };
  } catch (e) {
    return { err: (e as Error).constructor.name, msg: (e as Error).message };
  }
}

describe("STRING_METHOD_TABLE", () => {
  it("String#<=> answers as MRI does", () => {
    const rows: Row[] = [
      ["héllo wörld", "compareTo", ["héllo"], { res: 1, recv: { s: "héllo wörld" } }],
      ["a", "compareTo", ["b"], { res: -1, recv: { s: "a" } }],
      ["a", "compareTo", [1], { res: null, recv: { s: "a" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#== answers as MRI does", () => {
    const rows: Row[] = [["b", "equals", ["b"], { res: true, recv: { s: "b" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#=== answers as MRI does", () => {
    const rows: Row[] = [["b", "caseEquals", ["c"], { res: false, recv: { s: "b" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#eql? answers as MRI does", () => {
    const rows: Row[] = [["b", "eql", ["b"], { res: true, recv: { s: "b" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#casecmp answers as MRI does", () => {
    const rows: Row[] = [
      ["Ab", "casecmp", ["aB"], { res: 0, recv: { s: "Ab" } }],
      ["Ab", "casecmp", ["aC"], { res: -1, recv: { s: "Ab" } }],
      ["é", "casecmp", ["É"], { res: 1, recv: { s: "é" } }],
      ["a", "casecmp", [1], { res: null, recv: { s: "a" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#casecmp? answers as MRI does", () => {
    const rows: Row[] = [
      ["Straße", "isCasecmp", ["STRASSE"], { res: true, recv: { s: "Straße" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#+ answers as MRI does", () => {
    const rows: Row[] = [["ab", "plus", ["cd"], { res: { s: "abcd" }, recv: { s: "ab" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#* answers as MRI does", () => {
    const rows: Row[] = [
      ["ab", "multiply", [3], { res: { s: "ababab" }, recv: { s: "ab" } }],
      ["ab", "multiply", [0], { res: { s: "" }, recv: { s: "ab" } }],
      ["ab", "multiply", [-1], { err: "ArgumentError", msg: "negative argument" }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#% answers as MRI does", () => {
    const rows: Row[] = [
      ["%05d|%s", "format", [[3, "x"]], { res: { s: "00003|x" }, recv: { s: "%05d|%s" } }],
      ["%x", "format", [255], { res: { s: "ff" }, recv: { s: "%x" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#[] answers as MRI does", () => {
    const rows: Row[] = [
      ["こにちわ", "get", [1], { res: { s: "に" }, recv: { s: "こにちわ" } }],
      ["こにちわ", "get", [1, 2], { res: { s: "にち" }, recv: { s: "こにちわ" } }],
      [
        "こにちわ",
        "get",
        [new Range(1, -1, false)],
        { res: { s: "にちわ" }, recv: { s: "こにちわ" } },
      ],
      [
        "こにちわ",
        "get",
        [new RegExp("に(.)", ""), 1],
        { res: { s: "ち" }, recv: { s: "こにちわ" } },
      ],
      ["abc", "get", ["b"], { res: { s: "b" }, recv: { s: "abc" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#[]= answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "set", [1, "EE"], { res: { s: "EE" }, recv: { s: "hEEllo" } }],
      ["hello", "set", [new RegExp("l+", ""), "L"], { res: { s: "L" }, recv: { s: "heLo" } }],
      ["hello", "set", [9, "x"], { err: "IndexError", msg: "index 9 out of string" }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#insert answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "insert", [-2, "X"], { res: { s: "hellXo" }, recv: { s: "hellXo" } }],
      ["hello", "insert", [12, "x"], { err: "IndexError", msg: "index 12 out of string" }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#length answers as MRI does", () => {
    const rows: Row[] = [["😀a", "length", [], { res: 2, recv: { s: "😀a" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#size answers as MRI does", () => {
    const rows: Row[] = [
      ["😀a", "size", [], { res: 2, recv: { s: "😀a" } }],
      [
        "héllo",
        "size",
        [1],
        { err: "ArgumentError", msg: "wrong number of arguments (given 1, expected 0)" },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#bytesize answers as MRI does", () => {
    const rows: Row[] = [["😀a", "bytesize", [], { res: 5, recv: { s: "😀a" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#empty? answers as MRI does", () => {
    const rows: Row[] = [["", "isEmpty", [], { res: true, recv: { s: "" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#=~ answers as MRI does", () => {
    const rows: Row[] = [
      ["héllo", "matchOperator", [new RegExp("l", "")], { res: 2, recv: { s: "héllo" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#match? answers as MRI does", () => {
    const rows: Row[] = [
      ["héllo", "isMatch", [new RegExp("L", "i")], { res: true, recv: { s: "héllo" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#succ answers as MRI does", () => {
    const rows: Row[] = [
      ["az", "succ", [], { res: { s: "ba" }, recv: { s: "az" } }],
      ["zz99", "succ", [], { res: { s: "aaa00" }, recv: { s: "zz99" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#next answers as MRI does", () => {
    const rows: Row[] = [["a9", "next", [], { res: { s: "b0" }, recv: { s: "a9" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#index answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "index", ["l"], { res: 2, recv: { s: "hello" } }],
      ["hello", "index", ["l", 3], { res: 3, recv: { s: "hello" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#rindex answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "rindex", [new RegExp("l", "")], { res: 3, recv: { s: "hello" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#byteindex answers as MRI does", () => {
    const rows: Row[] = [
      ["héllo", "byteindex", ["l"], { res: 3, recv: { s: "héllo" } }],
      [
        "héllo",
        "byteindex",
        ["l", 2],
        { err: "IndexError", msg: "offset 2 does not land on character boundary" },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#byterindex answers as MRI does", () => {
    const rows: Row[] = [["héllo", "byterindex", ["l"], { res: 4, recv: { s: "héllo" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#replace answers as MRI does", () => {
    const rows: Row[] = [["x", "replace", ["yz"], { res: { s: "yz" }, recv: { s: "yz" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#clear answers as MRI does", () => {
    const rows: Row[] = [["x", "clear", [], { res: { s: "" }, recv: { s: "" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#chr answers as MRI does", () => {
    const rows: Row[] = [
      ["héllo", "chr", [], { res: { s: "h" }, recv: { s: "héllo" } }],
      ["", "chr", [], { res: { s: "" }, recv: { s: "" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#getbyte answers as MRI does", () => {
    const rows: Row[] = [
      ["héllo", "getbyte", [1], { res: 195, recv: { s: "héllo" } }],
      ["héllo", "getbyte", [-1], { res: 111, recv: { s: "héllo" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#setbyte answers as MRI does", () => {
    const rows: Row[] = [["héllo", "setbyte", [0, 72], { res: 72, recv: { s: "Héllo" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#byteslice answers as MRI does", () => {
    const rows: Row[] = [
      ["héllo", "byteslice", [1, 2], { res: { s: "é" }, recv: { s: "héllo" } }],
      ["héllo", "byteslice", [1], { res: { s: { bytes: [195] } }, recv: { s: "héllo" } }],
      ["héllo", "byteslice", [new Range(1, 2, false)], { res: { s: "é" }, recv: { s: "héllo" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#bytesplice answers as MRI does", () => {
    const rows: Row[] = [
      ["héllo", "bytesplice", [1, 2, "e"], { res: { s: "hello" }, recv: { s: "hello" } }],
      [
        "héllo",
        "bytesplice",
        [2, 1, "x"],
        { err: "IndexError", msg: "offset 2 does not land on character boundary" },
      ],
      [
        "hello",
        "bytesplice",
        [new Range(0, 1, false), "XYZ", new Range(1, 2, false)],
        { res: { s: "YZllo" }, recv: { s: "YZllo" } },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#to_i answers as MRI does", () => {
    const rows: Row[] = [
      ["  -12_3abc", "toI", [], { res: -123, recv: { s: "  -12_3abc" } }],
      ["0x1f", "toI", [16], { res: 31, recv: { s: "0x1f" } }],
      ["0b101", "toI", [0], { res: 5, recv: { s: "0b101" } }],
      ["z", "toI", [36], { res: 35, recv: { s: "z" } }],
      ["1", "toI", [1], { err: "ArgumentError", msg: "invalid radix 1" }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#to_f answers as MRI does", () => {
    const rows: Row[] = [[".5", "toF", [], { res: { f: 0.5 }, recv: { s: ".5" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#hex answers as MRI does", () => {
    const rows: Row[] = [
      ["0x1f", "hex", [], { res: 31, recv: { s: "0x1f" } }],
      ["-0x1f", "hex", [], { res: -31, recv: { s: "-0x1f" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#oct answers as MRI does", () => {
    const rows: Row[] = [
      ["0b11", "oct", [], { res: 3, recv: { s: "0b11" } }],
      ["777", "oct", [], { res: 511, recv: { s: "777" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#inspect answers as MRI does", () => {
    const rows: Row[] = [
      [
        'é"#{x}\n\u0001',
        "inspect",
        [],
        { res: { s: '"é\\"\\#{x}\\n\\u0001"' }, recv: { s: 'é"#{x}\n\u0001' } },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#dump answers as MRI does", () => {
    const rows: Row[] = [
      [
        'é"#{x}\n\u0001😀',
        "dump",
        [],
        { res: { s: '"\\u00E9\\"\\#{x}\\n\\x01\\u{1F600}"' }, recv: { s: 'é"#{x}\n\u0001😀' } },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#undump answers as MRI does", () => {
    const rows: Row[] = [
      [
        '"\\u00E9\\n\\x41"',
        "undump",
        [],
        { err: "RuntimeError", msg: "hex escape and Unicode escape are mixed" },
      ],
      [
        '"\\u00E9\\x41"',
        "undump",
        [],
        { err: "RuntimeError", msg: "hex escape and Unicode escape are mixed" },
      ],
      [
        "abc",
        "undump",
        [],
        {
          err: "RuntimeError",
          msg: 'invalid dumped string; not wrapped with \'"\' nor \'"...".force_encoding("...")\' form',
        },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#upcase answers as MRI does", () => {
    const rows: Row[] = [
      ["hÉllo Wörld", "upcase", [], { res: { s: "HÉLLO WÖRLD" }, recv: { s: "hÉllo Wörld" } }],
      ["iI", "upcase", [":turkic"], { res: { s: "İI" }, recv: { s: "iI" } }],
      ["àb", "upcase", [":ascii"], { res: { s: "àB" }, recv: { s: "àb" } }],
      [
        "a",
        "upcase",
        [":fold"],
        { err: "ArgumentError", msg: "option :fold only allowed for downcasing" },
      ],
      ["a", "upcase", [":x"], { err: "ArgumentError", msg: "invalid option" }],
      ["a", "upcase", [":ascii", ":x"], { err: "ArgumentError", msg: "too many options" }],
      ["a", "upcase", [":turkic", ":x"], { err: "ArgumentError", msg: "invalid second option" }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#downcase answers as MRI does", () => {
    const rows: Row[] = [
      ["hÉllo Wörld", "downcase", [], { res: { s: "héllo wörld" }, recv: { s: "hÉllo Wörld" } }],
      ["iIİ", "downcase", [":turkic"], { res: { s: "iıi" }, recv: { s: "iIİ" } }],
      ["ß", "downcase", [":fold"], { res: { s: "ss" }, recv: { s: "ß" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#capitalize answers as MRI does", () => {
    const rows: Row[] = [
      ["hÉllo wörld", "capitalize", [], { res: { s: "Héllo wörld" }, recv: { s: "hÉllo wörld" } }],
      ["ǆa", "capitalize", [], { res: { s: "ǅa" }, recv: { s: "ǆa" } }],
      ["ᾳ", "capitalize", [], { res: { s: "ᾼ" }, recv: { s: "ᾳ" } }],
      ["ﬁx", "capitalize", [], { res: { s: "Fix" }, recv: { s: "ﬁx" } }],
      ["ß", "capitalize", [], { res: { s: "Ss" }, recv: { s: "ß" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#swapcase answers as MRI does", () => {
    const rows: Row[] = [["hÉllo", "swapcase", [], { res: { s: "HéLLO" }, recv: { s: "hÉllo" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#upcase! answers as MRI does", () => {
    const rows: Row[] = [
      ["abc", "upcaseBang", [], { res: { s: "ABC" }, recv: { s: "ABC" } }],
      ["ABC", "upcaseBang", [], { res: null, recv: { s: "ABC" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#capitalize! answers as MRI does", () => {
    const rows: Row[] = [
      ["abc", "capitalizeBang", [], { res: { s: "Abc" }, recv: { s: "Abc" } }],
      ["Abc", "capitalizeBang", [], { res: null, recv: { s: "Abc" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#swapcase! answers as MRI does", () => {
    const rows: Row[] = [["aB", "swapcaseBang", [], { res: { s: "Ab" }, recv: { s: "Ab" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#split answers as MRI does", () => {
    const rows: Row[] = [
      [
        "a,b,,c,,",
        "split",
        [","],
        { res: [{ s: "a" }, { s: "b" }, { s: "" }, { s: "c" }], recv: { s: "a,b,,c,," } },
      ],
      ["a b  c", "split", [], { res: [{ s: "a" }, { s: "b" }, { s: "c" }], recv: { s: "a b  c" } }],
      ["a,b,c", "split", [",", 2], { res: [{ s: "a" }, { s: "b,c" }], recv: { s: "a,b,c" } }],
      ["abc", "split", [""], { res: [{ s: "a" }, { s: "b" }, { s: "c" }], recv: { s: "abc" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#lines answers as MRI does", () => {
    const rows: Row[] = [
      [
        "a\nb\n\nc",
        "lines",
        [],
        { res: [{ s: "a\n" }, { s: "b\n" }, { s: "\n" }, { s: "c" }], recv: { s: "a\nb\n\nc" } },
      ],
      [
        "a\n\n\nb\nc",
        "lines",
        [""],
        { res: [{ s: "a\n\n" }, { s: "b\nc" }], recv: { s: "a\n\n\nb\nc" } },
      ],
      [
        "\n\na\n\n",
        "lines",
        [""],
        { res: [{ s: "\n\n" }, { s: "a\n\n" }], recv: { s: "\n\na\n\n" } },
      ],
      [
        "a\r\nb\n",
        "lines",
        [{ chomp: true }],
        { res: [{ s: "a" }, { s: "b" }], recv: { s: "a\r\nb\n" } },
      ],
      [
        "axbxc",
        "lines",
        ["x", { chomp: true }],
        { res: [{ s: "a" }, { s: "b" }, { s: "c" }], recv: { s: "axbxc" } },
      ],
      ["ab", "lines", [null], { res: [{ s: "ab" }], recv: { s: "ab" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#bytes answers as MRI does", () => {
    const rows: Row[] = [
      ["h😀é", "bytes", [], { res: [104, 240, 159, 152, 128, 195, 169], recv: { s: "h😀é" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#chars answers as MRI does", () => {
    const rows: Row[] = [
      ["h😀é", "chars", [], { res: [{ s: "h" }, { s: "😀" }, { s: "é" }], recv: { s: "h😀é" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#codepoints answers as MRI does", () => {
    const rows: Row[] = [
      ["h😀é", "codepoints", [], { res: [104, 128512, 233], recv: { s: "h😀é" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#grapheme_clusters answers as MRI does", () => {
    const rows: Row[] = [
      ["éx", "graphemeClusters", [], { res: [{ s: "é" }, { s: "x" }], recv: { s: "éx" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#reverse answers as MRI does", () => {
    const rows: Row[] = [["h😀é", "reverse", [], { res: { s: "é😀h" }, recv: { s: "h😀é" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#concat answers as MRI does", () => {
    const rows: Row[] = [["a", "concat", ["b", 99], { res: { s: "abc" }, recv: { s: "abc" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#<< answers as MRI does", () => {
    const rows: Row[] = [
      ["a", "append", [233], { res: { s: "aé" }, recv: { s: "aé" } }],
      ["a", "append", [55296], { err: "RangeError", msg: "invalid codepoint 0xD800 in UTF-8" }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#prepend answers as MRI does", () => {
    const rows: Row[] = [["a", "prepend", ["b", "c"], { res: { s: "bca" }, recv: { s: "bca" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#intern answers as MRI does", () => {
    const rows: Row[] = [["ab", "intern", [], { res: { s: ":ab" }, recv: { s: "ab" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#to_sym answers as MRI does", () => {
    const rows: Row[] = [["ab", "toSym", [], { res: { s: ":ab" }, recv: { s: "ab" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#ord answers as MRI does", () => {
    const rows: Row[] = [
      ["", "ord", [], { err: "ArgumentError", msg: "empty string" }],
      ["é", "ord", [], { res: 233, recv: { s: "é" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#include? answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "isInclude", ["ll"], { res: true, recv: { s: "hello" } }],
      [
        "hello",
        "isInclude",
        [null],
        { err: "TypeError", msg: "no implicit conversion of nil into String" },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#start_with? answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "isStartWith", ["he"], { res: true, recv: { s: "hello" } }],
      ["hello", "isStartWith", [new RegExp("h.l", "")], { res: true, recv: { s: "hello" } }],
      ["hello", "isStartWith", [new RegExp("el", "")], { res: false, recv: { s: "hello" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#end_with? answers as MRI does", () => {
    const rows: Row[] = [["hello", "isEndWith", ["x", "lo"], { res: true, recv: { s: "hello" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#scan answers as MRI does", () => {
    const rows: Row[] = [
      [
        "a1b22c",
        "scan",
        [new RegExp("\\d+", "")],
        { res: [{ s: "1" }, { s: "22" }], recv: { s: "a1b22c" } },
      ],
      [
        "a1b2",
        "scan",
        [new RegExp("[a-z](\\d)", "")],
        { res: [[{ s: "1" }], [{ s: "2" }]], recv: { s: "a1b2" } },
      ],
      [
        "abc",
        "scan",
        [new RegExp("", "")],
        { res: [{ s: "" }, { s: "" }, { s: "" }, { s: "" }], recv: { s: "abc" } },
      ],
      ["aXbX", "scan", ["X"], { res: [{ s: "X" }, { s: "X" }], recv: { s: "aXbX" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#ljust answers as MRI does", () => {
    const rows: Row[] = [
      ["x", "ljust", [4, "ab"], { res: { s: "xaba" }, recv: { s: "x" } }],
      [
        "héllo",
        "ljust",
        [],
        { err: "ArgumentError", msg: "wrong number of arguments (given 0, expected 1..2)" },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#rjust answers as MRI does", () => {
    const rows: Row[] = [["x", "rjust", [4], { res: { s: "   x" }, recv: { s: "x" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#center answers as MRI does", () => {
    const rows: Row[] = [
      ["x", "center", [6, "*"], { res: { s: "**x***" }, recv: { s: "x" } }],
      ["x", "center", [10, ""], { err: "ArgumentError", msg: "zero width padding" }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#sub answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "sub", [new RegExp("l", ""), "L"], { res: { s: "heLlo" }, recv: { s: "hello" } }],
      [
        "hello",
        "sub",
        [new RegExp("(l)(l)", ""), "\\2\\1<\\0>"],
        { res: { s: "hell<ll>o" }, recv: { s: "hello" } },
      ],
      ["hello", "sub", ["l", "\\\\"], { res: { s: "he\\lo" }, recv: { s: "hello" } }],
      [
        "hello",
        "sub",
        [new RegExp("l", "")],
        { err: "ArgumentError", msg: "wrong number of arguments (given 1, expected 2)" },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#gsub answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "gsub", [new RegExp("l", ""), "L"], { res: { s: "heLLo" }, recv: { s: "hello" } }],
      [
        "hello",
        "gsub",
        [new RegExp("[el]", ""), { e: 3, l: "L" }],
        { res: { s: "h3LLo" }, recv: { s: "hello" } },
      ],
      ["abc", "gsub", ["", "-"], { res: { s: "-a-b-c-" }, recv: { s: "abc" } }],
      ["😀x", "gsub", [new RegExp(".", ""), "y"], { res: { s: "yy" }, recv: { s: "😀x" } }],
      [
        "hello",
        "gsub",
        [new RegExp("(?<v>[aeiou])", ""), "<\\k<v>>"],
        { res: { s: "h<e>ll<o>" }, recv: { s: "hello" } },
      ],
      [
        "hello",
        "gsub",
        [new RegExp("l", "")],
        { res: { enum: [{ s: "l" }, { s: "l" }] }, recv: { s: "hello" } },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#sub! answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "subBang", [new RegExp("z", ""), "x"], { res: null, recv: { s: "hello" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#gsub! answers as MRI does", () => {
    const rows: Row[] = [
      [
        "hello",
        "gsubBang",
        [new RegExp("l", ""), "L"],
        { res: { s: "heLLo" }, recv: { s: "heLLo" } },
      ],
      ["hello", "gsubBang", [new RegExp("z", ""), "L"], { res: null, recv: { s: "hello" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#chop answers as MRI does", () => {
    const rows: Row[] = [
      ["a\r\n", "chop", [], { res: { s: "a" }, recv: { s: "a\r\n" } }],
      ["é", "chop", [], { res: { s: "" }, recv: { s: "é" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#chop! answers as MRI does", () => {
    const rows: Row[] = [["", "chopBang", [], { res: null, recv: { s: "" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#chomp answers as MRI does", () => {
    const rows: Row[] = [
      ["a\r\r", "chomp", [""], { res: { s: "a\r\r" }, recv: { s: "a\r\r" } }],
      ["a\n\r\n", "chomp", [""], { res: { s: "a" }, recv: { s: "a\n\r\n" } }],
      ["ab", "chomp", ["b"], { res: { s: "a" }, recv: { s: "ab" } }],
      ["a", "chomp", [null], { res: { s: "a" }, recv: { s: "a" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#chomp! answers as MRI does", () => {
    const rows: Row[] = [
      ["a\n", "chompBang", [], { res: { s: "a" }, recv: { s: "a" } }],
      ["a", "chompBang", [], { res: null, recv: { s: "a" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#strip answers as MRI does", () => {
    const rows: Row[] = [
      ["\u0000 a \u0000", "strip", [], { res: { s: "a" }, recv: { s: "\u0000 a \u0000" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#lstrip answers as MRI does", () => {
    const rows: Row[] = [
      ["\u0000 a\u0000 ", "lstrip", [], { res: { s: "a\u0000 " }, recv: { s: "\u0000 a\u0000 " } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#rstrip! answers as MRI does", () => {
    const rows: Row[] = [[" a ", "rstripBang", [], { res: { s: " a" }, recv: { s: " a" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#strip! answers as MRI does", () => {
    const rows: Row[] = [["a", "stripBang", [], { res: null, recv: { s: "a" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#delete_prefix answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "deletePrefix", ["he"], { res: { s: "llo" }, recv: { s: "hello" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#delete_suffix answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "deleteSuffix", ["lo"], { res: { s: "hel" }, recv: { s: "hello" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#delete_prefix! answers as MRI does", () => {
    const rows: Row[] = [["hello", "deletePrefixBang", ["x"], { res: null, recv: { s: "hello" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#tr answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "tr", ["el", "ip"], { res: { s: "hippo" }, recv: { s: "hello" } }],
      ["hello", "tr", ["a-y", "b-z"], { res: { s: "ifmmp" }, recv: { s: "hello" } }],
      ["hello", "tr", ["^l", "*"], { res: { s: "**ll*" }, recv: { s: "hello" } }],
      ["hello", "tr", ["lo", ""], { res: { s: "he" }, recv: { s: "hello" } }],
      ["hello", "tr", ["elo", "x"], { res: { s: "hxxxx" }, recv: { s: "hello" } }],
      [
        "a",
        "tr",
        ["z-a", "b"],
        { err: "ArgumentError", msg: 'invalid range "z-a" in string transliteration' },
      ],
      ["hello", "tr", ["\\-l", "x"], { res: { s: "hexxo" }, recv: { s: "hello" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#tr_s answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "trS", ["l", "r"], { res: { s: "hero" }, recv: { s: "hello" } }],
      ["aabbcc", "trS", ["a-c", "x"], { res: { s: "x" }, recv: { s: "aabbcc" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#squeeze answers as MRI does", () => {
    const rows: Row[] = [
      ["aaabbbccc", "squeeze", [], { res: { s: "abc" }, recv: { s: "aaabbbccc" } }],
      ["aaabbbccc", "squeeze", ["a-b"], { res: { s: "abccc" }, recv: { s: "aaabbbccc" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#count answers as MRI does", () => {
    const rows: Row[] = [
      ["hello world", "count", ["lo"], { res: 5, recv: { s: "hello world" } }],
      ["hello", "count", ["a-z", "^l"], { res: 3, recv: { s: "hello" } }],
      [
        "hello",
        "count",
        [],
        { err: "ArgumentError", msg: "wrong number of arguments (given 0, expected 1+)" },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#delete answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "delete", ["l"], { res: { s: "heo" }, recv: { s: "hello" } }],
      ["hello", "delete", ["a-z", "^l"], { res: { s: "ll" }, recv: { s: "hello" } }],
      [
        "hello",
        "delete",
        [],
        { err: "ArgumentError", msg: "wrong number of arguments (given 0, expected 1+)" },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#sum answers as MRI does", () => {
    const rows: Row[] = [
      ["abc", "sum", [], { res: 294, recv: { s: "abc" } }],
      ["abc", "sum", [8], { res: 38, recv: { s: "abc" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#slice! answers as MRI does", () => {
    const rows: Row[] = [
      ["hello", "sliceBang", [1, 2], { res: { s: "el" }, recv: { s: "hlo" } }],
      ["hello", "sliceBang", [new RegExp("l+", "")], { res: { s: "ll" }, recv: { s: "heo" } }],
      ["hello", "sliceBang", [9], { res: null, recv: { s: "hello" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#partition answers as MRI does", () => {
    const rows: Row[] = [
      [
        "abcbd",
        "partition",
        ["b"],
        { res: [{ s: "a" }, { s: "b" }, { s: "cbd" }], recv: { s: "abcbd" } },
      ],
      [
        "abcbd",
        "partition",
        [new RegExp("c.", "")],
        { res: [{ s: "ab" }, { s: "cb" }, { s: "d" }], recv: { s: "abcbd" } },
      ],
      [
        "abc",
        "partition",
        ["z"],
        { res: [{ s: "abc" }, { s: "" }, { s: "" }], recv: { s: "abc" } },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#rpartition answers as MRI does", () => {
    const rows: Row[] = [
      [
        "abcbd",
        "rpartition",
        ["b"],
        { res: [{ s: "abc" }, { s: "b" }, { s: "d" }], recv: { s: "abcbd" } },
      ],
      [
        "abcbd",
        "rpartition",
        [new RegExp("b.", "")],
        { res: [{ s: "abc" }, { s: "bd" }, { s: "" }], recv: { s: "abcbd" } },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#encoding answers as MRI does", () => {
    const rows: Row[] = [["é", "encoding", [], { res: { enc: "UTF-8" }, recv: { s: "é" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#valid_encoding? answers as MRI does", () => {
    const rows: Row[] = [["é", "isValidEncoding", [], { res: true, recv: { s: "é" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#ascii_only? answers as MRI does", () => {
    const rows: Row[] = [["é", "isAsciiOnly", [], { res: false, recv: { s: "é" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#unicode_normalize answers as MRI does", () => {
    const rows: Row[] = [
      ["é", "unicodeNormalize", [], { res: { s: "é" }, recv: { s: "é" } }],
      ["é", "unicodeNormalize", [":nfd"], { res: { s: "é" }, recv: { s: "é" } }],
      [
        "a",
        "unicodeNormalize",
        [":nfq"],
        { err: "ArgumentError", msg: "Invalid normalization form nfq." },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#unicode_normalized? answers as MRI does", () => {
    const rows: Row[] = [["é", "isUnicodeNormalized", [], { res: false, recv: { s: "é" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#match answers as MRI does", () => {
    const rows: Row[] = [
      [
        "héllo",
        "match",
        [new RegExp("l(l)(?<x>o)", "")],
        { res: { md: [{ s: "llo" }, { s: "o" }] }, recv: { s: "héllo" } },
      ],
      [
        "héllo",
        "match",
        [new RegExp("l", ""), 3],
        { res: { md: [{ s: "l" }] }, recv: { s: "héllo" } },
      ],
      ["héllo", "match", ["l."], { res: { md: [{ s: "ll" }] }, recv: { s: "héllo" } }],
      [
        "a",
        "match",
        [1],
        { err: "TypeError", msg: "wrong argument type Integer (expected Regexp)" },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#upto answers as MRI does", () => {
    const rows: Row[] = [
      [
        "a9",
        "upto",
        ["b1"],
        { res: { enum: [{ s: "a9" }, { s: "b0" }, { s: "b1" }] }, recv: { s: "a9" } },
      ],
      [
        "9",
        "upto",
        ["11"],
        { res: { enum: [{ s: "9" }, { s: "10" }, { s: "11" }] }, recv: { s: "9" } },
      ],
      [
        "a",
        "upto",
        ["e", true],
        { res: { enum: [{ s: "a" }, { s: "b" }, { s: "c" }, { s: "d" }] }, recv: { s: "a" } },
      ],
      ["25", "upto", ["5"], { res: { enum: [] }, recv: { s: "25" } }],
      [
        "07",
        "upto",
        ["11"],
        {
          res: { enum: [{ s: "07" }, { s: "08" }, { s: "09" }, { s: "10" }, { s: "11" }] },
          recv: { s: "07" },
        },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#scrub answers as MRI does", () => {
    const rows: Row[] = [
      ["aé", "scrub", [], { res: { s: "aé" }, recv: { s: "aé" } }],
      ["abc", "scrub", ["?"], { res: { s: "abc" }, recv: { s: "abc" } }],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#freeze answers as MRI does", () => {
    const rows: Row[] = [["hello", "freeze", [], { res: { s: "hello" }, recv: { s: "hello" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#dup answers as MRI does", () => {
    const rows: Row[] = [["hello", "dup", [], { res: { s: "hello" }, recv: { s: "hello" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#+@ answers as MRI does", () => {
    const rows: Row[] = [["hello", "uplus", [], { res: { s: "hello" }, recv: { s: "hello" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#-@ answers as MRI does", () => {
    const rows: Row[] = [["hello", "uminus", [], { res: { s: "hello" }, recv: { s: "hello" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#to_s answers as MRI does", () => {
    const rows: Row[] = [["hi", "toS", [], { res: { s: "hi" }, recv: { s: "hi" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#to_str answers as MRI does", () => {
    const rows: Row[] = [["hi", "toStr", [], { res: { s: "hi" }, recv: { s: "hi" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#each_char answers as MRI does", () => {
    const rows: Row[] = [
      [
        "hello",
        "eachChar",
        [],
        {
          res: { enum: [{ s: "h" }, { s: "e" }, { s: "l" }, { s: "l" }, { s: "o" }] },
          recv: { s: "hello" },
        },
      ],
    ];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });

  it("String#each_byte answers as MRI does", () => {
    const rows: Row[] = [["ab", "eachByte", [], { res: { enum: [97, 98] }, recv: { s: "ab" } }]];
    for (const [recv, method, args, want] of rows) expect(send(recv, method, args)).toEqual(want);
  });
});

describe("STRING_METHOD_TABLE blocks and enumerators", () => {
  it("reads a function as an argument where String takes no block", () => {
    expect(() => rbStrSend("abc", "isInclude", () => "a")).toThrow(TypeError);
  });

  it("answers upto's enumerator before walking the range", () => {
    const [enumerator] = rbStrSend("a", "upto", "zzzzzzzzzz") as [Iterator<string>, string];
    expect([enumerator.next().value, enumerator.next().value]).toEqual(["a", "b"]);
  });
});
