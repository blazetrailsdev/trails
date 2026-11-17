import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Html5Node } from "@blazetrails/nokogiri";
import { ArgumentError, stderr } from "@blazetrails/ruby-compat";

import { Loofah } from "../lib/loofah.js";
import { PermitScrubber, TargetScrubber, TextOnlyScrubber } from "../lib/scrubbers.js";
import type { Scrubber } from "../lib/loofah/scrubber.js";

let scrubber: Scrubber;

function scrubFragment(html: string): string {
  return Loofah.scrubHtml5Fragment(html, scrubber).toHtml();
}

function assertScrubbed(html: string, expected = html): void {
  const output = scrubFragment(html);
  expect(output).toBe(expected);
}

function toNode(text: string): Html5Node {
  return Loofah.html5Fragment(text).children[0];
}

function assertNodeSkipped(text: string): void {
  assertScrubReturns(Loofah.Scrubber.CONTINUE, text);
}

function assertScrubStopped(text: string): void {
  assertScrubReturns(Loofah.Scrubber.STOP, text);
}

function assertScrubReturns(returnValue: unknown, text: string): void {
  const node = toNode(text);
  expect(scrubber.scrub(node)).toBe(returnValue);
}

function assertOutput(stderrPattern: RegExp, block: () => void): void {
  let err = "";
  const write = vi.spyOn(stderr, "write").mockImplementation((s: string) => {
    err += s;
    return true;
  });
  try {
    block();
  } finally {
    write.mockRestore();
  }
  expect(err).toMatch(stderrPattern);
}

describe("PermitScrubberTest", () => {
  let permit: PermitScrubber;
  beforeEach(() => {
    scrubber = permit = new PermitScrubber();
  });

  test("responds_to_scrub", () => {
    expect(typeof scrubber.scrub).toBe("function");
  });

  test("default_scrub_behavior", () => {
    assertScrubbed("<tag>hello</tag>", "hello");
  });

  test("default_scrub_removes_comments", () => {
    assertScrubbed(
      "<div>one</div><!-- two --><span>three</span>",
      "<div>one</div><span>three</span>",
    );
  });

  test("default_scrub_removes_processing_instructions", () => {
    const input = "<div>one</div><?div two><span>three</span>";
    const result = scrubFragment(input);

    const acceptableResults = ["<div>one</div>", "<div>one</div><span>three</span>"];

    expect(acceptableResults).toContain(result);
  });

  test("default_attributes_removal_behavior", () => {
    assertScrubbed('<p cooler="hello">hello</p>', "<p>hello</p>");
  });

  test("leaves_supplied_tags", () => {
    permit.tags = ["a"];
    assertScrubbed("<a>hello</a>");
  });

  test("leaves_only_supplied_tags", () => {
    const html = "<tag>leave me <span>now</span></tag>";
    permit.tags = ["tag"];
    assertScrubbed(html, "<tag>leave me now</tag>");
  });

  test("prunes_tags", () => {
    scrubber = permit = new PermitScrubber({ prune: true });
    permit.tags = ["tag"];
    const html = "<tag>leave me <span>now</span></tag>";
    assertScrubbed(html, "<tag>leave me </tag>");
  });

  test("leaves_comments_when_supplied_as_tag", () => {
    permit.tags = ["div", "comment"];
    assertScrubbed(
      "<div>one</div><!-- two --><span>three</span>",
      "<div>one</div><!-- two -->three",
    );
  });

  test("leaves_only_supplied_tags_nested", () => {
    const html = "<tag>leave <em>me <span>now</span></em></tag>";
    permit.tags = ["tag"];
    assertScrubbed(html, "<tag>leave me now</tag>");
  });

  test("leaves_supplied_attributes", () => {
    permit.attributes = ["cooler"];
    assertScrubbed('<a cooler="hello"></a>');
  });

  test("leaves_only_supplied_attributes", () => {
    permit.attributes = ["cooler"];
    assertScrubbed('<a cooler="hello" b="c" d="e"></a>', '<a cooler="hello"></a>');
  });

  test("leaves_supplied_tags_and_attributes", () => {
    permit.tags = ["tag"];
    permit.attributes = ["cooler"];
    assertScrubbed('<tag cooler="hello"></tag>');
  });

  test("leaves_only_supplied_tags_and_attributes", () => {
    permit.tags = ["tag"];
    permit.attributes = ["cooler"];
    const html = '<a></a><tag href=""></tag><tag cooler=""></tag>';
    assertScrubbed(html, '<tag></tag><tag cooler=""></tag>');
  });

  test("does_not_allow_safelisted_mglyph", () => {
    assertOutput(/WARNING: 'mglyph' tags cannot be allowed by the PermitScrubber/, () => {
      permit.tags = ["div", "mglyph", "span"];
    });
    expect(permit.tags).toEqual(["div", "span"]);
  });

  test("does_not_allow_safelisted_malignmark", () => {
    assertOutput(/WARNING: 'malignmark' tags cannot be allowed by the PermitScrubber/, () => {
      permit.tags = ["div", "malignmark", "span"];
    });
    expect(permit.tags).toEqual(["div", "span"]);
  });

  test("does_not_allow_safelisted_noscript", () => {
    assertOutput(/WARNING: 'noscript' tags cannot be allowed by the PermitScrubber/, () => {
      permit.tags = ["div", "noscript", "span"];
    });
    expect(permit.tags).toEqual(["div", "span"]);
  });

  test("leaves_text", () => {
    assertScrubbed("some text");
  });

  test("skips_text_nodes", () => {
    assertNodeSkipped("some text");
  });

  test("tags_accessor_validation", () => {
    let e: unknown;
    try {
      permit.tags = "tag";
    } catch (error) {
      e = error;
    }
    expect(e).toBeInstanceOf(ArgumentError);

    expect((e as Error).message).toBe("You should pass :tags as an Enumerable");
    expect(permit.tags).toBeNull();
  });

  test("attributes_accessor_validation", () => {
    let e: unknown;
    try {
      permit.attributes = "cooler";
    } catch (error) {
      e = error;
    }
    expect(e).toBeInstanceOf(ArgumentError);

    expect((e as Error).message).toBe("You should pass :attributes as an Enumerable");
    expect(permit.attributes).toBeNull();
  });
});

describe("TargetScrubberTest", () => {
  let target: TargetScrubber;
  beforeEach(() => {
    scrubber = target = new TargetScrubber();
  });

  test("targeting_tags_removes_only_them", () => {
    target.tags = ["a", "h1"];
    const html = "<script></script><a></a><h1></h1>";
    assertScrubbed(html, "<script></script>");
  });

  test("targeting_tags_removes_only_them_nested", () => {
    target.tags = ["a"];
    const html = "<tag><a><tag><a></a></tag></a></tag>";
    assertScrubbed(html, "<tag><tag></tag></tag>");
  });

  test("targeting_attributes_removes_only_them", () => {
    target.attributes = ["class", "id"];
    const html = '<a class="a" id="b" onclick="c"></a>';
    assertScrubbed(html, '<a onclick="c"></a>');
  });

  test("targeting_tags_and_attributes_removes_only_them", () => {
    target.tags = ["tag"];
    target.attributes = ["remove"];
    const html = '<tag remove="" other=""></tag><a remove="" other=""></a>';
    assertScrubbed(html, '<a other=""></a>');
  });

  test("prunes_tags", () => {
    scrubber = target = new TargetScrubber({ prune: true });
    target.tags = ["span"];
    const html = "<tag>leave me <span>now</span></tag>";
    assertScrubbed(html, "<tag>leave me </tag>");
  });
});

describe("TextOnlyScrubberTest", () => {
  beforeEach(() => {
    scrubber = new TextOnlyScrubber();
  });

  test("removes_all_tags_and_keep_the_content", () => {
    assertScrubbed("<tag>hello</tag>", "hello");
  });

  test("skips_text_nodes", () => {
    assertNodeSkipped("some text");
  });
});

describe("ReturningStopFromScrubNodeTest", () => {
  class ScrubStopper extends PermitScrubber {
    protected override scrubNode(_node: Html5Node): unknown {
      return Loofah.Scrubber.STOP;
    }
  }

  class ScrubContinuer extends PermitScrubber {
    protected override scrubNode(_node: Html5Node): unknown {
      return Loofah.Scrubber.CONTINUE;
    }
  }

  test("returns_stop_from_scrub_if_scrub_node_does", () => {
    scrubber = new ScrubStopper();
    assertScrubStopped("<script>remove me</script>");
  });

  test("returns_continue_from_scrub_if_scrub_node_does", () => {
    scrubber = new ScrubContinuer();
    assertNodeSkipped("<script>keep me</script>");
  });
});

describe("PermitScrubberMinimalOperationsTest", () => {
  class TestPermitScrubber extends PermitScrubber {
    scrubAttributeArgs: [string, string][] = [];
    scrubAttributesArgs: string[] = [];

    constructor() {
      super();

      this.tags = ["div"];
      this.attributes = ["class"];
    }

    protected override scrubAttributes(node: Html5Node): void {
      this.scrubAttributesArgs.push(node.name);

      super.scrubAttributes(node);
    }

    protected override scrubAttribute(
      node: Html5Node,
      attr: Html5Node["attributeNodes"][number],
    ): void {
      this.scrubAttributeArgs.push([node.name, attr.name]);

      super.scrubAttribute(node, attr);
    }
  }

  test("does_not_scrub_removed_attributes", () => {
    const testScrubber = (scrubber = new TestPermitScrubber());

    const input = "<div class='foo' href='bar'></div>";
    const frag = scrubFragment(input);
    expect(frag).toBe('<div class="foo"></div>');

    expect(testScrubber.scrubAttributeArgs).toEqual([["div", "class"]]);
  });

  test("does_not_scrub_attributes_of_a_removed_node", () => {
    const testScrubber = (scrubber = new TestPermitScrubber());

    const input = "<div class='foo' href='bar'><svg xlink:href='asdf'><set></set></svg></div>";
    const frag = scrubFragment(input);
    expect(frag).toBe('<div class="foo"></div>');

    expect(testScrubber.scrubAttributesArgs).toEqual(["div"]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
