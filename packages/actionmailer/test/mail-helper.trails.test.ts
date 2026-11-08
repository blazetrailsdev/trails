import { describe, expect, it } from "vitest";
import { MailHelper } from "../lib/mail-helper.js";

describe("MailHelper", () => {
  const helper = { ...MailHelper, _controller: null, _message: null };

  it("format_paragraph wraps at the given length and indents", () => {
    expect(
      helper.formatParagraph("But soft! What light through yonder window breaks?", 15, 1),
    ).toBe(" But soft! What\n light through\n yonder window\n breaks?");
  });

  it("format_paragraph keeps a long first word on its own line", () => {
    expect(helper.formatParagraph("Antidisestablishmentarianism is very long.", 10, 1)).toBe(
      " Antidisestablishmentarianism\n is very\n long.",
    );
  });

  it("block_format formats paragraphs and puts list points on their own line", () => {
    const text =
      "This is the\nfirst     paragraph.\n\nThe second\n   paragraph.\n\n* item1 * item2\n  * item3\n";
    expect(helper.blockFormat(text)).toBe(
      "  This is the first paragraph.\n\n  The second paragraph.\n\n  * item1\n  * item2\n  * item3\n",
    );
  });
});
