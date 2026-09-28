import { describe, expect, it } from "vitest";
import { htmlSafe, isHtmlSafe, SafeBuffer } from "@blazetrails/activesupport";
import { OutputBuffer, StreamingBuffer } from "./buffers.js";

function sharedBufferTests(
  setup: () => { buffer: OutputBuffer | StreamingBuffer; output: () => SafeBuffer },
): void {
  const capture = (buffer: OutputBuffer | StreamingBuffer, fn: () => void): SafeBuffer =>
    buffer instanceof OutputBuffer ? buffer.capture([], fn) : buffer.capture(fn);

  it("#<< maintains HTML safety", () => {
    const { buffer, output } = setup();
    buffer.append("<script>alert('pwned!')</script>");
    expect(isHtmlSafe(buffer)).toBe(true);
    expect(isHtmlSafe(output())).toBe(true);
    expect(output().toString()).toBe("&lt;script&gt;alert(&#39;pwned!&#39;)&lt;/script&gt;");
  });

  it("#safe_append= bypasses HTML safety", () => {
    const { buffer, output } = setup();
    buffer.safeAppend("<p>This is fine</p>");
    expect(isHtmlSafe(buffer)).toBe(true);
    expect(isHtmlSafe(output())).toBe(true);
    expect(output().toString()).toBe("<p>This is fine</p>");
  });

  it("#raw allow to bypass HTML escaping", () => {
    const { buffer, output } = setup();
    const rawBuffer = buffer.raw();
    rawBuffer.append("<script>alert('pwned!')</script>");
    expect(isHtmlSafe(buffer)).toBe(true);
    expect(isHtmlSafe(output())).toBe(true);
    expect(output().toString()).toBe("<script>alert('pwned!')</script>");
  });

  it("#capture allow to intercept writes", () => {
    const { buffer, output } = setup();
    buffer.append("Hello");
    const result = capture(buffer, () => {
      buffer.append("George!");
    });
    expect(result.toString()).toBe("George!");
    expect(isHtmlSafe(result)).toBe(true);

    buffer.append(" World!");
    expect(output().toString()).toBe("Hello World!");
  });

  it("#raw respects #capture", () => {
    const { buffer, output } = setup();
    buffer.append("Hello");
    const rawBuffer = buffer.raw();
    const result = capture(buffer, () => {
      rawBuffer.append("George!");
    });
    expect(result.toString()).toBe("George!");
    expect(isHtmlSafe(result)).toBe(true);

    buffer.append(" World!");
    expect(output().toString()).toBe("Hello World!");
  });
}

describe("TestOutputBuffer", () => {
  const setup = () => {
    const buffer = new OutputBuffer();
    return { buffer, output: () => buffer.toString() };
  };

  sharedBufferTests(setup);

  it("can be duped", () => {
    const { buffer, output } = setup();
    buffer.append("Hello");
    const copy = buffer.dup();
    copy.append(" World!");
    expect(copy.toString().toString()).toBe("Hello World!");
    expect(output().toString()).toBe("Hello");
  });
});

describe("TestStreamingBuffer", () => {
  sharedBufferTests(() => {
    let rawBuffer = "";
    const buffer = new StreamingBuffer((value) => {
      rawBuffer += value;
    });
    return { buffer, output: () => htmlSafe(rawBuffer) };
  });
});
