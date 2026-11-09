import { afterAll, beforeAll, describe, it, expect, onTestFinished, vi } from "vitest";
import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { buildTemplates } from "@blazetrails/trails-tsc";
import { GemHelpCommand } from "../lib/commands/gem-help.js";

vi.mock("@blazetrails/activesupport/node", () => ({}));

const dir = Dir.mktmpdir();

async function trails(...argv: string[]): Promise<string> {
  vi.resetModules();
  const rb = await import("@blazetrails/ruby-compat");
  const { GemHelpCommand } = await import("../lib/commands/gem-help.js");
  vi.spyOn(GemHelpCommand, "usagePath").mockResolvedValue(File.join(dir, "USAGE"));
  let output = "";
  vi.spyOn(rb.stdout, "write").mockImplementation((s: unknown) => {
    output += String(s);
    return true;
  });
  const cwd = Dir.pwd();
  onTestFinished(() => {
    Dir.chdir(cwd);
    rb.rbAryReplace(rb.rbArgv(), []);
    rb.setExitCode(0);
  });
  Dir.chdir(dir);
  rb.rbAryReplace(rb.rbArgv(), argv);
  await import("../lib/bin.js");
  return output;
}

describe("CLI", () => {
  beforeAll(async () => {
    const usage = File.join(dir, "USAGE");
    const source = await GemHelpCommand.usagePath();
    await getFs().writeFile!(usage, await getFs().readFile(source!, "utf8"));
    await buildTemplates([usage]);
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await getFs().rm!(dir, { recursive: true, force: true });
  });

  it("prints the gem help with no command", async () => {
    const output = await trails();
    expect(output).toMatch(/^Usage:\n {2}trails COMMAND \[options\]\n/);
    expect(output).toContain("You must specify a command:");
  }, 60_000);

  it("prints the gem help for --help", async () => {
    expect(await trails("--help")).toBe(await trails());
  }, 60_000);

  it("prints the app generator help for a command's --help outside an app", async () => {
    expect(await trails("server", "--help")).toMatch(
      /^Usage:\n {2}trails new APPPATH \[options\]\n/,
    );
  }, 60_000);

  it("prints the app generator help for new with no path", async () => {
    expect(await trails("new")).toMatch(/^Usage:\n {2}trails new APPPATH \[options\]\n/);
  }, 60_000);

  it("prints the app generator help for an unknown command", async () => {
    expect(await trails("nope")).toBe(await trails("new"));
  }, 60_000);
});
