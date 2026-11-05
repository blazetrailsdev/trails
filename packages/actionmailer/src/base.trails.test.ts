import { describe, expect, it } from "vitest";
import { ActionView } from "@blazetrails/actionpack";
import { TestMailer, type Message } from "@blazetrails/mail";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { Collector } from "./collector.js";

class LayoutMailer extends Base {
  static {
    this.setMailerName("layout_mailer");
    (this as unknown as { layout(name: string): void }).layout("layout-mailer");
    this.prependViewPath(
      new ActionView.FixtureResolver({
        "layout-mailer/plain.text.tse": "Body",
        "layouts/layout-mailer.text.tse": "[<%= yield %>]",
      }),
    );
  }

  plain() {
    return this.mail({ to: "a@example.com", from: "b@example.com" });
  }
}

class ImpliedLayoutMailer extends Base {
  static {
    this.setMailerName("implied_layout_mailer");
    this.prependViewPath(
      new ActionView.FixtureResolver({
        "implied-layout-mailer/plain.text.tse": "Body",
        "layouts/implied-layout-mailer.text.tse": "<%= yield %> (implied)",
      }),
    );
  }

  plain() {
    return this.mail({ to: "a@example.com", from: "b@example.com" });
  }
}

class TextMailer extends Base {
  static {
    this.setMailerName("text_mailer");
    this.default({ to: "system@test.lindsaar.net", from: "jose@test.plataformatec.com" });
    this.prependViewPath(
      new ActionView.FixtureResolver({
        "text-mailer/plain.text.html": "Welcome",
        "text-mailer/multi.text.html": "Text",
        "text-mailer/multi.html.html": "<b>Html</b>",
      }),
    );
  }

  plain(hash: Record<string, unknown> = {}) {
    return this.mail(hash);
  }

  multi() {
    return this.mail();
  }

  bothDefaults() {
    return this.mail({ templateName: "multi" }, async (format) => {
      const f = format as unknown as { text(): Promise<void>; html(): Promise<void> };
      await f.text();
      await f.html();
    });
  }

  fromBlock() {
    return this.mail({ templateName: "multi" }, async (format) => {
      const f = format as unknown as {
        text(): Promise<void>;
        html(b: () => string): Promise<void>;
      };
      await f.text();
      await f.html(() => "<p>Block</p>");
    });
  }

  welcome(hash: Record<string, unknown> = {}) {
    (this.headers() as Message).set("X-SPAM", "Not SPAM");
    return this.mail({ subject: "The first email on new API!", ...hash });
  }

  async withAttachment(hash: Record<string, unknown> = {}) {
    await this.attachments().set("invoice.pdf", "This is test File content");
    await this.mail(hash);
  }

  async lateAttachment() {
    await this.mail({ body: "yay" });
    return this.attachments().set("invoice.pdf", "This is test File content");
  }
}

async function deliver(action: string, ...args: unknown[]): Promise<Message> {
  const mailer = new TextMailer();
  await mailer.process(action, ...args);
  return mailer.message as Message;
}

describe("Base#mail", () => {
  it("assigns headers and defaults and renders a :body", async () => {
    const email = await deliver("welcome", { body: "Hello there", from: "someone@example.com" });
    expect(Array.from(email.to() as string[])).toEqual(["system@test.lindsaar.net"]);
    expect(Array.from(email.from() as string[])).toEqual(["someone@example.com"]);
    expect(email.subject()).toBe("The first email on new API!");
    expect(email.mimeType()).toBe("text/plain");
    expect(email.body().encoded()).toBe("Hello there");
    expect(email.get("X-SPAM")!.toString()).toBe("Not SPAM");
  });

  it("falls back to the humanized action name for the subject", async () => {
    const email = await deliver("welcome", { body: "x", subject: null });
    expect(email.subject()).toBe("Welcome");
  });

  it("adds the :body as a part next to an attachment", async () => {
    const email = await deliver("withAttachment", { body: "I'm the eggman" });
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/mixed");
    expect(email.parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].decoded()).toBe("I'm the eggman");
    expect(email.parts[1].mimeType()).toBe("application/pdf");
  });

  it("raises when an attachment is added after mail", async () => {
    await expect(deliver("lateAttachment")).rejects.toThrow(
      /Can't add attachments after `mail` was called./,
    );
  });

  it("collects formats from a Collector", async () => {
    const context = { formats: null as unknown };
    const collector = new Collector(context, () => "default") as Collector & {
      text(o?: object | (() => string), b?: () => string): unknown;
    };
    await collector.text();
    await collector.any("html", () => "<p>Html</p>");
    await collector.text(() => "Block");
    expect(context.formats).toEqual([":text"]);
    expect(collector.responses).toEqual([
      { contentType: "text/plain", body: "default" },
      { contentType: "text/html", body: "<p>Html</p>" },
      { contentType: "text/plain", body: "Block" },
    ]);
  });
  it("renders the action's template", async () => {
    const email = await deliver("plain");
    expect(email.mimeType()).toBe("text/plain");
    expect(email.body().encoded()).toBe("Welcome");
  });

  it("renders one part per template format", async () => {
    const email = await deliver("multi");
    expect(email.mimeType()).toBe("multipart/alternative");
    expect([...email.parts.map((p) => [p.mimeType(), p.decoded()])]).toEqual([
      ["text/plain", "Text"],
      ["text/html", "<b>Html</b>"],
    ]);
  });

  it("renders the default template for a blockless format in the block form", async () => {
    const email = await deliver("fromBlock");
    expect([...email.parts.map((p) => [p.mimeType(), p.decoded()])]).toEqual([
      ["text/plain", "Text"],
      ["text/html", "<p>Block</p>"],
    ]);
  });

  it("raises MissingTemplate when the action has no template", async () => {
    await expect(deliver("welcome")).rejects.toBeInstanceOf(ActionView.MissingTemplate);
  });

  it("wraps the delivery method named in the headers", async () => {
    const email = await deliver("plain", {
      deliveryMethod: "test",
      deliveryMethodOptions: { a: 1 },
    });
    expect(email.deliveryMethod()).toBeInstanceOf(TestMailer);
    expect((email.deliveryMethod() as TestMailer).settings).toEqual({ a: 1 });
    expect(email.deliveryHandler).toBe(TextMailer);
  });

  it("raises on an unknown delivery method", async () => {
    await expect(deliver("plain", { deliveryMethod: "bogus" })).rejects.toThrow(
      new RuntimeError("Invalid delivery method :bogus"),
    );
  });
  it("renders each blockless format with its own formats in the block form", async () => {
    const email = await deliver("bothDefaults");
    expect([...email.parts.map((p) => [p.mimeType(), p.decoded()])]).toEqual([
      ["text/plain", "Text"],
      ["text/html", "<b>Html</b>"],
    ]);
  });
  it("wraps the rendered template in the mailer's layout", async () => {
    const mailer = new LayoutMailer();
    await mailer.process("plain");
    expect((mailer.message as Message).body().encoded()).toBe("[Body]");
  });
  it("wraps the rendered template in the mailer's implied layout", async () => {
    const mailer = new ImpliedLayoutMailer();
    await mailer.process("plain");
    expect((mailer.message as Message).body().encoded()).toBe("Body (implied)");
  });
});
