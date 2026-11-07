import { describe, expect, it } from "vitest";

describe("ActionMailer::Railtie boot", () => {
  it("loads ActionMailer::Base at boot once routes are lazy", { timeout: 30_000 }, async () => {
    await import("./action-mailer.js");
    const { Application } = await import("../application.js");
    const { ActionMailer } = await import("@blazetrails/actionmailer/namespaces");
    class MailerBootApp extends Application {}
    Application.register(MailerBootApp);
    const app = MailerBootApp.instance();
    const names = app.initializers.tsort().map((i) => i.name);
    expect(names.indexOf("make_routes_lazy")).toBeGreaterThan(-1);
    expect(names.indexOf("action_mailer.base")).toBeGreaterThan(names.indexOf("make_routes_lazy"));

    await app.initializeBang();

    expect(ActionMailer.Base).toBeDefined();
    expect(app.routesReloader().loaded).toBe(false);
  });
});
