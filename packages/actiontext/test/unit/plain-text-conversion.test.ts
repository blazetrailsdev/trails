import { describe, expect, it } from "vitest";
import "../test-helper.js";
import { Content } from "../../lib/content.js";
import { Fragment } from "../../lib/fragment.js";

async function assertConvertedTo(plainText: string, html: string | Fragment): Promise<void> {
  expect(await new Content(html).toPlainText()).toBe(plainText);
}

describe("ActionText::PlainTextConversionTest", () => {
  it("<p> tags are separated by two new lines", async () => {
    await assertConvertedTo(
      "Hello world!\n\nHow are you?",
      "<p>Hello world!</p><p>How are you?</p>",
    );
  });

  it("<blockquote> tags are separated by two new lines", async () => {
    await assertConvertedTo(
      "“Hello world!”\n\n“How are you?”",
      "<blockquote>Hello world!</blockquote><blockquote>How are you?</blockquote>",
    );
  });

  it("<blockquote> tag with whitespace", async () => {
    await assertConvertedTo("   “Hello world!” ", "<blockquote>   Hello world! </blockquote>");
  });

  it("<blockquote> tag with only whitespace", async () => {
    await assertConvertedTo("“”", "<blockquote> </blockquote>");
  });

  it("<ol> tags are separated by two new lines", async () => {
    await assertConvertedTo(
      "Hello world!\n\n1. list1\n\n1. list2\n\nHow are you?",
      "<p>Hello world!</p><ol><li>list1</li></ol><ol><li>list2</li></ol><p>How are you?</p>",
    );
  });

  it("<ul> tags are separated by two new lines", async () => {
    await assertConvertedTo(
      "Hello world!\n\n• list1\n\n• list2\n\nHow are you?",
      "<p>Hello world!</p><ul><li>list1</li></ul><ul><li>list2</li></ul><p>How are you?</p>",
    );
  });

  it("<h1> tags are separated by two new lines", async () => {
    await assertConvertedTo(
      "Hello world!\n\nHow are you?",
      "<h1>Hello world!</h1><div>How are you?</div>",
    );
  });

  it("<li> tags are separated by one new line", async () => {
    await assertConvertedTo(
      "• one\n• two\n• three",
      "<ul><li>one</li><li>two</li><li>three</li></ul>",
    );
  });

  it("<li> tags without a parent list", async () => {
    await assertConvertedTo("• one\n• two\n• three", "<li>one</li><li>two</li><li>three</li>");
  });

  it("basic nested <ul> tags are indented", async () => {
    await assertConvertedTo(
      "• Item 1\n  • Item 2",
      "<ul><li>Item 1<ul><li>Item 2</li></ul></li></ul>",
    );
  });

  it("basic nested <ol> tags are indented", async () => {
    await assertConvertedTo(
      "1. Item 1\n  1. Item 2",
      "<ol><li>Item 1<ol><li>Item 2</li></ol></li></ol>",
    );
  });

  it("complex nested / mixed list tags are indented", async () => {
    await assertConvertedTo(
      "• Item 0\n• Item 1\n  • Item A\n    1. Item i\n    2. Item ii\n  • Item B\n    • Item i\n• Item 2",
      "<ul><li>Item 0</li><li>Item 1<ul><li>Item A<ol><li>Item i</li><li>Item ii</li></ol></li><li>Item B<ul><li>Item i</li></ul></li></ul></li><li>Item 2</li></ul>",
    );
  });

  it("<br> tags are separated by one new line", async () => {
    await assertConvertedTo(
      "Hello world!\none\ntwo\nthree",
      "<p>Hello world!<br>one<br>two<br>three</p>",
    );
  });

  it("<div> tags are separated by one new line", async () => {
    await assertConvertedTo(
      "Hello world!\nHow are you?",
      "<div>Hello world!</div><div>How are you?</div>",
    );
  });

  it("<figcaption> tags are converted to their plain-text representation", async () => {
    await assertConvertedTo(
      "Hello world! [A condor in the mountain]",
      "Hello world! <figcaption>A condor in the mountain</figcaption>",
    );
  });

  it("<action-text-attachment> tags are converted to their plain-text representation", async () => {
    await assertConvertedTo(
      "Hello world! [Cat]",
      'Hello world! <action-text-attachment url="http://example.com/cat.jpg" content-type="image" caption="Cat"></action-text-attachment>',
    );
  });

  it("deeply nested tags are converted", async () => {
    const fragment = Fragment.wrap("<div>Hello world!</div><div></div>");
    let node = fragment.source.children.at(-1)!;
    for (let i = 0; i < 1_000; i++) {
      const child = node.dup();
      child.parent = node;
      node = child;
    }
    node.setInnerHtml("How are you?");
    await assertConvertedTo("Hello world!\nHow are you?", fragment);
  });

  it("preserves non-linebreak whitespace after text", async () => {
    await assertConvertedTo("Hello world!", "<div><strong>Hello </strong>world!</div>");
  });

  it("preserves trailing linebreaks after text", async () => {
    await assertConvertedTo("Hello\nHow are you?", "<strong>Hello<br></strong>How are you?");
  });
});
