import { describe, expect, it } from "vitest";
import { assertNothingRaised } from "@blazetrails/activesupport/testing/assertions";
import { Base } from "../lib/base.js";
import type { Collector } from "../lib/collector.js";
import type { MessageDelivery } from "../lib/message-delivery.js";
import { MailHelper } from "../lib/mail-helper.js";

type Format = Collector & Record<string, (...args: unknown[]) => unknown>;

class HelperMailer extends Base {
  declare text: string;

  useMailHelper() {
    this.text =
      "But soft! What light through yonder window breaks? It is the east, " +
      "and Juliet is the sun. Arise, fair sun, and kill the envious moon, " +
      "which is sick and pale with grief that thou, her maid, art far more " +
      "fair than she. Be not her maid, for she is envious! Her vestal " +
      "livery is but sick and green, and none but fools do wear it. Cast " +
      "it off!";

    return this.mailWithDefaults(async (format) => {
      await (format as Format).html(() => this.render({ inline: "<%= blockFormat(this.text) %>" }));
    });
  }

  useFormatParagraph() {
    this.text = "But soft! What light through yonder window breaks?";

    return this.mailWithDefaults(async (format) => {
      await (format as Format).html(() =>
        this.render({ inline: "<%= formatParagraph(this.text, 15, 1) %>" }),
      );
    });
  }

  useFormatParagraphWithLongFirstWord() {
    this.text = "Antidisestablishmentarianism is very long.";

    return this.mailWithDefaults(async (format) => {
      await (format as Format).html(() =>
        this.render({ inline: "<%= formatParagraph(this.text, 10, 1) %>" }),
      );
    });
  }

  useMailer() {
    return this.mailWithDefaults(async (format) => {
      await (format as Format).html(() =>
        this.render({ inline: "<%= mailer().message.subject() %>" }),
      );
    });
  }

  useMessage() {
    return this.mailWithDefaults(async (format) => {
      await (format as Format).html(() => this.render({ inline: "<%= message().subject() %>" }));
    });
  }

  useBlockFormat() {
    this.text = `This is the
first     paragraph.

The second
   paragraph.

* item1 * item2
  * item3
`;

    return this.mailWithDefaults(async (format) => {
      await (format as Format).html(() => this.render({ inline: "<%= blockFormat(this.text) %>" }));
    });
  }

  useCache() {
    return this.mailWithDefaults(async (format) => {
      await (format as Format).html(() =>
        this.render({
          inline: "<% await cache('foo', {}, () => { %>Greetings from a cache helper block<% }) %>",
        }),
      );
    });
  }

  private mailWithDefaults(block: (format: Collector) => Promise<void>) {
    return this.mail(
      { to: "test@localhost", from: "tester@example.com", subject: "using helpers" },
      block,
    );
  }
}

type Mailer<T> = T & Record<string, (...args: unknown[]) => MessageDelivery>;
const mailer = HelperMailer as Mailer<typeof HelperMailer>;

describe("MailerHelperTest", () => {
  it("use mail helper", async () => {
    const mail = await mailer.useMailHelper().message();
    expect(mail.body().encoded()).toMatch(/ {2}But soft!/);
    expect(mail.body().encoded()).toMatch(/east, and\r\n {2}Juliet/);
  });

  it("use mailer", async () => {
    const mail = await mailer.useMailer().message();
    expect(mail.body().encoded()).toContain("using helpers");
  });

  it("use message", async () => {
    const mail = await mailer.useMessage().message();
    expect(mail.body().encoded()).toContain("using helpers");
  });

  it("use format paragraph", async () => {
    const mail = await mailer.useFormatParagraph().message();
    expect(mail.body().encoded()).toContain(
      " But soft! What\r\n light through\r\n yonder window\r\n breaks?",
    );
  });

  it("use format paragraph with long first word", async () => {
    const mail = await mailer.useFormatParagraphWithLongFirstWord().message();
    expect(mail.body().encoded()).toBe(" Antidisestablishmentarianism\r\n is very\r\n long.");
  });

  it("use block format", async () => {
    const mail = await mailer.useBlockFormat().message();
    const expected = `  This is the first paragraph.

  The second paragraph.

  * item1
  * item2
  * item3
`;
    expect(mail.body().encoded()).toBe(expected.replaceAll("\n", "\r\n"));
  });

  it("use cache", async () => {
    await assertNothingRaised(async () => {
      const mail = await mailer.useCache().message();
      expect(mail.body().encoded()).toBe("Greetings from a cache helper block");
    });
  });

  function helper() {
    return { ...MailHelper, _controller: null, _message: null };
  }

  it("block format", () => {
    expect(helper().blockFormat(" * foo")).toBe("  * foo\n");
    expect(helper().blockFormat("   * foo")).toBe("  * foo\n");
    expect(helper().blockFormat("* foo")).toBe("  * foo\n");
    expect(helper().blockFormat("* foo*bar")).toBe("  * foo\n*bar");
    expect(helper().blockFormat("* foo * bar")).toBe("  * foo\n  * bar\n");
    expect(helper().blockFormat("* ")).toBe("  *");
  });
});
