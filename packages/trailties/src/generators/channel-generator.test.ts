import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Application } from "../application.js";
import { Trails } from "../rails.js";
import "../test-unit/trailtie.js";
import { TestCase } from "./test-case.js";

class ChannelGeneratorApp extends Application {}
let ChannelGenerator: typeof import("./rails/channel/channel-generator.js").ChannelGenerator;
class ChannelGeneratorTest extends TestCase {}
ChannelGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^ChannelGeneratorTest$/, ChannelGeneratorTest);
let testCase: TestCase;

beforeAll(async () => {
  await ChannelGeneratorApp.instance().loadGenerators();
  ({ ChannelGenerator } = await import("./rails/channel/channel-generator.js"));
  ChannelGeneratorTest.tests(ChannelGenerator);
});

beforeEach(async (context) => {
  testCase = context.testCase as TestCase;
  testCase.prepareDestination();
  Trails.application = ChannelGeneratorApp.instance();
  File.write(path("tsconfig.json"), "{}");
  useWithJavascript();
  useUnderImportmap();
});

afterEach(() => {
  Trails.application = null;
  vi.restoreAllMocks();
});

async function runGenerator(
  args: string[],
  config: { behavior?: "invoke" | "revoke" } = {},
): Promise<void> {
  await testCase.runGenerator(args, config);
}

function stubInstallJavascriptDependencies(): void {
  vi.spyOn(
    ChannelGenerator.prototype as unknown as { installJavascriptDependencies(): Promise<void> },
    "installJavascriptDependencies",
  ).mockResolvedValue(undefined);
}

function path(relative: string): string {
  return File.join(testCase.destinationRoot, relative);
}

function assertFile(relative: string): string {
  expect(File.isExist(path(relative))).toBe(true);
  return File.read(path(relative));
}

function assertNoFile(relative: string): void {
  testCase.assertNoFile(relative);
}

function useWithJavascript(): void {
  FileUtils.mkdirP(path("app/javascript"));
  FileUtils.touch(path("app/javascript/application.js"));
}

function useUnderImportmap(): void {
  FileUtils.mkdirP(path("config"));
  FileUtils.touch(path("config/importmap.rb"));
  FileUtils.rmRf(path("package.json"));
}

function useUnderNode(): void {
  FileUtils.touch(path("package.json"));
  FileUtils.rmRf(path("config/importmap.rb"));
}

describe("ChannelGeneratorTest", () => {
  it("shared channel files are created", async () => {
    await runGenerator(["books"]);

    expect(assertFile("app/channels/application-cable/channel.ts")).toMatch(
      /export class Channel extends ActionCable\.Channel\.Base \{\n/,
    );
    expect(assertFile("app/channels/application-cable/connection.ts")).toMatch(
      /export class Connection extends ActionCable\.Connection\.Base \{\n/,
    );
  });

  it("specific channel files are created under importmap", async () => {
    await runGenerator(["chat"]);

    expect(assertFile("app/channels/chat-channel.ts")).toMatch(
      /class ChatChannel extends ApplicationCable\.Channel/,
    );
    expect(assertFile("app/javascript/channels/chat-channel.js")).toMatch(
      /import consumer from "channels\/consumer"\s+consumer\.subscriptions\.create\("ChatChannel/,
    );
  });

  it("specific channel files are created under node", async () => {
    useUnderNode();
    stubInstallJavascriptDependencies();
    await runGenerator(["chat"]);

    expect(assertFile("app/javascript/channels/chat-channel.js")).toMatch(
      /import consumer from ".\/consumer"\s+consumer\.subscriptions\.create\("ChatChannel/,
    );
  });

  it("channel with multiple actions is created", async () => {
    await runGenerator(["chat", "speak", "mute"]);

    const channel = assertFile("app/channels/chat-channel.ts");
    expect(channel).toMatch(/class ChatChannel extends ApplicationCable\.Channel/);
    expect(channel).toMatch(/speak\(\)/);
    expect(channel).toMatch(/mute\(\)/);

    const js = assertFile("app/javascript/channels/chat-channel.js");
    expect(js).toMatch(
      /import consumer from "channels\/consumer"\s+consumer\.subscriptions\.create\("ChatChannel/,
    );
    expect(js).toMatch(/,\n\n {2}speak/);
    expect(js).toMatch(
      /,\n\n {2}mute: function\(\) \{\n {4}return this\.perform\('mute'\);\n {2}\}\n\}\);/,
    );
  });

  it("shared channel javascript files are created", async () => {
    await runGenerator(["books"]);

    assertFile("app/javascript/channels/index.js");
    assertFile("app/javascript/channels/consumer.js");
  });

  it("import channels in javascript entrypoint", async () => {
    await runGenerator(["books"]);

    expect(assertFile("app/javascript/application.js")).toMatch(/import "channels"/);
  });

  it("import channels in javascript entrypoint under node", async () => {
    useUnderNode();
    stubInstallJavascriptDependencies();
    await runGenerator(["chat"]);

    expect(assertFile("app/javascript/application.js")).toMatch(/import "\.\/channels"/);
  });

  it("pin javascript dependencies", async () => {
    await runGenerator(["chat"]);

    const content = assertFile("config/importmap.rb");
    expect(content).toMatch(/pin "@rails\/actioncable"/);
    expect(content).toMatch(/pin_all_from "app\/javascript\/channels"/);
  });

  it("first setup only happens once", async () => {
    await runGenerator(["chat"]);
    assertFile("app/javascript/channels/consumer.js");

    FileUtils.rm(path("app/javascript/channels/consumer.js"));
    await runGenerator(["another"]);
    assertNoFile("app/javascript/channels/consumer.js");
  });

  it("javascripts not generated when assets are skipped", async () => {
    await runGenerator(["chat", "--skip-assets"]);

    expect(assertFile("app/channels/chat-channel.ts")).toMatch(
      /class ChatChannel extends ApplicationCable\.Channel/,
    );
    assertNoFile("app/javascript/channels/chat-channel.js");
  });

  it("invokes default test framework", async () => {
    await runGenerator(["chat", "-t=test_unit"]);

    const test = assertFile("test/channels/chat-channel.test.ts");
    expect(test).toMatch(/class ChatChannelTest extends ActionCable\.Channel\.TestCase/);
    expect(test).toMatch(/\/\/ test\("subscribes"/);
    expect(test).toMatch(/\/\/ {3}assert\(this\.subscription\.isConfirmed\(\)\);/);
  });

  it("revoking", async () => {
    await runGenerator(["chat"]);
    await runGenerator(["chat"], { behavior: "revoke" });

    assertNoFile("app/channels/chat-channel.ts");
    assertNoFile("app/javascript/channels/chat-channel.js");
    assertNoFile("test/channels/chat-channel.test.ts");

    assertFile("app/channels/application-cable/channel.ts");
    assertFile("app/channels/application-cable/connection.ts");
    assertFile("app/javascript/channels/consumer.js");
  });

  it("channel suffix is not duplicated", async () => {
    await runGenerator(["chat_channel"]);

    assertNoFile("app/channels/chat-channel-channel.ts");
    assertFile("app/channels/chat-channel.ts");

    assertNoFile("app/javascript/channels/chat-channel-channel.js");
    assertFile("app/javascript/channels/chat-channel.js");

    assertNoFile("test/channels/chat-channel-channel.test.ts");
    assertFile("test/channels/chat-channel.test.ts");
  });
});
