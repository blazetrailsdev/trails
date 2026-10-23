import { describe, expect, it } from "vitest";
import { Dir, File } from "@blazetrails/ruby-compat";
import { ChannelGenerator } from "./channel-generator.js";

async function generate(name: string): Promise<string> {
  const root = Dir.mktmpdir();
  File.write(File.join(root, "tsconfig.json"), "{}");
  await ChannelGenerator.start([name], { cwd: root, output: () => {} });
  return root;
}

describe("TestUnit::Generators::ChannelGenerator", () => {
  it("strips a trailing _channel once, case-insensitively", async () => {
    for (const name of ["chat", "chat_channel", "Chat_Channel"]) {
      const root = await generate(name);
      const path = File.join(root, "test/channels/chat-channel.test.ts");
      expect(File.isExist(path)).toBe(true);
      expect(File.read(path)).toContain(
        "export class ChatChannelTest extends ActionCable.Channel.TestCase {",
      );
    }
  });

  it("nests a namespaced name under its class path", async () => {
    const root = await generate("admin/chat");
    const path = File.join(root, "test/channels/admin/chat-channel.test.ts");
    expect(File.read(path)).toContain('import "../../test-helper.js";');
    expect(File.read(path)).toContain("export class AdminChatChannelTest");
  });
});
