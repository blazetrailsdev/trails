import { describe, expect, it } from "vitest";
import type { MessageDelivery } from "../lib/message-delivery.js";
import { FormBuilderMailer } from "./support/mailers/form-builder-mailer.js";

type Mailer = typeof FormBuilderMailer & Record<string, (...args: unknown[]) => MessageDelivery>;

describe("MailerFormBuilderTest", () => {
  it("default form builder assigned", async () => {
    const email = await (FormBuilderMailer as Mailer).welcome().message();
    expect(email.body().encoded()).toContain("hi from SpecializedFormBuilder");
  });
});
