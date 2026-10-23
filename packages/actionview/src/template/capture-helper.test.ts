import { describe, it, expect, beforeEach } from "vitest";

import type { SafeBuffer } from "@blazetrails/activesupport";
import { OutputBuffer } from "../buffers.js";
import { OutputFlow } from "../flows.js";
import {
  capture,
  contentFor,
  isContentFor,
  provide,
  withOutputBuffer,
  type CaptureHelperHost,
} from "../helpers/capture-helper.js";
import { contentTag } from "../helpers/tag-helper.js";
import { raw } from "../helpers/output-safety-helper.js";
import { assertNil } from "@blazetrails/activesupport";

interface Host extends CaptureHelperHost {
  capture: typeof capture;
  contentFor: typeof contentFor;
  isContentFor: typeof isContentFor;
  provide: typeof provide;
  withOutputBuffer: typeof withOutputBuffer;
}

function makeHost(): Host {
  return {
    outputBuffer: new OutputBuffer(),
    viewFlow: new OutputFlow(),
    capture,
    contentFor,
    isContentFor,
    provide,
    withOutputBuffer,
  };
}

describe("CaptureHelperTest", () => {
  let av: Host;

  beforeEach(() => {
    av = makeHost();
  });

  it("capture captures the temporary output buffer in its block", () => {
    expect(av.outputBuffer!.isEmpty()).toBeTruthy();
    const string = av.capture(() => {
      av.outputBuffer!.concat("foo");
      av.outputBuffer!.concat("bar");
    });
    expect(av.outputBuffer!.isEmpty()).toBeTruthy();
    expect(string?.toString()).toBe("foobar");
  });

  it("capture captures the value returned by the block if the temporary buffer is blank", () => {
    const string = av.capture((a: string, b: string) => a + b, "foo", "bar");
    expect(string?.toString()).toBe("foobar");
  });

  it("capture returns nil if the returned value is not a string", () => {
    assertNil(av.capture(() => 1));
  });

  it("capture escapes html", () => {
    const string = av.capture(() => "<em>bar</em>");
    expect(string?.toString()).toBe("&lt;em&gt;bar&lt;/em&gt;");
  });

  it("capture doesnt escape twice", () => {
    const string = av.capture(() => raw("&lt;em&gt;bar&lt;/em&gt;"));
    expect(string?.toString()).toBe("&lt;em&gt;bar&lt;/em&gt;");
  });

  it("capture does not reassign buffer", () => {
    const original = av.outputBuffer;
    av.capture(() => {
      expect(av.outputBuffer).toBe(original);
    });
  });

  it("content for used for read", () => {
    av.contentFor("foo", "foo");
    expect(av.contentFor("foo")?.toString()).toBe("foo");

    av.contentFor("bar", undefined, undefined, () => "bar");
    expect(av.contentFor("bar")?.toString()).toBe("bar");
  });

  it("content for with multiple calls", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.contentFor("title", "foo");
    av.contentFor("title", "bar");
    expect(av.contentFor("title")?.toString()).toBe("foobar");
  });

  it("content for with multiple calls and flush", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.contentFor("title", "foo");
    av.contentFor("title", "bar", { flush: true });
    expect(av.contentFor("title")?.toString()).toBe("bar");
  });

  it("content for with block", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.contentFor("title", undefined, undefined, () => {
      av.outputBuffer!.concat("foo");
      av.outputBuffer!.concat("bar");
      return null;
    });
    expect(av.contentFor("title")?.toString()).toBe("foobar");
  });

  it("content for with block and multiple calls with flush", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.contentFor("title", undefined, undefined, () => "foo");
    av.contentFor("title", undefined, { flush: true }, () => "bar");
    expect(av.contentFor("title")?.toString()).toBe("bar");
  });

  it("content for with block and multiple calls with flush nil content", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.contentFor("title", undefined, undefined, () => "foo");
    av.contentFor("title", null, { flush: true }, () => "bar");
    expect(av.contentFor("title")?.toString()).toBe("bar");
  });

  it("content for with block and multiple calls without flush", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.contentFor("title", undefined, undefined, () => "foo");
    av.contentFor("title", undefined, { flush: false }, () => "bar");
    expect(av.contentFor("title")?.toString()).toBe("foobar");
  });

  it("content for with whitespace block", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.contentFor("title", "foo");
    av.contentFor("title", undefined, undefined, () => {
      av.outputBuffer!.concat("  \n  ");
      return null;
    });
    av.contentFor("title", "bar");
    expect(av.contentFor("title")?.toString()).toBe("foobar");
  });

  it("content for with whitespace block and flush", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.contentFor("title", "foo");
    av.contentFor("title", undefined, { flush: true }, () => {
      av.outputBuffer!.concat("  \n  ");
      return null;
    });
    av.contentFor("title", "bar", { flush: true });
    expect(av.contentFor("title")?.toString()).toBe("bar");
  });

  it("content for returns nil when writing", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    assertNil(av.contentFor("title", "foo"));
    assertNil(
      av.contentFor("title", undefined, undefined, () => {
        av.outputBuffer!.concat("bar");
        return null;
      }),
    );
    assertNil(
      av.contentFor("title", undefined, undefined, () => {
        av.outputBuffer!.concat("  \n  ");
        return null;
      }),
    );
    expect(av.contentFor("title")?.toString()).toBe("foobar");
    assertNil(av.contentFor("title", "foo", { flush: true }));
    assertNil(
      av.contentFor("title", undefined, { flush: true }, () => {
        av.outputBuffer!.concat("bar");
        return null;
      }),
    );
    assertNil(
      av.contentFor("title", undefined, { flush: true }, () => {
        av.outputBuffer!.concat("  \n  ");
        return null;
      }),
    );
    expect(av.contentFor("title")?.toString()).toBe("bar");
  });

  it("content for returns nil when content missing", () => {
    assertNil(av.contentFor("some_missing_key"));
  });

  it("content for question mark", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.contentFor("title", "title");
    expect(av.isContentFor("title")).toBeTruthy();
    expect(av.isContentFor("something_else")).toBeFalsy();
  });

  it("content for should be html safe after flush empty", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.contentFor("title", undefined, undefined, () => contentTag.call(av, "p", "title"));
    expect((av.contentFor("title") as SafeBuffer).htmlSafe).toBeTruthy();
    av.contentFor("title", "", { flush: true });
    av.contentFor("title", undefined, undefined, () => contentTag.call(av, "p", "title"));
    expect((av.contentFor("title") as SafeBuffer).htmlSafe).toBeTruthy();
  });

  it("provide", () => {
    expect(av.isContentFor("title")).toBeFalsy();
    av.provide("title", "hi");
    expect(av.isContentFor("title")).toBeTruthy();
    expect(av.contentFor("title")?.toString()).toBe("hi");
    av.provide("title", "<p>title</p>");
    expect(av.contentFor("title")?.toString()).toBe("hi&lt;p&gt;title&lt;/p&gt;");

    av.viewFlow = new OutputFlow();
    av.provide("title", "hi");
    av.provide("title", raw("<p>title</p>"));
    expect(av.contentFor("title")?.toString()).toBe("hi<p>title</p>");
  });

  it("with output buffer swaps the output buffer given no argument", () => {
    expect(av.outputBuffer!.isEmpty()).toBeTruthy();
    const buffer = av.withOutputBuffer(null, () => {
      av.outputBuffer!.concat(".");
    });
    expect(buffer.toString().toString()).toBe(".");
    expect(av.outputBuffer!.isEmpty()).toBeTruthy();
  });

  it("with output buffer swaps the output buffer with an argument", () => {
    expect(av.outputBuffer!.isEmpty()).toBeTruthy();
    const buffer = new OutputBuffer(".");
    av.withOutputBuffer(buffer, () => {
      av.outputBuffer!.concat(".");
    });
    expect(buffer.toString().toString()).toBe("..");
    expect(av.outputBuffer!.isEmpty()).toBeTruthy();
  });

  it("with output buffer restores the output buffer", () => {
    const buffer = new OutputBuffer();
    av.outputBuffer = buffer;
    av.withOutputBuffer(null, () => {
      av.outputBuffer!.concat(".");
    });
    expect(buffer === av.outputBuffer).toBeTruthy();
  });

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either" — an OutputBuffer holds a JS string, which has no encoding to force or read.
  it.skip("with output buffer sets proper encoding", () => {
    av.outputBuffer = new OutputBuffer();
    const buffer = av.outputBuffer as unknown as {
      encoding: string;
      forceEncoding(encoding: string): void;
    };

    const altEncoding = buffer.encoding === "US-ASCII" ? "UTF-8" : "US-ASCII";
    buffer.forceEncoding(altEncoding);

    av.withOutputBuffer(null, () => {
      expect((av.outputBuffer as unknown as { encoding: string }).encoding).toBe(altEncoding);
    });
  });

  it("with output buffer does not assume there is an output buffer", () => {
    expect(av.outputBuffer!.isEmpty()).toBeTruthy();
    expect(
      av
        .withOutputBuffer(null, () => {})
        .toString()
        .toString(),
    ).toBe("");
  });

  it("ignore the block return if its the buffer", () => {
    av.outputBuffer!.safeConcat("something");
    const string = av.capture(() => {
      av.outputBuffer!.concat("foo");
      av.outputBuffer!.concat("bar");
      return av.outputBuffer;
    });
    expect(string?.toString()).toBe("foobar");
  });
});
