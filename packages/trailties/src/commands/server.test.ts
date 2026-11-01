import { describe, it, expect } from "vitest";
import { DevServer } from "../server/dev-server.js";
import { getEnv } from "@blazetrails/activesupport";
import { setEnv } from "@blazetrails/ruby-compat";
import { Server, ServerCommand } from "./server.js";

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

describe("Rails::Command::ServerTest", () => {
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

  const noEnv = { TRAILS_ENV: undefined, NODE_ENV: undefined };

  it("test_environment_with_server_option", () => {
    const options = parseArguments(["-u", "thin", "-e", "production"]);
    expect(options.environment).toBe("production");
    expect(options.server).toBe("thin");
  });

  it("test_environment_without_server_option", () => {
    const options = parseArguments(["-e", "production"]);
    expect(options.environment).toBe("production");
    expect(options.server).toBeNull();
  });

  it("test_environment_option_is_properly_expanded", () => {
    expect(parseArguments(["-e", "prod"]).environment).toBe("production");
  });

  it("test_explicit_using_option", () => {
    expect(parseArguments(["-u", "thin"]).server).toBe("thin");
  });

  it("test_daemon_with_option", () => {
    expect(parseArguments(["-d"]).daemonize).toBe(true);
  });

  it("test_daemon_without_option", () => {
    expect(parseArguments([]).daemonize).toBe(false);
  });

  it("test_server_option_without_environment", () => {
    withEnv(noEnv, () => {
      const options = parseArguments(["-u", "thin"]);
      expect(options.environment).toBe("development");
      expect(options.server).toBe("thin");
    });
  });

  it("test_environment_with_rails_env", () => {
    withEnv({ NODE_ENV: undefined, TRAILS_ENV: "production" }, () =>
      expect(parseArguments().environment).toBe("production"),
    );
  });

  it("test_environment_with_rack_env", () => {
    withEnv({ TRAILS_ENV: undefined, NODE_ENV: "production" }, () =>
      expect(parseArguments().environment).toBe("production"),
    );
  });

  it("test_environment_with_port", () => {
    withEnv({ PORT: "1234" }, () => expect(parseArguments().Port).toBe(1234));
  });

  it("test_environment_with_binding", () => {
    withEnv({ BINDING: "1.2.3.4" }, () => expect(parseArguments().Host).toBe("1.2.3.4"));
  });

  it("test_environment_with_pidfile", () => {
    withEnv({ PIDFILE: "/tmp/rails.pid" }, () =>
      expect(parseArguments().pid).toBe("/tmp/rails.pid"),
    );
  });

  it("test_caching_without_option", () => {
    expect(parseArguments([]).caching ?? null).toBeNull();
  });

  it("test_caching_with_option", () => {
    expect(parseArguments(["--dev-caching"]).caching).toBe(true);
    expect(parseArguments(["--no-dev-caching"]).caching).toBe(false);
  });

  it("test_early_hints_with_option", () => {
    expect(parseArguments(["--early-hints"]).earlyHints).toBe(true);
  });

  it("test_early_hints_is_nil_by_default", () => {
    expect(parseArguments([]).earlyHints ?? null).toBeNull();
  });

  it("test_log_stdout", () => {
    withEnv(noEnv, () => {
      expect(parseArguments([]).logStdout).toBe(true);
      expect(parseArguments(["-e", "development"]).logStdout).toBe(true);
      expect(parseArguments(["-e", "development", "-d"]).logStdout).toBe(false);
      expect(parseArguments(["-e", "production"]).logStdout).toBe(false);
      expect(parseArguments(["-e", "development", "--no-log-to-stdout"]).logStdout).toBe(false);
      expect(parseArguments(["-e", "production", "--log-to-stdout"]).logStdout).toBe(true);
    });
  });

  it("test_host", () => {
    withEnv({ TRAILS_ENV: "development" }, () => {
      expect(parseArguments([]).Host).toBe("localhost");
      expect(parseArguments(["-b", "127.0.0.1"]).Host).toBe("127.0.0.1");
    });
    withEnv({ TRAILS_ENV: "production" }, () => {
      expect(parseArguments([]).Host).toBe("0.0.0.0");
    });
  });

  it("test_argument_precedence_over_environment_variable", () => {
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

  it("test_records_user_supplied_options", () => {
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

  it("test_restart_command_contains_customized_options", () => {
    const args = "-p 4567 -b 127.0.0.1 -c dummy_config.ru -d -e test -P tmp/server.pid -C".split(
      " ",
    );
    expect(parseArguments(args).restartCmd).toBe(
      "bin/rails server -p 4567 -b 127.0.0.1 -c dummy_config.ru -d -e test -P tmp/server.pid -C --restart",
    );
  });

  it("test_default_options", () => {
    const server = new Server();
    const oldDefaultOptions = server.defaultOptions();
    expect(server.defaultOptions()).toEqual(oldDefaultOptions);
  });

  it("test_served_url", () => {
    const server = new Server(parseArguments(["-b", "127.0.0.1", "-p", "4567"]));
    expect(server.servedUrl()).toBe("http://127.0.0.1:4567");
  });

  it("test_served_url_when_server_prints_it", () => {
    const server = new Server(parseArguments(["-u", "puma", "-b", "127.0.0.1", "-p", "4567"]));
    expect(server.servedUrl()).toBeUndefined();
  });

  const suggestion = (server: string): string =>
    (
      new ServerCommand([], []) as unknown as { rackServerSuggestion(s: string): string }
    ).rackServerSuggestion(server);

  it("test_using_server_mistype", () => {
    const output = suggestion("tin");
    expect(output).toContain("Could not find server 'tin'");
    expect(output).toContain("Did you mean?  thin");
  });

  it("test_using_server_mistype_without_suggestion", () => {
    const output = suggestion("t");
    expect(output).toContain("Could not find server 't'");
    expect(output).not.toContain("Did you mean");
  });

  it("test_using_known_server_that_isnt_in_the_gemfile", () => {
    expect(suggestion("unicorn")).toMatch(
      /Could not load server "unicorn". Maybe you need to the add it to the Gemfile/,
    );
  });
});
