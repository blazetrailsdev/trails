import { TopLevel } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Base as ActionMailerBase } from "@blazetrails/actionmailer";
import { ActionController } from "@blazetrails/actionpack";
import { File, constSet, env, setEnv } from "@blazetrails/ruby-compat";
import "./support/database/setup.js";
import "@blazetrails/trailties/test-help";

setEnv("RAILS_INBOUND_EMAIL_PASSWORD", "tbsy84uSV1Kt3ZJZELY2TmShPRs91E3yL4tzf96297vBCkDWgL");

TestCase.fileFixturePath = File.expandPath("fixtures/files", import.meta.dirname);

export function credentials(): string {
  return ActionController.HttpAuthentication.Basic.encodeCredentials(
    "actionmailbox",
    env.RAILS_INBOUND_EMAIL_PASSWORD ?? "",
  );
}

export async function switchPasswordTo(
  newPassword: string | null,
  block: () => Promise<unknown>,
): Promise<void> {
  const previousPassword = env.RAILS_INBOUND_EMAIL_PASSWORD;
  setEnv("RAILS_INBOUND_EMAIL_PASSWORD", newPassword ?? undefined);
  try {
    await block();
  } finally {
    setEnv("RAILS_INBOUND_EMAIL_PASSWORD", previousPassword);
  }
}

ActionMailerBase.deliveryMethod = "test";

export class BounceMailer extends ActionMailerBase {
  bounce({ to }: { to: unknown }) {
    return this.mail(
      { from: "receiver@example.com", to: to, subject: "Your email was not delivered" },
      async (format) => {
        await (format as unknown as { html(b: () => unknown): Promise<void> }).html(() =>
          this.render({ plain: "Sorry!" }),
        );
      },
    );
  }
}
constSet(TopLevel, "BounceMailer", BounceMailer);
