import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "@blazetrails/activesupport";
import { NamedBase } from "@blazetrails/trailties/generators";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class MailboxGenerator extends NamedBase {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.checkClassCollision({ suffix: "Mailbox" });
    this.methodAdded("createMailboxFile");
    this.hookFor("testFramework");
  }

  async createMailboxFile(): Promise<void> {
    await this.template(
      "mailbox.ts",
      File.join(
        "app/mailboxes",
        ...this.classPath(),
        `${dasherize(this.fileName)}-mailbox${this.ext()}`,
      ),
    );

    await this.inRoot(async () => {
      if (this.behavior === "invoke" && !File.isExist(this.applicationMailboxFileName())) {
        await this.template("application_mailbox.ts", this.applicationMailboxFileName());
      }
    });
  }

  /** @internal */
  private __fileName?: string;

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_mailbox$/i, ""));
  }

  /** @internal */
  private applicationMailboxFileName(): string {
    return `app/mailboxes/application-mailbox${this.ext()}`;
  }
}

Object.defineProperty(MailboxGenerator, "name", { value: "Trails::Generators::MailboxGenerator" });
