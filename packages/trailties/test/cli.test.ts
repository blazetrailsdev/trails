import { afterAll, beforeAll, describe, it, expect, onTestFinished, vi } from "vitest";
import { Dir, File, SystemExit, getFs, stdout } from "@blazetrails/ruby-compat";
import { buildTemplates } from "@blazetrails/trails-tsc";
import { GemHelpCommand } from "../lib/commands/gem-help.js";
import { HELP_MAPPINGS, invoke } from "../lib/command.js";

async function trails(...argv: string[]): Promise<string> {
  let output = "";
  const write = vi.spyOn(stdout, "write").mockImplementation((s: unknown) => {
    output += String(s);
    return true;
  });
  onTestFinished(() => write.mockRestore());
  try {
    const first = argv[0];
    if (first == null || first === "help" || HELP_MAPPINGS.has(first)) {
      await invoke("gem_help", argv.slice(1));
    } else if (first === "plugin") {
      await invoke("plugin", argv.slice(1));
    } else {
      await invoke("application", argv);
    }
  } catch (e) {
    if (!(e instanceof SystemExit)) throw e;
  }
  return output;
}

describe("CLI", () => {
  const dir = Dir.mktmpdir();

  beforeAll(async () => {
    const usage = File.join(dir, "USAGE");
    const source = await GemHelpCommand.usagePath();
    await getFs().writeFile!(usage, await getFs().readFile(source!, "utf8"));
    await buildTemplates([usage]);
    vi.spyOn(GemHelpCommand, "usagePath").mockResolvedValue(usage);
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
