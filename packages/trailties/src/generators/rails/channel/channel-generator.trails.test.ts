import { describe, expect, it } from "vitest";
import { Dir, File } from "@blazetrails/ruby-compat";
import { ChannelGenerator } from "./channel-generator.js";

describe("Rails::Generators::ChannelGenerator", () => {
  it("reads actions as method names, not generated attributes", async () => {
    const root = Dir.mktmpdir();
    File.write(File.join(root, "tsconfig.json"), "{}");
    await ChannelGenerator.start(["chat", "speak:loud"], { destinationRoot: root });
    expect(File.read(File.join(root, "app/channels/chat-channel.ts"))).toContain("speak:loud");
  });
});
