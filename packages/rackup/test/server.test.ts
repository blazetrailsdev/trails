import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommonLogger, Lint, MockRequest, ShowExceptions, TempfileReaper } from "@blazetrails/rack";
import {
  ARGV,
  Dir,
  env,
  File,
  getProcessAdapter,
  Hash,
  LOAD_PATH,
  LOADED_FEATURES,
  Process,
  rbGvGet,
  rbGvSet,
  registerProcessAdapter,
  setEnv,
  stderr,
  stdout,
  StringIO,
  SystemExit,
} from "@blazetrails/ruby-compat";
import type {} from "@blazetrails/vitest-matchers";
import { Handler } from "../lib/handler.js";
import { Server } from "../lib/server.js";

const cgi: { name: string; run: (app: unknown) => unknown; validOptions?: () => unknown } = {
  name: "Rackup::Handler::CGI",
  run: () => null,
};
const webrick = { name: "Rackup::Handler::WEBrick", run: () => null };

let pidfileCount = 0;

async function tempPidfile(content: string | null = null): Promise<string> {
  const path = File.join(
    Dir.tmpdir(),
    `pidfile-${Process.pid}-${Date.now()}-${(pidfileCount += 1)}`,
  );
  if (content != null) await File.writeAsync(path, content);
  return path;
}

async function withOutput(block: () => unknown): Promise<string> {
  let output = "";
  const writes = [stdout.write, stderr.write];
  stdout.write = stderr.write = (chunk: string) => ((output += chunk), true);
  try {
    await block();
  } catch (error) {
    if (!(error instanceof SystemExit)) throw error;
    output += "exited";
  } finally {
    [stdout.write, stderr.write] = writes;
  }
  return output;
}

async function withStderr(block: () => Promise<void>): Promise<string> {
  let output = "";
  const write = stderr.write;
  stderr.write = (chunk: string) => ((output += chunk), true);
  try {
    await block();
  } finally {
    stderr.write = write;
  }
  return output;
}

function stubStart(server: Server): void {
  Object.assign(server, { handleProfiling: async () => null, app: () => null });
}

describe("Rackup::Server", () => {
  const adapter = getProcessAdapter();
  const argv = ARGV;
  let signals: Record<string, () => void>;
  let rackupHandler: string | undefined;

  beforeEach(() => {
    signals = {};
    registerProcessAdapter(
      Object.create(adapter, {
        exit: {
          value: (code?: number) => {
            throw new SystemExit(code ?? 0);
          },
        },
        onSignal: {
          value: (name: string, handler: () => void) => {
            signals[name] = handler;
            return () => {};
          },
        },
      }),
    );
    argv.length = 0;
    rackupHandler = env["RACKUP_HANDLER"];
    setEnv("RACKUP_HANDLER", "node");
    cgi.run = () => null;
    delete cgi.validOptions;
    Handler.register("cgi", cgi);
    Handler.register("webrick", webrick);
  });
  afterEach(() => {
    setEnv("RACKUP_HANDLER", rackupHandler);
    registerProcessAdapter(adapter);
  });

  function app() {
    return async () => [200, { "content-type": "text/plain" }, ["success"]];
  }

  async function newServer(klass: new () => Server = Server): Promise<Server> {
    const server = new klass();
    await server._ready;
    return server;
  }

  it("overrides :config if :app is passed in", async () => {
    const server = new Server({ app: "FOO" });
    expect(await server.app()).toBe("FOO");
  });

  it("Options#parse parses -p and --port options into :Port", async () => {
    expect(await new Server.Options().parseBang(["-p", "1234"])).toEqual({ Port: "1234" });
    expect(await new Server.Options().parseBang(["--port", "1234"])).toEqual({ Port: "1234" });
  });

  it("Options#parse parses -D and --daemonize option into :daemonize", async () => {
    expect(await new Server.Options().parseBang(["-D"])).toEqual({ daemonize: true });
    expect(await new Server.Options().parseBang(["--daemonize"])).toEqual({ daemonize: true });
  });

  it("Options#parse parses --daemonize-noclose option into :daemonize => :noclose", async () => {
    expect(await new Server.Options().parseBang(["--daemonize-noclose"])).toEqual({
      daemonize: "noclose",
    });
    expect(await new Server.Options().parseBang(["-D", "--daemonize-noclose"])).toEqual({
      daemonize: "noclose",
    });
    expect(await new Server.Options().parseBang(["--daemonize-noclose", "-D"])).toEqual({
      daemonize: "noclose",
    });
  });

  it("Options#parse parses --profile option into :profile", async () => {
    expect(await new Server.Options().parseBang(["--profile", "foo"])).toEqual({
      profileFile: "foo",
    });
  });

  it("Options#parse parses --profile-mode option into :profile_mode", async () => {
    expect(await new Server.Options().parseBang(["--profile-mode", "cpu"])).toEqual({
      profileMode: "cpu",
    });
  });

  it("Options#parse parses argument into :config", async () => {
    expect(await new Server.Options().parseBang(["foo"])).toEqual({ config: "foo" });
  });

  it("Options#handler_opts doesn't include Host/Port options", async () => {
    const tester = {
      validOptions: () => ({ "Host: ": "anything", "Port: ": "anything" }),
      toString: () => "HPOT",
      name: "HPOT",
    };
    Handler.register("host_port_option_tester", tester);
    expect(await new Server.Options().handlerOpts({ server: "host_port_option_tester" })).toBe("");
  });

  it("logging_middleware will include common logger except for CGI", async () => {
    const c = class extends Server {
      static override middleware() {
        return new Hash<string, never>(() => [this.loggingMiddleware()] as never);
      }
    };

    argv.splice(0, argv.length, "-swebrick", "-b", "builder.run(async () => [200, {}, []]);");
    expect(await (await newServer(c))["wrappedApp"]()).toBeInstanceOf(CommonLogger);

    argv.splice(0, argv.length, "-scgi", "-b", "builder.run(async () => [200, {}, []]);");
    expect(await (await newServer(c))["wrappedApp"]()).toBeInstanceOf(Function);
  });

  it("#app aborts when config.ru file does not exist", async () => {
    argv.splice(0, argv.length, "-swebrick", "non-existant.ru");
    const server = await newServer();
    let error: unknown;
    await withStderr(async () => {
      await expect(
        server.app().catch((e: unknown) => {
          error = e;
          throw e;
        }),
      ).rejects.toThrow(SystemExit);
    });
    expect((error as Error).message).toMatch(/^configuration .* not found$/);
  });

  it("#app returns app when config.ru file exists", async () => {
    const config = File.join(Dir.tmpdir(), `line-${Process.pid}-${Date.now()}.ru`);
    await File.writeAsync(config, "builder.run(async () => [200, {}, []]);\n");
    try {
      argv.splice(0, argv.length, "-swebrick", config);
      expect(await (await newServer()).app()).toBeInstanceOf(Function);
    } finally {
      await File.deleteAsync(config);
    }
  });

  // PERMANENT-SKIP: Process.daemon forks, CLAUDE.md § "Runtime facts Node does not expose".
  it.skip("#start daemonizes if daemonize option is given", () => {});

  // PERMANENT-SKIP: stackprof has no Node counterpart, RFC 0217-rackup-gem-port § Design.
  it.skip("#profiles to temp file if :profile_mode option is given and :profile_file option is not given", () => {});

  // PERMANENT-SKIP: stackprof has no Node counterpart, RFC 0217-rackup-gem-port § Design.
  it.skip("#profiles to given file if :profile_mode and :profile_file options are given", () => {});

  it("clears arguments if ENV['REQUEST_METHOD'] is set", async () => {
    try {
      setEnv("REQUEST_METHOD", "GET");
      argv.splice(0, argv.length, "-scgi", "config.ru");
      await newServer();
      expect(argv).toBeEmpty();
    } finally {
      setEnv("REQUEST_METHOD", undefined);
    }
  });

  it("prefer to use :builder when it is passed in", async () => {
    const server = new Server({
      builder:
        "builder.run(function (env) { return [200, { 'content-type': 'text/plain' }, ['success']]; });",
    });
    expect((await new MockRequest((await server.app()) as never).get("/")).body.toString()).toEqual(
      "success",
    );
  });

  it("allow subclasses to override middleware", () => {
    const server = class extends Server {
      override middleware() {
        return new Hash<string, never[]>([]);
      }
    };
    expect(server.middleware().get("deployment")).not.toEqual([]);
    expect(new server({ app: "foo" }).middleware().get("deployment")).toEqual([]);
  });

  it("allow subclasses to override default middleware", () => {
    const server = class extends Server {
      static override defaultMiddlewareByEnvironment() {
        return new Hash<string, never[]>([]);
      }
    };
    expect(server.middleware().get("deployment")).toEqual([]);
    expect(new server({ app: "foo" }).middleware().get("deployment")).toEqual([]);
  });

  it("only provide default middleware for development and deployment environments", () => {
    expect([...Server.defaultMiddlewareByEnvironment().keys()].sort()).toEqual([
      "deployment",
      "development",
    ]);
  });

  it("always return an empty array for unknown environments", () => {
    const server = new Server({ app: "foo" });
    expect(server.middleware().get("production")).toEqual([]);
  });

  it("not include Rack::Lint in deployment environment", () => {
    const server = new Server({ app: "foo" });
    expect(server.middleware().get("deployment")!.flat()).not.toContain(Lint);
  });

  it("not include Rack::ShowExceptions in deployment environment", () => {
    const server = new Server({ app: "foo" });
    expect(server.middleware().get("deployment")!.flat()).not.toContain(ShowExceptions);
  });

  it("include Rack::TempfileReaper in deployment environment", () => {
    const server = new Server({ app: "foo" });
    expect(server.middleware().get("deployment")!.flat()).toContain(TempfileReaper);
  });

  it("be quiet if said so", async () => {
    const server = new Server({ app: "FOO", quiet: true });
    expect(await Server.loggingMiddleware()(server)).toBeNull();
  });

  it("use a full path to the pidfile", async () => {
    const opts = await (await newServer())["parseOptions"](["--pid", "testing.pid"]);
    expect(opts.pid).toBe(File.expandPath("testing.pid"));
  });

  it("get options from ARGV", async () => {
    argv.splice(
      0,
      argv.length,
      ...["--debug", "-sthin", "--env", "production", "-w", "-q", "-o", "localhost"],
      ...["-O", "NAME=VALUE", "-ONAME2", "-D"],
    );
    const server = await newServer();
    expect(server.options.debug).toBe(true);
    expect(server.options.server).toBe("thin");
    expect(server.options.environment).toBe("production");
    expect(server.options.warn).toBe(true);
    expect(server.options.quiet).toBe(true);
    expect(server.options.Host).toBe("localhost");
    expect(server.options.NAME).toBe("VALUE");
    expect(server.options.NAME2).toBe(true);
    expect(server.options.daemonize).toBe(true);
  });

  async function testOptionsServer(...args: string[]): Promise<string> {
    argv.splice(0, argv.length, ...args);
    return withOutput(() => newServer());
  }

  it("options server", async () => {
    await testOptionsServer();
  });

  it("support -h option to get help", async () => {
    expect(await testOptionsServer("-scgi", "-h")).toMatch(
      /^Usage: rackup.*Ruby options:.*Rack options.*Profiling options.*Common options.*exited$/s,
    );
  });

  it("support -h option to get handler-specific help", async () => {
    cgi.validOptions = () => ({ "FOO=BAR": "BAZ" });
    expect(await testOptionsServer("-scgi", "-h")).toMatch(
      /Server-specific options for Rackup::Handler::CGI.*-O +FOO=BAR +BAZ/s,
    );
  });

  it("support -h option to display warning for invalid handler", async () => {
    expect(await testOptionsServer("-sbanana", "-h")).toMatch(
      /^Usage: rackup.*Ruby options:.*Rack options.*Profiling options.*Common options.*Warning: Could not find handler specified \(banana\) to determine handler-specific options.*exited$/s,
    );
  });

  it("support -v option to get version", async () => {
    expect(await testOptionsServer("-v")).toMatch(/^Rack \d+\.\d+.\d+(.*?)\nexited$/);
  });

  it("warn for invalid --profile-mode option", async () => {
    expect(await testOptionsServer("--profile-mode", "foo")).toMatch(
      /^invalid option: --profile-mode unknown profile mode: foo.*Usage: rackup/s,
    );
  });

  it("warn for invalid options", async () => {
    expect(await testOptionsServer("--banana")).toMatch(
      /^invalid option: --banana.*Usage: rackup/s,
    );
  });

  it("support -b option to specify inline rackup config", async () => {
    argv.splice(
      0,
      argv.length,
      ...["-scgi", "-E", "development", "-b"],
      "builder.use(Rack.ContentLength); builder.run(async () => [200, {}, []]);",
    );
    const server = await newServer();
    cgi.run = (app) => app;
    let started: unknown;
    await withOutput(async () => (started = await server.start()));
    const [s, h, b] = await (
      started as {
        call(env: object): Promise<[number, Record<string, string>, string[]]>;
      }
    ).call({ "rack.errors": new StringIO() });
    expect(s).toBe(500);
    expect(h["content-type"]).toBe("text/plain");
    expect([...b].join("")).toContain("Rack::Lint::LintError");
  });

  it("support -e option to evaluate ruby code", async () => {
    argv.splice(0, argv.length, "-scgi", "-e", "globalThis.XYZ = 2");
    const top = globalThis as { XYZ?: number };
    try {
      await newServer();
      expect(top.XYZ).toBe(2);
    } finally {
      delete top.XYZ;
    }
  });

  it("abort if config file does not exist", async () => {
    argv.splice(0, argv.length, "-scgi");
    const server = await newServer();
    let message: string | undefined;
    await withOutput(async () => {
      try {
        await server.start();
      } catch (e) {
        if (!(e instanceof SystemExit)) throw e;
        message = e.message;
      }
    });
    expect(message).toMatch(/^configuration .*config\.ru not found/);
  });

  it("support -I option to change the load path and -r to require", async () => {
    const dir = File.join(File.dirname(new URL(import.meta.url).pathname), "support/load");
    argv.splice(0, argv.length, "-scgi", "-Ifoo/bar", `-I${dir}`, "-rrack-test-a", "-rrack-test-b");
    try {
      const server = await newServer();
      stubStart(server);
      await server.start();
      expect(LOAD_PATH).toContain("foo/bar");
      expect(LOAD_PATH).toContain(dir);
      expect(LOADED_FEATURES).toContain(File.join(dir, "rack-test-a.js"));
      expect(LOADED_FEATURES).toContain(File.join(dir, "rack-test-b.js"));
    } finally {
      for (const path of ["foo/bar", dir]) LOAD_PATH.splice(LOAD_PATH.indexOf(path), 1);
      for (const name of ["rack-test-a.js", "rack-test-b.js"]) {
        const i = LOADED_FEATURES.indexOf(File.join(dir, name));
        if (i !== -1) LOADED_FEATURES.splice(i, 1);
      }
    }
  });

  it("support -w option to warn and -d option to debug", async () => {
    argv.splice(0, argv.length, "-scgi", "-d", "-w");
    const warn = rbGvGet("$-w");
    const debug = rbGvGet("$DEBUG");
    try {
      const server = await newServer();
      stubStart(server);
      await withOutput(() => server.start());
      expect(rbGvGet("$-w")).toBe(true);
      expect(rbGvGet("$DEBUG")).toBe(true);
    } finally {
      rbGvSet("$-w", warn);
      rbGvSet("$DEBUG", debug);
    }
  });

  // PERMANENT-SKIP: objspace has no Node counterpart, RFC 0217-rackup-gem-port § Design.
  it.skip("support --heap option for heap profiling", () => {});

  // PERMANENT-SKIP: stackprof has no Node counterpart, RFC 0217-rackup-gem-port § Design.
  it.skip("support --profile-mode option for stackprof profiling", () => {});

  // PERMANENT-SKIP: stackprof has no Node counterpart, RFC 0217-rackup-gem-port § Design.
  it.skip("support --profile-mode option for stackprof profiling without --profile option", () => {});

  it("support exit for INT signal when server does not respond to shutdown", async () => {
    argv.splice(0, argv.length, "-scgi");
    const server = await newServer();
    stubStart(server);
    let exited = false;
    await server.start();
    expect(exited).toBe(false);
    try {
      signals["SIGINT"]();
    } catch (error) {
      if (!(error instanceof SystemExit)) throw error;
      exited = true;
    }
    expect(exited).toBe(true);
  });

  it("support support Server.start for starting", async () => {
    argv.splice(0, argv.length, "-scgi");
    const c = class extends Server {
      override async start(): Promise<unknown> {
        return [this.constructor, "started"];
      }
    };
    expect(await c.start()).toEqual([c, "started"]);
  });

  it("run a server", async () => {
    const pidfile = await tempPidfile();
    const server = new Server({
      app: app(),
      environment: "none",
      pid: pidfile,
      Port: 0,
      Host: "localhost",
      AccessLog: [],
      daemonize: false,
      server: "node",
    });
    const http = (await server.start()) as { address(): { port: number } };
    try {
      const body = await (await fetch(`http://localhost:${http.address().port}/`)).text();
      expect(body).toBe("success");
    } finally {
      await signals["SIGINT"]();
    }
    expect(await File.readAsync(pidfile)).toBe(`${Process.pid}`);
    await File.deleteAsync(pidfile);
  });

  // PERMANENT-SKIP: WEBrick's SSLEnable has no Node handler counterpart, RFC 0217-rackup-gem-port § "Non-goals".
  it.skip("run a secure server", () => {});

  it("check pid file presence and running process", async () => {
    const pidfile = await tempPidfile(`${Process.pid}`);
    const server = new Server({ pid: pidfile });
    const output = await withStderr(async () => {
      await expect(server["checkPidBang"]()).rejects.toThrow(SystemExit);
    });
    expect(output).toMatch(
      new RegExp(`already running \\(pid: ${Process.pid}, file: ${pidfile}\\)`),
    );
    await File.deleteAsync(pidfile);
  });

  it("check pid file presence and dead process", async () => {
    const pidfile = await tempPidfile("999999999");
    const server = new Server({ pid: pidfile });
    await server["checkPidBang"]();
    expect(await File.isExistAsync(pidfile)).toBe(false);
  });

  it("check pid file presence and exited process", async () => {
    const pidfile = await tempPidfile();
    const server = new Server({ pid: pidfile });
    await server["checkPidBang"]();
  });

  it("check pid file presence and not owned process", async (ctx) => {
    let ownsPid1: boolean;
    try {
      ownsPid1 = Process.kill(0, 1) === 1;
    } catch {
      ownsPid1 = false;
    }
    ctx.skip(ownsPid1, "cannot test if pid 1 owner matches current process (eg. docker/lxc)");
    const pidfile = await tempPidfile("1");
    const server = new Server({ pid: pidfile });
    const output = await withStderr(async () => {
      await expect(server["checkPidBang"]()).rejects.toThrow(SystemExit);
    });
    expect(output).toMatch(new RegExp(`already running \\(pid: 1, file: ${pidfile}\\)`));
    await File.deleteAsync(pidfile);
  });

  it("rewrite pid file when it does not reference a running process", async () => {
    const pidfile = await tempPidfile();
    const server = new Server({ pid: pidfile });
    await File.writeAsync(pidfile, "");
    await server["writePid"]();
    expect(parseInt(await File.readAsync(pidfile), 10)).toBe(Process.pid);
    await File.deleteAsync(pidfile);
  });

  it("not write pid file when it references a running process", async () => {
    const pidfile = await tempPidfile();
    const server = new Server({ pid: pidfile });
    await File.writeAsync(pidfile, "1");
    const output = await withStderr(async () => {
      await expect(server["writePid"]()).rejects.toThrow(SystemExit);
    });
    expect(output).toMatch(new RegExp(`already running \\(pid: 1, file: ${pidfile}\\)`));
    await File.deleteAsync(pidfile);
  });

  it("inform the user about existing pidfiles with running processes", async () => {
    const pidfile = await tempPidfile("1");
    const server = new Server({ pid: pidfile });
    const output = await withStderr(async () => {
      await expect(server.start()).rejects.toThrow(SystemExit);
    });
    expect(output).toMatch(new RegExp(`already running \\(pid: 1, file: ${pidfile}\\)`));
    await File.deleteAsync(pidfile);
  });
});
