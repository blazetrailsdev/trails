import { describe, expect, it } from "vitest";
import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { assertOperator } from "@blazetrails/activesupport/testing/assertions";
import { Filename } from "../../lib/filename.js";

describe("ActiveStorage::FilenameTest", () => {
  it("base", () => {
    expect(new Filename("racecar.jpg").base()).toBe("racecar");
    expect(new Filename("race.car.jpg").base()).toBe("race.car");
    expect(new Filename("racecar").base()).toBe("racecar");
  });

  it("extension with delimiter", () => {
    expect(new Filename("racecar.jpg").extensionWithDelimiter()).toBe(".jpg");
    expect(new Filename("race.car.jpg").extensionWithDelimiter()).toBe(".jpg");
    expect(new Filename("racecar").extensionWithDelimiter()).toBe("");
  });

  it("extension without delimiter", () => {
    expect(new Filename("racecar.jpg").extensionWithoutDelimiter()).toBe("jpg");
    expect(new Filename("race.car.jpg").extensionWithoutDelimiter()).toBe("jpg");
    expect(new Filename("racecar").extensionWithoutDelimiter()).toBe("");
  });

  it("sanitize", () => {
    for (const character of '%$|:;/<>?*"\t\r\n\\') {
      const filename = new Filename(`foo${character}bar.pdf`);
      expect(filename.sanitized()).toBe("foo-bar.pdf");
      expect(filename.toString()).toBe("foo-bar.pdf");
    }
  });

  it("sanitize transcodes to valid UTF-8", () => {
    for (const [actual, expected] of Object.entries({ "\x00": "" })) {
      expect(new Filename(actual).sanitized()).toBe(expected);
    }
  });

  it("strips RTL override chars used to spoof unsafe executables as docs", () => {
    expect(new Filename("evil\u202Efdp.exe").sanitized()).toBe("evil-fdp.exe");
  });

  it("compare case-insensitively", () => {
    assertOperator(new Filename("foobar.pdf"), "==", new Filename("FooBar.PDF"));
  });

  it("compare sanitized", () => {
    assertOperator(new Filename("foo-bar.pdf"), "==", new Filename("foo\tbar.pdf"));
  });

  it("encoding to json", () => {
    expect(ActiveSupportJSON.encode(new Filename("foo.pdf"))).toBe('"foo.pdf"');
    expect(ActiveSupportJSON.encode({ filename: new Filename("foo.pdf") })).toBe(
      '{"filename":"foo.pdf"}',
    );
    expect(JSON.stringify({ filename: new Filename("foo.pdf") })).toBe('{"filename":"foo.pdf"}');
  });
});
