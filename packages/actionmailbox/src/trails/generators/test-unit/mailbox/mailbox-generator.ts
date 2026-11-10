import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "@blazetrails/activesupport";
import { NamedBase } from "@blazetrails/trailties/generators";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class MailboxGenerator extends NamedBase {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.checkClassCollision({ suffix: "MailboxTest" });
    this.methodAdded("createTestFiles");
  }

  async createTestFiles(): Promise<void> {
    await this.template(
      "mailbox_test.ts",
      File.join(
        "test/mailboxes",
        ...this.classPath(),
        `${dasherize(this.fileName)}-mailbox.test${this.ext()}`,
      ),
    );
  }

  /** @internal */
  private __fileName?: string;

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_mailbox$/i, ""));
  }
}

Object.defineProperty(MailboxGenerator, "name", {
  value: "TestUnit::Generators::MailboxGenerator",
});
