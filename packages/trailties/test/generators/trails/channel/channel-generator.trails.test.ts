import { describe, expect, it } from "vitest";
import { Dir, File } from "@blazetrails/ruby-compat";
import { ChannelGenerator } from "../../../../lib/generators/trails/channel/channel-generator.js";
import { Generators } from "../../../../lib/generators.js";

describe("Trails::Generators::ChannelGenerator", () => {
  it("reads actions as method names, not generated attributes", async () => {
    const root = Dir.mktmpdir();
    File.write(File.join(root, "tsconfig.json"), "{}");
    await ChannelGenerator.start(["chat", "speak:loud"], { destinationRoot: root });
    expect(File.read(File.join(root, "app/channels/chat-channel.ts"))).toContain("speak:loud");
  });

  it("wraps the channel in an isolated engine's namespace", async () => {
    const root = Dir.mktmpdir();
    File.write(File.join(root, "tsconfig.json"), "{}");
    const was = Generators.namespace;
    Generators.namespace = { name: "TestApp" };
    try {
      await ChannelGenerator.start(["chat"], { destinationRoot: root });
    } finally {
      Generators.namespace = was;
    }
    const content = File.read(File.join(root, "app/channels/test_app/chat-channel.ts"));
    expect(content).toContain('from "../application-cable/channel.ts"');
    expect(content).toMatch(/^export namespace TestApp \{\n {2}export class ChatChannel extends/m);
    expect(content).toMatch(/\n {4}subscribed\(\): void \{/);
    expect(content.trimEnd().endsWith("}\n}")).toBe(true);
  });
});
