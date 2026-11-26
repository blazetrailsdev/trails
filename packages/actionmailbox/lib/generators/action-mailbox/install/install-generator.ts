import "../../../constants.action-mailbox-install-install-generator.generated.js";
import { Base } from "@blazetrails/trailties/generators";
import { MailboxGenerator } from "../../../trails/generators/mailbox/mailbox-generator.js";

export class InstallGenerator extends Base {
  static {
    this.sourceRoot(MailboxGenerator._sourceRoot);
    this.methodAdded("createActionMailboxFiles");
    this.methodAdded("addActionMailboxProductionEnvironmentConfig");
    this.methodAdded("createMigrations");
  }

  /** @missingRailsArgs say — PERMANENT */
  async createActionMailboxFiles(): Promise<void> {
    this.say("Copying application-mailbox.ts to app/mailboxes", "green");
    await this.template("application_mailbox.ts", "app/mailboxes/application-mailbox.ts");
  }

  /** @missingRailsArgs environment — PERMANENT */
  async addActionMailboxProductionEnvironmentConfig(): Promise<void> {
    await this.environment(
      `// Prepare the ingress controller used to receive mail
// this.config.actionMailbox.ingress = "relay"

`,
      { env: "production" },
    );
  }

  async createMigrations(): Promise<void> {
    await this.trailsCommand("railties:install:migrations FROM=active_storage,action_mailbox", {
      inline: true,
    });
  }
}
