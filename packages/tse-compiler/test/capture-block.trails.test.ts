import { describe, expect, it } from "vitest";
import { block, LocalJumpError } from "@blazetrails/ruby-compat";
import { Buffer } from "../lib/capture-block.js";

describe("Erubi::CaptureBlockEngine::Buffer", () => {
  it("<< appends the argument's to_s", () => {
    const buf = new Buffer();
    buf.append("a").append(1).append(null);
    expect(buf.toString()).toBe("a1");
  });

  it("| appends the escaped argument", () => {
    const buf = new Buffer();
    buf.bitwiseOr("<a & 'b'>");
    expect(buf.toString()).toBe("&lt;a &amp; &#39;b&#39;&gt;");
  });

  it("capture returns only what the block appended and restores the outer content", () => {
    const buf = new Buffer().append("outer");
    const captured = buf.capture(
      1,
      2,
      block((a: number, b: number) => {
        buf.append(a + b).append("x");
      }),
    );
    expect(captured).toBeInstanceOf(Buffer);
    expect(captured.toString()).toBe("3x");
    expect(buf.toString()).toBe("outer");
  });

  it("capture restores the outer content when the block raises", () => {
    const buf = new Buffer().append("outer");
    expect(() =>
      buf.capture(
        block(() => {
          buf.append("inner");
          throw new Error("boom");
        }),
      ),
    ).toThrow("boom");
    expect(buf.toString()).toBe("outer");
  });

  it("capture raises LocalJumpError without a block and restores the outer content", () => {
    const buf = new Buffer().append("outer");
    expect(() => buf.capture()).toThrow(LocalJumpError);
    expect(buf.toString()).toBe("outer");
  });
});
