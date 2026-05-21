import { describe, it, expect, beforeEach } from "vitest";

import { OutputBuffer } from "../buffers.js";
import { OutputFlow } from "../flows.js";
import {
  capture,
  contentFor,
  contentForQuestion,
  provide,
  withOutputBuffer,
  type CaptureHelperHost,
} from "../helpers/capture-helper.js";
import { contentTag } from "../helpers/tag-helper.js";
import { raw } from "../helpers/output-safety-helper.js";

interface Host extends CaptureHelperHost {
  capture: typeof capture;
  contentFor: typeof contentFor;
  contentForQuestion: typeof contentForQuestion;
  provide: typeof provide;
  withOutputBuffer: typeof withOutputBuffer;
}

function makeHost(): Host {
  return {
    outputBuffer: new OutputBuffer(),
    viewFlow: new OutputFlow(),
    capture,
    contentFor,
    contentForQuestion,
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
    expect(av.outputBuffer!.isEmpty()).toBe(true);
    const string = av.capture(() => {
      av.outputBuffer!.concat("foo");
      av.outputBuffer!.concat("bar");
    });
    expect(av.outputBuffer!.isEmpty()).toBe(true);
    expect(string?.toString()).toBe("foobar");
  });

  it("capture captures the value returned by the block if the temporary buffer is blank", () => {
    const string = av.capture((a: string, b: string) => a + b, "foo", "bar");
    expect(string?.toString()).toBe("foobar");
  });

  it("capture returns nil if the returned value is not a string", () => {
    expect(av.capture(() => 1)).toBeNull();
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
    expect(av.contentForQuestion("title")).toBe(false);
    av.contentFor("title", "foo");
    av.contentFor("title", "bar");
    expect(av.contentFor("title")?.toString()).toBe("foobar");
  });

  it("content for with multiple calls and flush", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    av.contentFor("title", "foo");
    av.contentFor("title", "bar", { flush: true });
    expect(av.contentFor("title")?.toString()).toBe("bar");
  });

  it("content for with block", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    av.contentFor("title", undefined, undefined, () => {
      av.outputBuffer!.concat("foo");
      av.outputBuffer!.concat("bar");
      return null;
    });
    expect(av.contentFor("title")?.toString()).toBe("foobar");
  });

  it("content for with block and multiple calls with flush", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    av.contentFor("title", undefined, undefined, () => "foo");
    av.contentFor("title", undefined, { flush: true }, () => "bar");
    expect(av.contentFor("title")?.toString()).toBe("bar");
  });

  it("content for with block and multiple calls with flush nil content", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    av.contentFor("title", undefined, undefined, () => "foo");
    av.contentFor("title", null, { flush: true }, () => "bar");
    expect(av.contentFor("title")?.toString()).toBe("bar");
  });

  it("content for with block and multiple calls without flush", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    av.contentFor("title", undefined, undefined, () => "foo");
    av.contentFor("title", undefined, { flush: false }, () => "bar");
    expect(av.contentFor("title")?.toString()).toBe("foobar");
  });

  it("content for with whitespace block", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    av.contentFor("title", "foo");
    av.contentFor("title", undefined, undefined, () => {
      av.outputBuffer!.concat("  \n  ");
      return null;
    });
    av.contentFor("title", "bar");
    expect(av.contentFor("title")?.toString()).toBe("foobar");
  });

  it("content for with whitespace block and flush", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    av.contentFor("title", "foo");
    av.contentFor("title", undefined, { flush: true }, () => {
      av.outputBuffer!.concat("  \n  ");
      return null;
    });
    av.contentFor("title", "bar", { flush: true });
    expect(av.contentFor("title")?.toString()).toBe("bar");
  });

  it("content for returns nil when writing", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    expect(av.contentFor("title", "foo")).toBeNull();
    expect(
      av.contentFor("title", undefined, undefined, () => {
        av.outputBuffer!.concat("bar");
        return null;
      }),
    ).toBeNull();
    expect(
      av.contentFor("title", undefined, undefined, () => {
        av.outputBuffer!.concat("  \n  ");
        return null;
      }),
    ).toBeNull();
    expect(av.contentFor("title")?.toString()).toBe("foobar");
    expect(av.contentFor("title", "foo", { flush: true })).toBeNull();
    expect(
      av.contentFor("title", undefined, { flush: true }, () => {
        av.outputBuffer!.concat("bar");
        return null;
      }),
    ).toBeNull();
    expect(
      av.contentFor("title", undefined, { flush: true }, () => {
        av.outputBuffer!.concat("  \n  ");
        return null;
      }),
    ).toBeNull();
    expect(av.contentFor("title")?.toString()).toBe("bar");
  });

  it("content for returns nil when content missing", () => {
    expect(av.contentFor("some_missing_key")).toBeNull();
  });

  it("content for question mark", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    av.contentFor("title", "title");
    expect(av.contentForQuestion("title")).toBe(true);
    expect(av.contentForQuestion("something_else")).toBe(false);
  });

  it("content for should be html safe after flush empty", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    av.contentFor("title", undefined, undefined, () => contentTag("p", "title"));
    expect(av.contentFor("title")!.htmlSafe).toBe(true);
    av.contentFor("title", "", { flush: true });
    av.contentFor("title", undefined, undefined, () => contentTag("p", "title"));
    expect(av.contentFor("title")!.htmlSafe).toBe(true);
  });

  it("provide", () => {
    expect(av.contentForQuestion("title")).toBe(false);
    av.provide("title", "hi");
    expect(av.contentForQuestion("title")).toBe(true);
    expect(av.contentFor("title")?.toString()).toBe("hi");
    av.provide("title", "<p>title</p>");
    expect(av.contentFor("title")?.toString()).toBe("hi&lt;p&gt;title&lt;/p&gt;");

    av.viewFlow = new OutputFlow();
    av.provide("title", "hi");
    av.provide("title", raw("<p>title</p>"));
    expect(av.contentFor("title")?.toString()).toBe("hi<p>title</p>");
  });

  it("with output buffer swaps the output buffer given no argument", () => {
    expect(av.outputBuffer!.isEmpty()).toBe(true);
    const buffer = av.withOutputBuffer(null, () => {
      av.outputBuffer!.concat(".");
    });
    expect(buffer.toString().toString()).toBe(".");
    expect(av.outputBuffer!.isEmpty()).toBe(true);
  });

  it("with output buffer swaps the output buffer with an argument", () => {
    expect(av.outputBuffer!.isEmpty()).toBe(true);
    const buffer = new OutputBuffer(".");
    av.withOutputBuffer(buffer, () => {
      av.outputBuffer!.concat(".");
    });
    expect(buffer.toString().toString()).toBe("..");
    expect(av.outputBuffer!.isEmpty()).toBe(true);
  });

  it("with output buffer restores the output buffer", () => {
    const buffer = new OutputBuffer();
    av.outputBuffer = buffer;
    av.withOutputBuffer(null, () => {
      av.outputBuffer!.concat(".");
    });
    expect(buffer).toBe(av.outputBuffer);
  });

  it.skip("with output buffer sets proper encoding", () => {
    // SKIPPED: TS strings are always UTF-16 — no per-string encoding
    // to swap, so Rails' force_encoding propagation has no analogue.
  });

  it("with output buffer does not assume there is an output buffer", () => {
    expect(av.outputBuffer!.isEmpty()).toBe(true);
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
