import type { ChannelGenerator } from "./channel-generator.js";

type Template = (this: ChannelGenerator) => string;

const channelTest: Template = function () {
  const className = this.className().split("::").join("");
  const root = "../".repeat(this.classPathParts.length + 1);
  return `import "${root}test-helper.js";
import * as ActionCable from "@blazetrails/actioncable";

export class ${className}ChannelTest extends ActionCable.Channel.TestCase {
  // test("subscribes", async () => {
  //   await this.subscribe();
  //   assert(this.subscription.isConfirmed());
  // });
}
`;
};

export const TEMPLATES: Record<"channel_test", Template> = {
  channel_test: channelTest,
};
