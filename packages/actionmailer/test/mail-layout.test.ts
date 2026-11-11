import type { layout } from "@blazetrails/actionview";
import { describe, expect, it } from "vitest";
import { Base } from "../lib/base.js";
import type { Collector } from "../lib/collector.js";
import type { MessageDelivery } from "../lib/message-delivery.js";

type Format = Collector & Record<string, (...args: unknown[]) => unknown>;

const FIXTURES = new URL("./fixtures", import.meta.url).pathname;

class AutoLayoutMailer extends Base {
  declare world: string;

  static {
    this.setMailerName("auto_layout_mailer");
    this.prependViewPath(FIXTURES);
    this.default({ to: "test@localhost", subject: "You have a mail", from: "tester@example.com" });
  }

  hello() {
    return this.mail();
  }

  async spam() {
    this.world = "Earth";
    return this.mail({
      body: await this.render({ inline: "Hello, <%= this.world %>", layout: "spam" }),
    });
  }

  async nolayout() {
    this.world = "Earth";
    return this.mail({
      body: await this.render({ inline: "Hello, <%= this.world %>", layout: false }),
    });
  }

  multipart(type: string | null = null) {
    return this.mail({ contentType: type }, async (format) => {
      const f = format as Format;
      await f.text(() => this.render());
      await f.html(() => this.render());
    });
  }
}

class ExplicitLayoutMailer extends Base {
  static {
    this.setMailerName("explicit_layout_mailer");
    this.prependViewPath(FIXTURES);
    (this as unknown as ThisParameterType<typeof layout> & { layout: typeof layout }).layout(
      "spam",
      {
        except: ["logout"],
      },
    );
    this.default({ to: "test@localhost", subject: "You have a mail", from: "tester@example.com" });
  }

  signup() {
    return this.mail();
  }

  logout() {
    return this.mail();
  }
}

type Mailer<T> = T & Record<string, (...args: unknown[]) => MessageDelivery>;
const auto = AutoLayoutMailer as Mailer<typeof AutoLayoutMailer>;
const explicit = ExplicitLayoutMailer as Mailer<typeof ExplicitLayoutMailer>;

describe("LayoutMailerTest", () => {
  it("should pickup default layout", async () => {
    const mail = await auto.hello().message();
    expect(mail.body().toString().trim()).toBe("Hello from layout Inside");
  });

  it("should pickup multipart layout", async () => {
    const mail = await auto.multipart().message();
    expect(mail.mimeType()).toBe("multipart/alternative");
    expect(mail.parts.length).toBe(2);

    expect(mail.parts[0].mimeType()).toBe("text/plain");
    expect(mail.parts[0].body().toString()).toBe("text/plain layout - text/plain multipart");

    expect(mail.parts.at(-1)!.mimeType()).toBe("text/html");
    expect(mail.parts.at(-1)!.body().toString()).toBe("Hello from layout text/html multipart");
  });

  it("should pickup multipartmixed layout", async () => {
    const mail = await auto.multipart("multipart/mixed").message();
    expect(mail.mimeType()).toBe("multipart/mixed");
    expect(mail.parts.length).toBe(2);

    expect(mail.parts[0].mimeType()).toBe("text/plain");
    expect(mail.parts[0].body().toString()).toBe("text/plain layout - text/plain multipart");

    expect(mail.parts.at(-1)!.mimeType()).toBe("text/html");
    expect(mail.parts.at(-1)!.body().toString()).toBe("Hello from layout text/html multipart");
  });

  it("should pickup layout given to render", async () => {
    const mail = await auto.spam().message();
    expect(mail.body().toString().trim()).toBe("Spammer layout Hello, Earth");
  });

  it("should respect layout false", async () => {
    const mail = await auto.nolayout().message();
    expect(mail.body().toString().trim()).toBe("Hello, Earth");
  });

  it("explicit class layout", async () => {
    const mail = await explicit.signup().message();
    expect(mail.body().toString().trim()).toBe("Spammer layout We do not spam");
  });

  it("explicit layout exceptions", async () => {
    const mail = await explicit.logout().message();
    expect(mail.body().toString().trim()).toBe("You logged out");
  });
});
