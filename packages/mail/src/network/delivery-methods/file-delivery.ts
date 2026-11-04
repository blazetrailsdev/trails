import { File, FileUtils } from "@blazetrails/ruby-compat";
import { SmtpEnvelope } from "../../smtp-envelope.js";
import type { Message } from "../../message.js";

export class FileDelivery {
  settings: Record<string, unknown>;

  constructor(values: Record<string, unknown>) {
    this.settings = Object.assign({ location: "./mails", extension: "" }, values);
  }

  async deliverBang(mail: Message): Promise<void> {
    const envelope = new SmtpEnvelope(mail);

    await FileUtils.mkdirPAsync(this.settings.location as string);

    for (const to of [...new Set(envelope.to)]) {
      const path = File.join(
        this.settings.location as string,
        File.basename(to.toString() + (this.settings.extension as string)),
      );

      await File.openAsync(path, "a", async (f) => {
        await f.writeAsync(envelope.message);
        await f.writeAsync("\r\n\r\n");
      });
    }
  }
}
