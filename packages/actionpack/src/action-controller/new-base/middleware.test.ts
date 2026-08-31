import { describe, expect, it, beforeEach } from "vitest";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { MockRequest } from "@blazetrails/rack";
import { Metal } from "../metal.js";

type RackApp = (env: RackEnv) => Promise<RackResponse>;

class MyMiddleware {
  constructor(private app: RackApp) {}
  async call(env: RackEnv): Promise<RackResponse> {
    const result = await this.app(env);
    result[1]["Middleware-Test"] = "Success";
    result[1]["Middleware-Order"] = "First";
    return result;
  }
}

class ExclaimerMiddleware {
  constructor(private app: RackApp) {}
  async call(env: RackEnv): Promise<RackResponse> {
    const result = await this.app(env);
    result[1]["Middleware-Order"] += "!";
    return result;
  }
}

class MyController extends Metal {
  index(): void {
    this.responseBody = "Hello World";
  }
}
MyController.use(MyMiddleware);
MyController.middleware().insertBefore(MyMiddleware, ExclaimerMiddleware);

class InheritedController extends MyController {}

class ActionsController extends Metal {
  index(): void {
    this.responseBody = "index";
  }
  show(): void {
    this.responseBody = "show";
  }
}
ActionsController.use(MyMiddleware, { only: "show" });
ActionsController.middleware().insertBefore(MyMiddleware, ExclaimerMiddleware, {
  except: "index",
});

function envFor(url: string): RackEnv {
  return MockRequest.envFor(url);
}

async function bodyToString(body: unknown): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of body as AsyncIterable<string>) parts.push(String(chunk));
  return parts.join("");
}

describe("TestMiddleware", () => {
  let app: (env: RackEnv) => Promise<RackResponse>;
  beforeEach(() => {
    app = MyController.action("index");
  });

  it("middleware that is 'use'd is called as part of the Rack application", async () => {
    const result = await app(envFor("/"));
    expect(await bodyToString(result[2])).toBe("Hello World");
    expect(result[1]["Middleware-Test"]).toBe("Success");
  });

  it("the middleware stack is exposed as 'middleware' in the controller", async () => {
    const result = await app(envFor("/"));
    expect(result[1]["Middleware-Order"]).toBe("First!");
  });

  it("middleware stack accepts only and except as options", async () => {
    let result = await ActionsController.action("show")(envFor("/"));
    expect(result[1]["Middleware-Order"]).toBe("First!");

    result = await ActionsController.action("index")(envFor("/"));
    expect(result[1]["Middleware-Order"]).toBeUndefined();
  });
});

describe("TestInheritedMiddleware", () => {
  let app: (env: RackEnv) => Promise<RackResponse>;
  beforeEach(() => {
    app = InheritedController.action("index");
  });

  it("middleware that is 'use'd is called as part of the Rack application", async () => {
    const result = await app(envFor("/"));
    expect(await bodyToString(result[2])).toBe("Hello World");
    expect(result[1]["Middleware-Test"]).toBe("Success");
  });

  it("the middleware stack is exposed as 'middleware' in the controller", async () => {
    const result = await app(envFor("/"));
    expect(result[1]["Middleware-Order"]).toBe("First!");
  });
});
