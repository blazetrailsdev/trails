import { File, constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Message } from "../models/message.js";
import { ApplicationJob } from "./application-job.js";

export class BroadcastJob extends ApplicationJob {
  async perform(file: string, message: Message): Promise<void> {
    await message.richTextContent;
    await File.writeAsync(
      file,
      `<turbo-stream action="replace" target="message_${message.id}">
  <template>${await (message as Message & { content: { toString(): Promise<string> } }).content.toString()}</template>
</turbo-stream>
`,
    );
  }
}
constSet(TopLevel, "BroadcastJob", BroadcastJob);
