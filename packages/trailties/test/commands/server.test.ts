import { describe, it, expect, vi } from "vitest";
import { DevServer } from "../../lib/server/dev-server.js";
import { getEnv } from "@blazetrails/activesupport";
import { setEnv } from "@blazetrails/ruby-compat/process-adapter";
import { Server, ServerCommand } from "../../lib/commands/server.js";

describe("ServerCommand", () => {
  it("creates a dev server with defaults", () => {
    const server = new DevServer({ port: 3000, host: "127.0.0.1", cwd: "." });
    expect(server).toBeDefined();
  });

  it("starts and stops", async () => {
    const server = new DevServer({ port: 0, host: "127.0.0.1", cwd: "." });
    await server.start();
    await server.stop();
  });
});

describe("Trails::Command::ServerTest", () => {
  const parseArguments = (args: string[] = []) => new ServerCommand([], args).serverOptions();

  function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
    const saved = Object.keys(env).map((key) => [key, getEnv(key)] as const);
    for (const [key, value] of Object.entries(env)) setEnv(key, value);
    try {
      return fn();
    } finally {
      for (const [key, value] of saved) setEnv(key, value);
    }
  }

  const suggestion = (server: string): string =>
    (
      new ServerCommand([], []) as unknown as { rackServerSuggestion(s: string): string }
    ).rackServerSuggestion(server);

  const noEnv = { TRAILS_ENV: undefined, NODE_ENV: undefined };

  it("environment with server option", () => {
    const options = parseArguments(["-u", "thin", "-e", "production"]);
    expect(options.environment).toBe("production");
    expect(options.server).toBe("thin");
  });

  it("environment without server option", () => {
    const options = parseArguments(["-e", "production"]);
    expect(options.environment).toBe("production");
    expect(options.server).toBeNull();
  });

  it("environment option is properly expanded", () => {
    expect(parseArguments(["-e", "prod"]).environment).toBe("production");
  });

  it("explicit using option", () => {
    expect(parseArguments(["-u", "thin"]).server).toBe("thin");
  });

  it("gem not suggested when name not same as handler", () => {
    for (const server of ["fastcgi", "lsws"]) {
      const output = suggestion(server);
      expect(output).toMatch(new RegExp(`Could not find server '${server}'.`));
      expect(output).not.toMatch("Gemfile");
    }
  });

  it("daemon with option", () => {
    expect(parseArguments(["-d"]).daemonize).toBe(true);
  });

  it("daemon without option", () => {
    expect(parseArguments([]).daemonize).toBe(false);
  });

  it("server option without environment", () => {
    withEnv(noEnv, () => {
      const options = parseArguments(["-u", "thin"]);
      expect(options.environment).toBe("development");
      expect(options.server).toBe("thin");
    });
  });

  it("environment with trails env", () => {
    withEnv({ NODE_ENV: undefined, TRAILS_ENV: "production" }, () =>
      expect(parseArguments().environment).toBe("production"),
    );
  });

  it("environment with rack env", () => {
    withEnv({ TRAILS_ENV: undefined, NODE_ENV: "production" }, () =>
      expect(parseArguments().environment).toBe("production"),
    );
  });

  it("environment with port", () => {
    withEnv({ PORT: "1234" }, () => expect(parseArguments().Port).toBe(1234));
  });

  it("environment with binding", () => {
    withEnv({ BINDING: "1.2.3.4" }, () => expect(parseArguments().Host).toBe("1.2.3.4"));
  });

  it("environment with pidfile", () => {
    withEnv({ PIDFILE: "/tmp/rails.pid" }, () =>
      expect(parseArguments().pid).toBe("/tmp/rails.pid"),
    );
  });

  it("caching without option", () => {
    expect(parseArguments([]).caching ?? null).toBeNull();
  });

  it("caching with option", () => {
    expect(parseArguments(["--dev-caching"]).caching).toBe(true);
    expect(parseArguments(["--no-dev-caching"]).caching).toBe(false);
  });

  it("early hints with option", () => {
    expect(parseArguments(["--early-hints"]).earlyHints).toBe(true);
  });

  it("early hints is nil by default", () => {
    expect(parseArguments([]).earlyHints ?? null).toBeNull();
  });

  it("log stdout", () => {
    withEnv(noEnv, () => {
      expect(parseArguments([]).logStdout).toBe(true);
      expect(parseArguments(["-e", "development"]).logStdout).toBe(true);
      expect(parseArguments(["-e", "development", "-d"]).logStdout).toBe(false);
      expect(parseArguments(["-e", "production"]).logStdout).toBe(false);
      expect(parseArguments(["-e", "development", "--no-log-to-stdout"]).logStdout).toBe(false);
      expect(parseArguments(["-e", "production", "--log-to-stdout"]).logStdout).toBe(true);
      withEnv({ NODE_ENV: "development" }, () => expect(parseArguments([]).logStdout).toBe(true));
      withEnv({ NODE_ENV: "production" }, () => expect(parseArguments([]).logStdout).toBe(false));
      withEnv({ TRAILS_ENV: "development" }, () => expect(parseArguments([]).logStdout).toBe(true));
      withEnv({ TRAILS_ENV: "production" }, () => expect(parseArguments([]).logStdout).toBe(false));
    });
  });

  it("host", () => {
    withEnv({ TRAILS_ENV: "development" }, () => {
      expect(parseArguments([]).Host).toBe("localhost");
      expect(parseArguments(["-b", "127.0.0.1"]).Host).toBe("127.0.0.1");
    });
    withEnv({ TRAILS_ENV: "production" }, () => {
      expect(parseArguments([]).Host).toBe("0.0.0.0");
    });
  });

  it("argument precedence over environment variable", () => {
    withEnv({ PORT: "1234" }, () => {
      expect(parseArguments(["-p", "5678"]).Port).toBe(5678);
      expect(parseArguments(["-p", "3000"]).Port).toBe(3000);
    });
    withEnv({ BINDING: "1.2.3.4" }, () => {
      expect(parseArguments(["-b", "127.0.0.1"]).Host).toBe("127.0.0.1");
    });
    withEnv({ PIDFILE: "/tmp/rails.pid" }, () => {
      expect(parseArguments(["-P", "/somewhere/else.pid"]).pid).toBe("/somewhere/else.pid");
    });
  });

  it("records user supplied options", () => {
    expect(parseArguments(["-p", "3001"]).userSuppliedOptions).toEqual(["Port"]);
    expect(parseArguments(["--port", "3001"]).userSuppliedOptions).toEqual(["Port"]);
    expect(parseArguments(["-p3001", "-C", "--binding", "127.0.0.1"]).userSuppliedOptions).toEqual([
      "Port",
      "Host",
      "caching",
    ]);
    expect(parseArguments(["--port=3001"]).userSuppliedOptions).toEqual(["Port"]);
    withEnv({ BINDING: "1.2.3.4" }, () =>
      expect(parseArguments().userSuppliedOptions).toEqual(["Host"]),
    );
    withEnv({ PORT: "3001" }, () => expect(parseArguments().userSuppliedOptions).toEqual(["Port"]));
    withEnv({ PIDFILE: "/tmp/server.pid" }, () =>
      expect(parseArguments().userSuppliedOptions).toEqual(["pid"]),
    );
  });

  it("restart command contains customized options", () => {
    const args = "-p 4567 -b 127.0.0.1 -c dummy_config.ru -d -e test -P tmp/server.pid -C".split(
      " ",
    );
    expect(parseArguments(args).restartCmd).toBe(
      "bin/trails server -p 4567 -b 127.0.0.1 -c dummy_config.ru -d -e test -P tmp/server.pid -C --restart",
    );
  });

  it("default options", async () => {
    const server = await Server.new();
    const oldDefaultOptions = server.defaultOptions();
    expect(server.defaultOptions()).toEqual(oldDefaultOptions);
  });

  it("served url", async () => {
    const server = await Server.new(parseArguments(["-b", "127.0.0.1", "-p", "4567"]));
    expect(await server.servedUrl()).toBe("http://127.0.0.1:4567");
  });

  it("served url when server prints it", async () => {
    const server = await Server.new(
      parseArguments(["-u", "puma", "-b", "127.0.0.1", "-p", "4567"]),
    );
    vi.spyOn(server, "server").mockResolvedValue({ name: "Rack::Handler::Puma" } as never);
    expect(await server.servedUrl()).toBeUndefined();
  });

  it("using server mistype", () => {
    const output = suggestion("tin");
    expect(output).toMatch("Could not find server 'tin'");
    expect(output).toMatch("Did you mean?  thin");
  });

  it("using server mistype without suggestion", () => {
    const output = suggestion("t");
    expect(output).toMatch("Could not find server 't'");
    expect(output).not.toMatch("Did you mean");
  });

  it("using known server that isnt in the gemfile", () => {
    expect(suggestion("unicorn")).toMatch(
      /Could not load server "unicorn". Maybe you need to the add it to the Gemfile/,
    );
  });
});
