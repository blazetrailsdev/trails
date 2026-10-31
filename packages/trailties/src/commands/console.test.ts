import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { Trails } from "../rails.js";
import { Console, ConsoleCommand } from "./console.js";
import { IRBConsole } from "./console/irb-console.js";

class FakeConsole {
  static _started = false;
  static isStarted(): boolean {
    return this._started;
  }
  static start(): void {
    this._started = true;
  }
}

function buildApp(console: typeof FakeConsole | null) {
  return {
    sandbox: undefined as boolean | null | undefined,
    config: { console },
    name: () => "app",
    loadConsole() {},
  };
}

function parseArguments(args: string[]) {
  return new ConsoleCommand([], args).options;
}

describe("Rails::ConsoleTest", () => {
  const prevEnv = Trails.env;
  let app: ReturnType<typeof buildApp>;
  let output: string;
  const saved = { TRAILS_ENV: env.TRAILS_ENV, NODE_ENV: env.NODE_ENV };

  beforeEach(() => {
    FakeConsole._started = false;
    app = buildApp(FakeConsole);
    output = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Trails.env = prevEnv;
    for (const [k, v] of Object.entries(saved)) {
      setEnv(k, v);
    }
  });

  async function start(argv: string[] = []) {
    const railsConsole = new Console(app, parseArguments(argv));
    output = await capture(":stdout", () => railsConsole.start());
  }

  async function withEnv(
    name: "TRAILS_ENV" | "NODE_ENV",
    value: string | undefined,
    block: () => Promise<void>,
  ) {
    setEnv("TRAILS_ENV", undefined);
    setEnv("NODE_ENV", undefined);
    if (value !== undefined) setEnv(name, value);
    await block();
  }

  it("sandbox option", () => {
    expect(new Console(app, parseArguments(["--sandbox"])).isSandbox()).toBeTruthy();
  });

  it("short version of sandbox option", () => {
    expect(new Console(app, parseArguments(["-s"])).isSandbox()).toBeTruthy();
  });

  it("no options", () => {
    expect(new Console(app, parseArguments([])).isSandbox()).toBeFalsy();
  });

  it("start", async () => {
    await start();
    expect(app.config.console!.isStarted()).toBeTruthy();
    expect(output).toMatch(/Loading \w+ environment \(Trails/);
  });

  it("start with sandbox", async () => {
    await start(["--sandbox"]);
    expect(app.config.console!.isStarted()).toBeTruthy();
    expect(app.sandbox).toBeTruthy();
    expect(output).toMatch(/Loading \w+ environment in sandbox \(Trails/);
  });

  it("console with environment", async () => {
    await start(["-e", "production"]);
    expect(output).toMatch(/\sproduction\s/);
  });

  it("console defaults to IRB", () => {
    expect((new Console(buildApp(null)).console as IRBConsole).name()).toBe("IRB");
  });

  it("prompt env colorization", () => {
    const irbConsole = new Console(buildApp(null)).console as IRBConsole;
    const red = "\u001b[31m";
    const blue = "\u001b[34m";
    const clear = "\u001b[0m";

    Trails.env = "development";
    expect(irbConsole.colorizedEnv()).toBe(`${blue}dev${clear}`);

    Trails.env = "test";
    expect(irbConsole.colorizedEnv()).toBe(`${blue}test${clear}`);

    Trails.env = "production";
    expect(irbConsole.colorizedEnv()).toBe(`${red}prod${clear}`);

    Trails.env = "custom_env";
    expect(irbConsole.colorizedEnv()).toBe("custom_env");
  });

  it("default environment with no rails env", async () => {
    await withEnv("TRAILS_ENV", undefined, async () => {
      await start();
      expect(output).toMatch(/\sdevelopment\s/);
    });
  });

  it("default environment with rails env", async () => {
    await withEnv("TRAILS_ENV", "special-production", async () => {
      await start();
      expect(output).toMatch(/\sspecial-production\s/);
    });
  });

  it("default environment with rack env", async () => {
    await withEnv("NODE_ENV", "production", async () => {
      await start();
      expect(output).toMatch(/\sproduction\s/);
    });
  });

  it("e option", async () => {
    await start(["-e", "special-production"]);
    expect(output).toMatch(/\sspecial-production\s/);
  });

  it("e option is properly expanded", async () => {
    await start(["-e", "prod"]);
    expect(output).toMatch(/\sproduction\s/);
  });

  it("environment option", async () => {
    await start(["--environment=special-production"]);
    expect(output).toMatch(/\sspecial-production\s/);
  });

  it("rails env is dev when environment option is dev and dev env is present", () => {
    vi.spyOn(
      ConsoleCommand.prototype as unknown as { availableEnvironments(): string[] },
      "availableEnvironments",
    ).mockReturnValue(["dev"]);
    expect(parseArguments(["-e", "dev"]).environment).toMatch("dev");
  });
});
