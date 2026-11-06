import { describe, expect, it } from "vitest";
import { onLoad } from "@blazetrails/activesupport";

describe("ActionMailer::Railtie load order", () => {
  it("leaves ActionMailer::Base unloaded until something references it", async () => {
    const loaded: unknown[] = [];
    onLoad("action_mailer", (base) => loaded.push(base));

    await import("./action-mailer.js");
    expect(loaded).toEqual([]);

    const { ActionMailer } = await import("@blazetrails/actionmailer");
    expect(loaded).toEqual([ActionMailer.Base]);
  });

  it("loads ActionMailer::Base at boot once routes are lazy", async () => {
    await import("./action-mailer.js");
    const { Application } = await import("../application.js");
    class MailerBootApp extends Application {}
    Application.register(MailerBootApp);
    const names = MailerBootApp.instance()
      .initializers.tsort()
      .map((i) => i.name);

    expect(names.indexOf("action_mailer.base")).toBeGreaterThan(names.indexOf("make_routes_lazy"));
    expect(names.indexOf("make_routes_lazy")).toBeGreaterThan(-1);
  });
});
