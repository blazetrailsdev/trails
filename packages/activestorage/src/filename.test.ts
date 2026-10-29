import { describe, expect, it } from "vitest";
import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { Filename } from "./filename.js";

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
    expect(new Filename("evil‮fdp.exe").sanitized()).toBe("evil-fdp.exe");
  });

  it("compare case-insensitively", () => {
    expect(new Filename("foobar.pdf").equals(new Filename("FooBar.PDF"))).toBe(true);
  });

  it("compare sanitized", () => {
    expect(new Filename("foo-bar.pdf").equals(new Filename("foo\tbar.pdf"))).toBe(true);
  });

  it("encoding to json", () => {
    expect(ActiveSupportJSON.encode(new Filename("foo.pdf"))).toBe('"foo.pdf"');
    expect(ActiveSupportJSON.encode({ filename: new Filename("foo.pdf") })).toBe(
      '{"filename":"foo.pdf"}',
    );
    expect(JSON.stringify({ filename: new Filename("foo.pdf") })).toBe('{"filename":"foo.pdf"}');
  });
});
