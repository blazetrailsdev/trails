import { afterEach, beforeEach, describe, it, expect } from "vitest";
import {
  ArgumentError,
  cmp,
  IndexError,
  NameError,
  NoMethodError,
  Range,
  rbEql,
  rbEqual,
  TypeError,
} from "@blazetrails/ruby-compat";
import { Multibyte } from "./multibyte.js";
import { Chars } from "./multibyte/chars.js";
import { mbChars as stringMbChars } from "./core-ext/string/multibyte.js";
import {
  assert,
  assertIncludes,
  assertNot,
  assertNotIncludes,
  assertNothingRaised,
  assertPredicate,
  assertRaise,
  assertRaises,
  assertRespondTo,
  assertNotRespondTo,
} from "./testing/assertions.js";

type AnyChars = Chars & Record<string, any>;

expect.addEqualityTesters([
  function charsEquals(a: unknown, b: unknown): boolean | undefined {
    if (!(a instanceof Chars) && !(b instanceof Chars)) return undefined;
    return rbEqual(a, b);
  },
]);

const UNICODE_STRING = "こにちわ";
const ASCII_STRING = "ohayo";
const BYTE_STRING = "¸\u009e\u0008\u0088¥";

const mbChars = (str: string) => stringMbChars(str) as AnyChars;

function chars(str: string): AnyChars {
  return new Chars(str) as AnyChars;
}

describe("MultibyteCharsUTF8BehaviorTest", () => {
  let chars_: AnyChars;
  const whitespace = "\n\t ";

  beforeEach(() => {
    chars_ = mbChars(UNICODE_STRING);
  });

  it("split should return an array of chars instances", () => {
    for (const character of chars_.split(/(?:)/u)) {
      expect(character).toBeInstanceOf(Multibyte.proxyClass());
    }
  });

  it("tidy bytes bang should return self", () => {
    expect(chars_.tidyBytesBang()).toBe(chars_);
  });

  it("tidy bytes bang should change wrapped string", () => {
    const original = " Un bUen café \udc92";
    const proxy = chars(original);
    proxy.tidyBytesBang();
    expect(proxy.toS()).not.toEqual(original);
  });

  it("unicode string should have utf8 encoding", () => {
    expect(typeof UNICODE_STRING).toBe("string");
  });

  it("identity", () => {
    expect(chars_).toEqual(chars_);
    assert(rbEql(chars_, chars_));
    assertNot(rbEql(chars_, UNICODE_STRING));
  });

  it("string methods are chainable", () => {
    const proxyClass = Multibyte.proxyClass();
    assert(chars("").insert(0, "") instanceof proxyClass);
    assert(chars("").rjust(1) instanceof proxyClass);
    assert(chars("").ljust(1) instanceof proxyClass);
    assert(chars("").center(1) instanceof proxyClass);
    assert(chars("").rstrip() instanceof proxyClass);
    assert(chars("").lstrip() instanceof proxyClass);
    assert(chars("").strip() instanceof proxyClass);
    assert(chars("").reverse() instanceof proxyClass);
    assert(chars(" ").slice(0) instanceof proxyClass);
    assert(chars("").limit(0) instanceof proxyClass);
    assert(chars("").upcase() instanceof proxyClass);
    assert(chars("").downcase() instanceof proxyClass);
    assert(chars("").capitalize() instanceof proxyClass);
    assert(chars("").decompose() instanceof proxyClass);
    assert(chars("").compose() instanceof proxyClass);
    assert(chars("").tidyBytes() instanceof proxyClass);
    assert(chars("").swapcase() instanceof proxyClass);
  });

  it("should be equal to the wrapped string", () => {
    expect(chars_).toEqual(UNICODE_STRING);
    expect(UNICODE_STRING).toEqual(chars_);
  });

  it("should not be equal to an other string", () => {
    expect("other").not.toEqual(chars_);
    expect(chars_).not.toEqual("other");
  });

  it("sortability", () => {
    const words = ["builder", "armor", "zebra"].sort((a, b) => cmp(mbChars(a), mbChars(b))!);
    expect(words).toEqual(["armor", "builder", "zebra"]);
  });

  it("should return character offset for regexp matches", () => {
    expect(chars_.matchOperator(/wrong/u)).toBeNull();
    expect(chars_.matchOperator(/こ/u)).toEqual(0);
    expect(chars_.matchOperator(/こに/u)).toEqual(0);
    expect(chars_.matchOperator(/に/u)).toEqual(1);
    expect(chars_.matchOperator(/ち/u)).toEqual(2);
    expect(chars_.matchOperator(/わ/u)).toEqual(3);
  });

  it("match should return boolean for regexp match", () => {
    assertNot(chars_.isMatch(/wrong/u));
    assert(chars_.isMatch(/こに/u));
    assert(chars_.isMatch(/ち/u));
  });

  it("should use character offsets for insert offsets", () => {
    expect(mbChars("").insert(0, "")).toEqual("");
    expect(chars_.insert(1, "わ")).toEqual("こわにちわ");
    expect(chars_.insert(2, "わわ")).toEqual("こわわわにちわ");
    expect(chars_.insert(0, "わ")).toEqual("わこわわわにちわ");
    expect(chars_.wrappedString).toEqual("わこわわわにちわ");
  });

  it("insert should be destructive", () => {
    chars_.insert(1, "わ");
    expect(chars_).toEqual("こわにちわ");
  });

  it("insert throws index error", async () => {
    await assertRaise([IndexError], {}, () => chars_.insert(-12, "わ"));
    await assertRaise([IndexError], {}, () => chars_.insert(12, "わ"));
  });

  it("should know if one includes the other", () => {
    assertIncludes(chars_, "");
    assertIncludes(chars_, "ち");
    assertIncludes(chars_, "わ");
    assertNotIncludes(chars_, "こちわ");
    assertNotIncludes(chars_, "a");
  });

  it("include raises when nil is passed", async () => {
    await assertRaises([TypeError, NoMethodError], {}, () => chars_.isInclude(null));
  });

  it("index should return character offset", () => {
    expect(chars_.index("u")).toBeNull();
    expect(chars_.index("こに")).toEqual(0);
    expect(chars_.index("ち")).toEqual(2);
    expect(chars_.index("ち", -2)).toEqual(2);
    expect(chars_.index("ち", -1)).toBeNull();
    expect(chars_.index("わ")).toEqual(3);
    expect(mbChars("ééxééx").index("x", 4)).toEqual(5);
  });

  it("rindex should return character offset", () => {
    expect(chars_.rindex("u")).toBeNull();
    expect(chars_.rindex("に")).toEqual(1);
    expect(chars_.rindex("ち", -2)).toEqual(2);
    expect(chars_.rindex("ち", -3)).toBeNull();
    expect(mbChars("Café périferôl").rindex("é")).toEqual(6);
    expect(mbChars("Café périferôl").rindex(/\w/u)).toEqual(13);
  });

  it("indexed insert should take character offsets", () => {
    chars_.set(2, "a");
    expect(chars_).toEqual("こにaわ");
    chars_.set(2, "ηη");
    expect(chars_).toEqual("こにηηわ");
    chars_.set(3, 2, "λλλ");
    expect(chars_).toEqual("こにηλλλ");
    chars_.set(1, 0, "λ");
    expect(chars_).toEqual("こλにηλλλ");
    chars_.set(new Range(4, 6), "ηη");
    expect(chars_).toEqual("こλにηηη");
    chars_.set(/ηη/, "λλλ");
    expect(chars_).toEqual("こλにλλλη");
    chars_.set(/(λλ)(.)/, 2, "α");
    expect(chars_).toEqual("こλにλλαη");
    chars_.set("α", "¢");
    expect(chars_).toEqual("こλにλλ¢η");
    chars_.set("λλ", "ααα");
    expect(chars_).toEqual("こλにααα¢η");
  });

  it("indexed insert should raise on index overflow", async () => {
    const before = chars_.toS();
    await assertRaise([IndexError], {}, () => chars_.set(10, "a"));
    await assertRaise([IndexError], {}, () => chars_.set(10, 4, "a"));
    await assertRaise([IndexError], {}, () => chars_.set(/ii/, "a"));
    await assertRaise([IndexError], {}, () => chars_.set(/()/, 10, "a"));
    expect(chars_).toEqual(before);
  });

  it("indexed insert should raise on range overflow", async () => {
    const before = chars_.toS();
    await assertRaise([RangeError], {}, () => chars_.set(new Range(10, 12), "a"));
    expect(chars_).toEqual(before);
  });

  it("rjust should raise argument errors on bad arguments", async () => {
    await assertRaise([ArgumentError], {}, () => chars_.rjust(10, ""));
    await assertRaise([ArgumentError], {}, () => chars_.rjust());
  });

  it("rjust should count characters instead of bytes", () => {
    expect(chars_.rjust(-3)).toEqual(UNICODE_STRING);
    expect(chars_.rjust(0)).toEqual(UNICODE_STRING);
    expect(chars_.rjust(4)).toEqual(UNICODE_STRING);
    expect(chars_.rjust(5)).toEqual(` ${UNICODE_STRING}`);
    expect(chars_.rjust(7)).toEqual(`   ${UNICODE_STRING}`);
    expect(chars_.rjust(7, "-")).toEqual(`---${UNICODE_STRING}`);
    expect(chars_.rjust(7, "α")).toEqual(`ααα${UNICODE_STRING}`);
    expect(chars_.rjust(7, "ab")).toEqual(`aba${UNICODE_STRING}`);
    expect(chars_.rjust(7, "αη")).toEqual(`αηα${UNICODE_STRING}`);
    expect(chars_.rjust(8, "αη")).toEqual(`αηαη${UNICODE_STRING}`);
  });

  it("ljust should raise argument errors on bad arguments", async () => {
    await assertRaise([ArgumentError], {}, () => chars_.ljust(10, ""));
    await assertRaise([ArgumentError], {}, () => chars_.ljust());
  });

  it("ljust should count characters instead of bytes", () => {
    expect(chars_.ljust(-3)).toEqual(UNICODE_STRING);
    expect(chars_.ljust(0)).toEqual(UNICODE_STRING);
    expect(chars_.ljust(4)).toEqual(UNICODE_STRING);
    expect(chars_.ljust(5)).toEqual(`${UNICODE_STRING} `);
    expect(chars_.ljust(7)).toEqual(`${UNICODE_STRING}   `);
    expect(chars_.ljust(7, "-")).toEqual(`${UNICODE_STRING}---`);
    expect(chars_.ljust(7, "α")).toEqual(`${UNICODE_STRING}ααα`);
    expect(chars_.ljust(7, "ab")).toEqual(`${UNICODE_STRING}aba`);
    expect(chars_.ljust(7, "αη")).toEqual(`${UNICODE_STRING}αηα`);
    expect(chars_.ljust(8, "αη")).toEqual(`${UNICODE_STRING}αηαη`);
  });

  it("center should raise argument errors on bad arguments", async () => {
    await assertRaise([ArgumentError], {}, () => chars_.center(10, ""));
    await assertRaise([ArgumentError], {}, () => chars_.center());
  });

  it("center should count characters instead of bytes", () => {
    expect(chars_.center(-3)).toEqual(UNICODE_STRING);
    expect(chars_.center(0)).toEqual(UNICODE_STRING);
    expect(chars_.center(4)).toEqual(UNICODE_STRING);
    expect(chars_.center(5)).toEqual(`${UNICODE_STRING} `);
    expect(chars_.center(6)).toEqual(` ${UNICODE_STRING} `);
    expect(chars_.center(7)).toEqual(` ${UNICODE_STRING}  `);
    expect(chars_.center(8, "-")).toEqual(`--${UNICODE_STRING}--`);
    expect(chars_.center(9, "-")).toEqual(`--${UNICODE_STRING}---`);
    expect(chars_.center(8, "α")).toEqual(`αα${UNICODE_STRING}αα`);
    expect(chars_.center(9, "α")).toEqual(`αα${UNICODE_STRING}ααα`);
    expect(chars_.center(7, "ab")).toEqual(`a${UNICODE_STRING}ab`);
    expect(chars_.center(8, "ab")).toEqual(`ab${UNICODE_STRING}ab`);
    expect(chars_.center(12, "ab")).toEqual(`abab${UNICODE_STRING}abab`);
    expect(chars_.center(7, "αη")).toEqual(`α${UNICODE_STRING}αη`);
    expect(chars_.center(8, "αη")).toEqual(`αη${UNICODE_STRING}αη`);
  });

  it("lstrip strips whitespace from the left of the string", () => {
    expect(mbChars(UNICODE_STRING).lstrip()).toEqual(UNICODE_STRING);
    expect(mbChars(whitespace + UNICODE_STRING).lstrip()).toEqual(UNICODE_STRING);
    expect(mbChars(whitespace + UNICODE_STRING + whitespace).lstrip()).toEqual(
      UNICODE_STRING + whitespace,
    );
  });

  it("rstrip strips whitespace from the right of the string", () => {
    expect(mbChars(UNICODE_STRING).rstrip()).toEqual(UNICODE_STRING);
    expect(mbChars(UNICODE_STRING + whitespace).rstrip()).toEqual(UNICODE_STRING);
    expect(mbChars(whitespace + UNICODE_STRING + whitespace).rstrip()).toEqual(
      whitespace + UNICODE_STRING,
    );
  });

  it("strip strips whitespace", () => {
    expect(mbChars(UNICODE_STRING).strip()).toEqual(UNICODE_STRING);
    expect(mbChars(whitespace + UNICODE_STRING).strip()).toEqual(UNICODE_STRING);
    expect(mbChars(UNICODE_STRING + whitespace).strip()).toEqual(UNICODE_STRING);
    expect(mbChars(whitespace + UNICODE_STRING + whitespace).strip()).toEqual(UNICODE_STRING);
  });

  it("stripping whitespace leaves whitespace within the string intact", () => {
    const stringWithWhitespace = UNICODE_STRING + whitespace + UNICODE_STRING;
    expect(mbChars(stringWithWhitespace).strip()).toEqual(stringWithWhitespace);
    expect(mbChars(stringWithWhitespace).lstrip()).toEqual(stringWithWhitespace);
    expect(mbChars(stringWithWhitespace).rstrip()).toEqual(stringWithWhitespace);
  });

  it("size returns characters instead of bytes", () => {
    expect(mbChars("").size()).toEqual(0);
    expect(chars_.size()).toEqual(4);
    expect(chars_.length).toEqual(4);
    expect(mbChars(ASCII_STRING).size()).toEqual(5);
  });

  it("reverse reverses characters", () => {
    expect(mbChars("").reverse()).toEqual("");
    expect(chars_.reverse()).toEqual("わちにこ");
  });

  it("reverse should work with normalized strings", () => {
    const str = "bös";
    const reversedStr = "söb";
    expect(chars(str).decompose().reverse()).toEqual(chars(reversedStr).decompose());
    expect(chars(str).compose().reverse()).toEqual(chars(reversedStr).compose());
  });

  it("slice should take character offsets", () => {
    expect(mbChars("").slice(0)).toBeNull();
    expect(chars_.slice(0)).toEqual("こ");
    expect(chars_.slice(3)).toEqual("わ");
    expect(mbChars("").slice(new Range(-1, 1))).toBeNull();
    expect(mbChars("").slice(-1, 1)).toBeNull();
    expect(mbChars("").slice(new Range(0, 10))).toEqual("");
    expect(chars_.slice(new Range(1, 3))).toEqual("にちわ");
    expect(chars_.slice(1, 3)).toEqual("にちわ");
    expect(chars_.slice(0, 1)).toEqual("こ");
    expect(chars_.slice(new Range(2, 10))).toEqual("ちわ");
    expect(chars_.slice(new Range(4, 10))).toEqual("");
    expect(chars_.slice(/に/u)).toEqual("に");
    expect(chars_.slice(/に./u)).toEqual("にち");
    expect(chars_.slice(/unknown/u)).toBeNull();
    expect(chars_.slice(/(にち)/u, 1)).toEqual("にち");
    expect(chars_.slice(/(にち)/u, 2)).toBeNull();
    expect(chars_.slice(new Range(7, 6))).toBeNull();
  });

  it("slice bang returns sliced out substring", () => {
    expect(chars_.sliceBang(new Range(1, 2))).toEqual("にち");
  });

  it("slice bang returns nil on out of bound arguments", () => {
    expect(chars_.mbChars().sliceBang(new Range(9, 10))).toBeNull();
  });

  it("slice bang removes the slice from the receiver", () => {
    const chars = mbChars("úüù");
    chars.sliceBang(0, 2);
    expect(chars).toEqual("ù");
  });

  it("slice bang returns nil and does not modify receiver if out of bounds", () => {
    const string = "úüù";
    const chars = mbChars(string);
    expect(chars.sliceBang(4, 5)).toBeNull();
    expect(chars).toEqual("úüù");
    expect(string).toEqual("úüù");
  });

  it("slice should throw exceptions on invalid arguments", async () => {
    await assertRaise([TypeError], {}, () => chars_.slice(new Range(2, 3), 1));
    await assertRaise([TypeError], {}, () => chars_.slice(1, new Range(2, 3)));
    await assertRaise([ArgumentError], {}, () => chars_.slice(1, 1, 1));
  });

  it("ord should return unicode value for first character", () => {
    expect(chars_.ord()).toEqual(12371);
  });

  it("upcase should upcase ascii characters", () => {
    expect(mbChars("").upcase()).toEqual("");
    expect(mbChars("aBc").upcase()).toEqual("ABC");
  });

  it("downcase should downcase ascii characters", () => {
    expect(mbChars("").downcase()).toEqual("");
    expect(mbChars("aBc").downcase()).toEqual("abc");
  });

  it("swapcase should swap ascii characters", () => {
    expect(mbChars("").swapcase()).toEqual("");
    expect(mbChars("aBc").swapcase()).toEqual("AbC");
  });

  it("capitalize should work on ascii characters", () => {
    expect(mbChars("").capitalize()).toEqual("");
    expect(mbChars("abc").capitalize()).toEqual("Abc");
  });

  it("titleize should work on ascii characters", () => {
    expect(mbChars("").titleize()).toEqual("");
    expect(mbChars("abc abc").titleize()).toEqual("Abc Abc");
  });

  it("respond to knows which methods the proxy responds to", () => {
    assertRespondTo(mbChars(""), "slice");
    assertRespondTo(mbChars(""), "capitalizeBang");
    assertRespondTo(mbChars(""), "gsub");
    assertNotRespondTo(mbChars(""), "undefinedMethod");
  });

  it.skip("method works for proxyed methods", async () => {
    // BLOCKED: ruby-object-method-reaches-respond-to-missing
    expect(mbChars("hello").method("slice").call(new Range(2, 3))).toEqual("ll");
    const chars = mbChars("hello");
    expect(chars.method("capitalizeBang").call()).toEqual("Hello");
    expect(chars).toEqual("Hello");
    expect(mbChars("hello").method("gsub").call(/h/, "j")).toEqual("jello");
    await assertRaise([NameError], {}, () => mbChars("").method("undefinedMethod"));
  });

  it("acts like string", () => {
    assertPredicate(mbChars("Bambi"), (c) => c.actsLikeString());
  });
});

describe("MultibyteCharsTest", () => {
  const UNICODE_STRING = "こにちわ";
  const ASCII_STRING = "ohayo";
  const BYTE_STRING = "\u00b8\u009e\u0008\u0088\u00a5";
  const proxyClass = Chars;
  let chars: Chars & Record<string, any>;

  const definedStringMethods: string[] = [];
  const defineStringMethod = (name: string, body: () => unknown) => {
    Object.defineProperty(String.prototype, name, { value: body, configurable: true });
    definedStringMethods.push(name);
  };

  beforeEach(() => {
    chars = new proxyClass(UNICODE_STRING) as Chars & Record<string, any>;
  });

  afterEach(() => {
    for (const name of definedStringMethods.splice(0)) {
      delete (String.prototype as unknown as Record<string, unknown>)[name];
    }
  });

  it("wraps the original string", () => {
    expect(chars.toS()).toEqual(UNICODE_STRING);
    expect(chars.wrappedString).toEqual(UNICODE_STRING);
  });

  it("should allow method calls to string", async () => {
    defineStringMethod("__methodForMultibyteTesting", () => "result");

    await assertNothingRaised(() => chars.__methodForMultibyteTesting());
    await assertRaise([NoMethodError], {}, () => chars.__unknownMethod());
  });

  it("forwarded method calls should return new chars instance", () => {
    defineStringMethod("__methodForMultibyteTesting", () => "result");

    expect(chars.__methodForMultibyteTesting()).toBeInstanceOf(proxyClass);
    expect(chars.__methodForMultibyteTesting()).not.toBe(chars);
  });

  it("forwarded bang method calls should return the original chars instance when result is not nil", () => {
    defineStringMethod("__methodForMultibyteTestingBang", () => "result");

    expect(chars.__methodForMultibyteTestingBang()).toBeInstanceOf(proxyClass);
    expect(chars.__methodForMultibyteTestingBang()).toBe(chars);
  });

  it("forwarded bang method calls should return nil when result is nil", () => {
    defineStringMethod("__methodForMultibyteTestingThatReturnsNilBang", () => null);

    expect(chars.__methodForMultibyteTestingThatReturnsNilBang()).toBeNull();
  });

  it("methods are forwarded to wrapped string for byte strings", () => {
    expect((mbChars(BYTE_STRING) as Chars & Record<string, any>).length).toEqual(
      BYTE_STRING.length,
    );
  });

  it("forwarded method with non string result should be returned verbatim", () => {
    const str: any = "";
    defineStringMethod("__methodForMultibyteTestingWithIntegerResult", () => 1);

    expect(chars.__methodForMultibyteTestingWithIntegerResult()).toEqual(
      str.__methodForMultibyteTestingWithIntegerResult(),
    );
  });

  it.skip("should concatenate", () => {
    // PERMANENT-SKIP: Ruby `+` / `<<` on a Chars reach method_missing and `<<` mutates the wrapped String; JS has no operator overloading and its strings are immutable.
    const mbA: any = mbChars("a");
    const mbB: any = mbChars("b");
    expect(mbA + "b").toEqual("ab");
    expect("a" + mbB).toEqual("ab");
    expect(mbA + mbB).toEqual("ab");

    expect(mbA.concat("b")).toEqual("ab");
    expect("a".concat(mbB)).toEqual("ab");
    expect(mbA.concat(mbB)).toEqual("abb");
  });

  it.skip("concatenation should return a proxy class instance", () => {
    // PERMANENT-SKIP: Ruby `+` / `<<` on a Chars reach method_missing and `<<` mutates the wrapped String; JS has no operator overloading and its strings are immutable.
    expect((mbChars("a") as any).concat("b").constructor).toEqual(Multibyte.proxyClass());
    expect((mbChars("a") as any).concat("b").constructor).toEqual(Multibyte.proxyClass());
  });

  it("ascii strings are treated at utf8 strings", () => {
    expect(mbChars(ASCII_STRING).constructor).toEqual(Multibyte.proxyClass());
  });

  it.skip("concatenate should return proxy instance", () => {
    // PERMANENT-SKIP: Ruby `+` / `<<` on a Chars reach method_missing and `<<` mutates the wrapped String; JS has no operator overloading and its strings are immutable.
    assert((mbChars("a") as any).concat("b") instanceof proxyClass);
    assert((mbChars("a") as any).concat(mbChars("b")) instanceof proxyClass);
    assert((mbChars("a") as any).concat("b") instanceof proxyClass);
    assert((mbChars("a") as any).concat(mbChars("b")) instanceof proxyClass);
  });

  it("should return string as json", () => {
    expect(chars.asJson()).toEqual(UNICODE_STRING);
  });
});

describe("MultibyteCharsExtrasTest", () => {
  it("upcase should be unicode aware", () => {
    expect(chars("аБвгд\0f").upcase()).toEqual("АБВГД\0F");
    expect(chars("こにちわ").upcase()).toEqual("こにちわ");
  });

  it("downcase should be unicode aware", () => {
    expect(chars("аБвгд\0F").downcase()).toEqual("абвгд\0f");
    expect(chars("こにちわ").downcase()).toEqual("こにちわ");
  });

  it("swapcase should be unicode aware", () => {
    expect(chars("АAÉü\0F").swapcase()).toEqual("аaéÜ\0f");
    expect(chars("こにちわ").swapcase()).toEqual("こにちわ");
  });

  it("capitalize should be unicode aware", () => {
    for (const [f, t] of Object.entries({
      "аБвг аБвг": "Абвг абвг",
      "аБвг АБВГ": "Абвг абвг",
      "АБВГ АБВГ": "Абвг абвг",
      "": "",
    })) {
      expect(chars(f).capitalize()).toEqual(t);
    }
  });

  it("titleize should be unicode aware", () => {
    expect(chars("ÉL QUE SE ENTERÓ").titleize()).toEqual("Él Que Se Enteró");
    expect(chars("аБвг аБвг").titleize()).toEqual("Абвг Абвг");
  });

  it("titleize should not affect characters that do not case fold", () => {
    expect(chars("日本語").titleize()).toEqual("日本語");
  });

  it("limit should not break on blank strings", () => {
    const example = chars("");
    expect(example.limit(0)).toEqual(example);
    expect(example.limit(1)).toEqual(example);
  });

  it("limit should work on a multibyte string", () => {
    const example = chars(UNICODE_STRING);
    const bytesize = new TextEncoder().encode(UNICODE_STRING).length;

    expect(example.limit(bytesize)).toEqual(UNICODE_STRING);
    expect(example.limit(0)).toEqual("");
    expect(example.limit(1)).toEqual("");
    expect(example.limit(3)).toEqual("こ");
    expect(example.limit(6)).toEqual("こに");
    expect(example.limit(8)).toEqual("こに");
    expect(example.limit(9)).toEqual("こにち");
    expect(example.limit(50)).toEqual("こにちわ");
  });

  it("limit should work on an ascii string", () => {
    const ascii = chars(ASCII_STRING);
    expect(ascii.limit(ASCII_STRING.length)).toEqual(ASCII_STRING);
    expect(ascii.limit(0)).toEqual("");
    expect(ascii.limit(1)).toEqual("o");
    expect(ascii.limit(2)).toEqual("oh");
    expect(ascii.limit(4)).toEqual("ohay");
    expect(ascii.limit(50)).toEqual("ohayo");
  });

  it("limit should keep under the specified byte limit", () => {
    const example = chars(UNICODE_STRING);
    for (let limit = 1; limit <= UNICODE_STRING.length; limit++) {
      assert(example.limit(limit).toS().length <= limit);
    }
  });

  it("normalization shouldnt strip null bytes", () => {
    const nullByteStr = "Test\0test";

    expect(chars(nullByteStr).decompose()).toEqual(nullByteStr);
    expect(chars(nullByteStr).compose()).toEqual(nullByteStr);
  });

  it("should compute grapheme length", () => {
    const characterFromClass: Record<string, number> = {
      l: 0x1100,
      v: 0x1160,
      t: 0x11a8,
      lv: 0xac00,
      lvt: 0xac01,
      cr: 0x000d,
      lf: 0x000a,
      extend: 0x094d,
      n: 0x64,
      spacingmark: 0x0903,
      r: 0x1f1e6,
      control: 0x0001,
    };
    const stringFromClasses = (classes: string[]) =>
      String.fromCodePoint(...classes.map((k) => characterFromClass[k]));
    const cases: [string | string[], number][] = [
      ["", 0],
      ["abc", 3],
      ["こにちわ", 4],
      // boundary: Rails' [0x0924, 0x094D, 0x0930] row (expected 2, multibyte_chars_test.rb:576) is omitted — Intl.Segmenter implements Unicode 15.1+ GB9c and answers 1; Ruby 3.3 segments by Unicode 15.0.
      [["cr", "lf"], 1],
      [["cr", "n"], 2],
      [["lf", "n"], 2],
      [["control", "n"], 2],
      [["cr", "extend"], 2],
      [["lf", "extend"], 2],
      [["control", "extend"], 2],
      [["n", "cr"], 2],
      [["n", "lf"], 2],
      [["n", "control"], 2],
      [["extend", "cr"], 2],
      [["extend", "lf"], 2],
      [["extend", "control"], 2],
      [["l", "l"], 1],
      [["l", "v"], 1],
      [["l", "lv"], 1],
      [["l", "lvt"], 1],
      [["lv", "v"], 1],
      [["lv", "t"], 1],
      [["v", "v"], 1],
      [["v", "t"], 1],
      [["lvt", "t"], 1],
      [["t", "t"], 1],
      [["r", "r"], 1],
      [["n", "extend"], 1],
      [["n", "spacingmark"], 1],
      [["n", "n"], 2],
      [["n", "cr", "lf", "n"], 3],
      [["n", "l", "v", "t"], 2],
      [["cr", "extend", "n"], 3],
    ];
    for (const [input, expectedLength] of cases) {
      const str = Array.isArray(input) ? stringFromClasses(input) : input;
      expect(chars(str).graphemeLength(), JSON.stringify(input)).toEqual(expectedLength);
    }
  });

  it.skip("tidy bytes should tidy bytes", async () => {
    // BLOCKED: multibyte-tidy-bytes-scrub-recodes-bad-bytes
    const singleByteCases: Record<string, string> = {
      "\x21": "!",
      "\x41": "A",
      "\x7e": "~",
      "\udc80": "€",
      "\udc94": "”",
      "\udc9f": "Ÿ",
      "\udcc0": "À",
      "\udcc1": "Á",
      "\udcc2": "Â",
      "\udcc8": "È",
      "\udcdf": "ß",
      "\udce0": "à",
      "\udce8": "è",
      "\udcef": "ï",
      "\udcf0": "ð",
      "\udcf1": "ñ",
      "\udcff": "ÿ",
      "\x00": "\x00",
    };
    for (const [bad, good] of Object.entries(singleByteCases)) {
      expect(chars(bad).tidyBytes().toS()).toEqual(good);
      expect(chars(`${bad}${bad}`).tidyBytes()).toEqual(`${good}${good}`);
      expect(chars(`${bad}${bad}${bad}`).tidyBytes()).toEqual(`${good}${good}${good}`);
      expect(chars(`${bad}a`).tidyBytes()).toEqual(`${good}a`);
      expect(chars(`${bad}á`).tidyBytes()).toEqual(`${good}á`);
      expect(chars(`a${bad}a`).tidyBytes()).toEqual(`a${good}a`);
      expect(chars(`á${bad}á`).tidyBytes()).toEqual(`á${good}á`);
      expect(chars(`a${bad}`).tidyBytes()).toEqual(`a${good}`);
      expect(chars(`á${bad}`).tidyBytes()).toEqual(`á${good}`);
    }

    const byteString = "\udcb8\udc9e\x08\udc88\udca5";
    const tidyString = String.fromCodePoint(0xb8, 0x17e, 0x8, 0x2c6, 0xa5);
    expect(chars(byteString).tidyBytes().toS()).toEqual(tidyString);
    await assertNothingRaised(() => Array.from(chars(byteString).tidyBytes().toS()));

    expect(chars("\udcf0\udca5\udca4\x21").tidyBytes().toS()).toEqual("\u00f0\u00a5\u00a4\x21");
  });

  it("tidy bytes should forcibly tidy bytes if specified", () => {
    const byteString = "\u{25924}";
    expect(chars(byteString).tidyBytes()).not.toEqual("ð¥¤¤");
    expect(chars(byteString).tidyBytes(true)).toEqual("ð¥¤¤");
  });

  it("class is not forwarded", () => {
    expect(Chars).toEqual(mbChars(BYTE_STRING).constructor);
  });
});
