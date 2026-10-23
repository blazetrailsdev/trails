import { beforeEach, describe, it } from "vitest";
import {
  HostAuthorization,
  ALLOWED_HOSTS_IN_DEVELOPMENT,
  type HostPermission,
} from "../middleware/host-authorization.js";
import { IPAddr, StringIO } from "@blazetrails/ruby-compat";
import { Logger, assertEmpty, assertEqual, assertMatch } from "@blazetrails/activesupport";
import { Base } from "@blazetrails/actionview";
import { Lint } from "@blazetrails/rack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import type { RackAppObject } from "../middleware/stack.js";
import type { Request } from "../http/request.js";
import { IntegrationTest } from "../testing/integration.js";
import "../../test-helpers/abstract-unit.js";

const App = async (_env: RackEnv) => [200, {}, ["Success"]];

function buildApp(
  hosts: HostPermission | HostPermission[] | null,
  {
    exclude = undefined,
    responseApp = undefined,
    lint = true,
    app = App as RackAppObject["call"] | RackAppObject,
  }: {
    exclude?: (req: Request) => boolean;
    responseApp?: (env: RackEnv) => Promise<RackResponse>;
    lint?: boolean;
    app?: RackAppObject["call"] | RackAppObject;
  } = {},
): RackAppObject["call"] | RackAppObject {
  if (lint) {
    app = new Lint(app);
  }

  app = new HostAuthorization(app, hosts, { exclude, responseApp });

  if (lint) {
    app = new Lint(app);
  }

  return app;
}

describe("HostAuthorizationTest", () => {
  let testCase: IntegrationTest;

  beforeEach(({ task }) => {
    testCase = new IntegrationTest(task.name);
  });

  it("blocks requests to unallowed host with empty body", async () => {
    testCase.app = buildApp(["only.com"]);

    await testCase.get("/");

    testCase.assertResponse("forbidden");
    assertEmpty(testCase.response.body);
  });

  it("renders debug info when all requests considered as local", async () => {
    testCase.app = buildApp(["only.com"]);

    await testCase.get("/", { env: { "action_dispatch.show_detailed_exceptions": true } });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.com", testCase.response.body);
  });

  it("allows all requests if hosts is empty", async () => {
    testCase.app = buildApp(null);

    await testCase.get("/");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("hosts can be a single element array", async () => {
    testCase.app = buildApp(["www.example.com"]);

    await testCase.get("/");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("hosts can be a string", async () => {
    testCase.app = buildApp("www.example.com");

    await testCase.get("/");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("hosts are matched case insensitive", async () => {
    testCase.app = buildApp("Example.local");

    await testCase.get("/", {
      env: {
        HOST: "example.local",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("hosts are matched case insensitive with titlecased host", async () => {
    testCase.app = buildApp("example.local");

    await testCase.get("/", {
      env: {
        HOST: "Example.local",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("hosts are matched case insensitive with hosts array", async () => {
    testCase.app = buildApp(["Example.local"]);

    await testCase.get("/", {
      env: {
        HOST: "example.local",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("regex matches are not title cased", async () => {
    testCase.app = buildApp([/www.Example.local/]);

    await testCase.get("/", {
      env: {
        HOST: "www.example.local",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.local", testCase.response.body);
  });

  it("passes requests to allowed hosts with domain name notation", async () => {
    testCase.app = buildApp(".example.com");

    await testCase.get("/");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("does not allow domain name notation in the HOST header itself", async () => {
    testCase.app = buildApp(".example.com");

    await testCase.get("/", {
      env: {
        HOST: ".example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: .example.com", testCase.response.body);
  });

  it("checks for requests with #=== to support wider range of host checks", async () => {
    testCase.app = buildApp([(input: string) => input === "www.example.com"]);

    await testCase.get("/");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("mark the host when authorized", async () => {
    testCase.app = buildApp(".example.com");

    await testCase.get("/");

    assertEqual("www.example.com", testCase.request.getHeader("action_dispatch.authorized_host"));
  });

  it("sanitizes regular expressions to prevent accidental matches", async () => {
    testCase.app = buildApp([/w.example.co/]);

    await testCase.get("/", { env: { "action_dispatch.show_detailed_exceptions": true } });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.com", testCase.response.body);
  });

  it("blocks requests to unallowed host supporting custom responses", async () => {
    testCase.app = buildApp(["w.example.co"], {
      responseApp: async (_env: RackEnv) => [401, {}, ["Custom"]],
    });

    await testCase.get("/");

    testCase.assertResponse("unauthorized");
    assertEqual("Custom", testCase.body);
  });

  it("localhost works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "localhost:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV4 works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "127.0.0.1",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV4 with port works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "127.0.0.1:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV4 binding in all addresses works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "0.0.0.0",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV4 with port binding in all addresses works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "0.0.0.0:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV6 works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "[::1]",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV6 with port works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "[::1]:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV6 binding in all addresses works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "[::]",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV6 with port binding in all addresses works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "[::]:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("hosts with port works", async () => {
    testCase.app = buildApp(["host.test"]);

    await testCase.get("/", {
      env: {
        HOST: "host.test:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("blocks requests with spoofed X-FORWARDED-HOST", async () => {
    testCase.app = buildApp([new IPAddr("127.0.0.1")]);

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "127.0.0.1",
        HOST: "www.example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.com", testCase.response.body);
  });

  it("blocks requests with spoofed relative X-FORWARDED-HOST", async () => {
    testCase.app = buildApp(["www.example.com"]);

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "//randomhost.com",
        HOST: "www.example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: //randomhost.com", testCase.response.body);
  });

  it("forwarded secondary hosts are allowed when permitted", async () => {
    testCase.app = buildApp(".domain.com");

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "example.com, my-sub.domain.com",
        HOST: "domain.com",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("forwarded secondary hosts are blocked when mismatch", async () => {
    testCase.app = buildApp("domain.com");

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "domain.com, evil.com",
        HOST: "domain.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: evil.com", testCase.response.body);
  });

  it("does not consider IP addresses in X-FORWARDED-HOST spoofed when disabled", async () => {
    testCase.app = buildApp(null);

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "127.0.0.1",
        HOST: "www.example.com",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("detects localhost domain spoofing", async () => {
    testCase.app = buildApp("localhost");

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "localhost",
        HOST: "www.example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.com", testCase.response.body);
  });

  it("forwarded hosts should be permitted", async () => {
    testCase.app = buildApp("domain.com");

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "sub.domain.com",
        HOST: "domain.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: sub.domain.com", testCase.response.body);
  });

  it("sub-sub domains should not be permitted", async () => {
    testCase.app = buildApp(".domain.com");

    await testCase.get("/", {
      env: {
        HOST: "secondary.sub.domain.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: secondary.sub.domain.com", testCase.response.body);
  });

  it("forwarded hosts are allowed when permitted", async () => {
    testCase.app = buildApp(".domain.com");

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "my-sub.domain.com",
        HOST: "domain.com",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("lots of NG hosts", async () => {
    const ngHosts = [
      "hacker%E3%80%82com",
      "hacker%00.com",
      "www.theirsite.com@yoursite.com",
      "hacker.com/test/",
      "hacker%252ecom",
      ".hacker.com",
      "///hacker.com/",
      "/hacker.com",
      "../hacker.com",
      ".hacker.com",
      "@hacker.com",
      "hacker.com",
      "hacker.com%23@example.com",
      "hacker.com/.jpg",
      "hacker.com\texample.com/",
      "hacker.com/example.com",
      "hacker.com@example.com",
      "hacker.com/example.com",
      "hacker.com/",
    ];

    testCase.app = buildApp("example.com");

    for (const host of ngHosts) {
      await testCase.get("/", {
        env: {
          HTTP_X_FORWARDED_HOST: host,
          HOST: "example.com",
          "action_dispatch.show_detailed_exceptions": true,
        },
      });

      testCase.assertResponse("forbidden");
      assertMatch(`Blocked hosts: ${host}`, testCase.response.body);
    }
  });

  it("exclude matches allow any host", async () => {
    testCase.app = buildApp("only.com", { exclude: (req: Request) => req.path === "/foo" });

    await testCase.get("/foo");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("exclude misses block unallowed hosts", async () => {
    testCase.app = buildApp("only.com", { exclude: (req: Request) => req.path === "/bar" });

    await testCase.get("/foo", { env: { "action_dispatch.show_detailed_exceptions": true } });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.com", testCase.response.body);
  });

  it("blocks requests with invalid hostnames", async () => {
    testCase.app = buildApp(".example.com", { lint: false });

    await testCase.get("/", {
      env: {
        HOST: "attacker.com#x.example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: attacker.com#x.example.com", testCase.response.body);
  });

  it("blocks requests to similar host", async () => {
    testCase.app = buildApp("sub.example.com");

    await testCase.get("/", {
      env: {
        HOST: "sub-example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: sub-example.com", testCase.response.body);
  });

  it("uses logger from the env", async () => {
    testCase.app = buildApp(["only.com"]);
    const output = new StringIO();

    await testCase.get("/", { env: { "action_dispatch.logger": new Logger(output) } });

    testCase.assertResponse("forbidden");
    output.rewind();
    assertMatch("Blocked hosts: www.example.com", output.read());
  });

  it("uses ActionView::Base logger when no logger in the env", async () => {
    testCase.app = buildApp(["only.com"]);
    const output = new StringIO();
    const logger = new Logger(output);

    const _old = Base.logger;
    Base.logger = logger;
    try {
      await testCase.get("/");
    } finally {
      Base.logger = _old;
    }

    testCase.assertResponse("forbidden");
    output.rewind();
    assertMatch("Blocked hosts: www.example.com", output.read());
  });
});
