import { describe, expect, it, beforeEach } from "vitest";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { MockRequest } from "@blazetrails/rack";
import { Metal } from "../metal.js";

type RackApp = (env: RackEnv) => Promise<RackResponse>;

class MyMiddleware {
  constructor(
    private app: RackApp,
    _options?: { kw?: number },
  ) {}
  async call(env: RackEnv): Promise<RackResponse> {
    const result = await this.app(env);
    result[1]["Middleware-Test"] = "Success";
    result[1]["Middleware-Order"] = "First";
    return result;
  }
}

class ExclaimerMiddleware {
  constructor(
    private app: RackApp,
    _options?: { kw?: number },
  ) {}
  async call(env: RackEnv): Promise<RackResponse> {
    const result = await this.app(env);
    result[1]["Middleware-Order"] += "!";
    return result;
  }
}

class BlockMiddleware {
  configurableMessage?: string;
  constructor(
    private app: RackApp,
    block?: (config: BlockMiddleware) => void,
  ) {
    block?.(this);
  }
  async call(env: RackEnv): Promise<RackResponse> {
    const result = await this.app(env);
    result[1]["Configurable-Message"] = this.configurableMessage!;
    return result;
  }
}

class MyController extends Metal {
  index(): void {
    this.responseBody = "Hello World";
  }
}
MyController.use(BlockMiddleware, (config: BlockMiddleware) => {
  config.configurableMessage = "Configured by block.";
});
MyController.use(MyMiddleware, { kw: 1 });
MyController.middleware().insertBefore(MyMiddleware, ExclaimerMiddleware, { kw: 1 });

class InheritedController extends MyController {}

class ActionsController extends Metal {
  index(): void {
    this.responseBody = "index";
  }
  show(): void {
    this.responseBody = "show";
  }
}
ActionsController.use(MyMiddleware, { only: "show", kw: 1 });
ActionsController.middleware().insertBefore(MyMiddleware, ExclaimerMiddleware, {
  except: "index",
  kw: 1,
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
  let app: RackApp;
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

  it("middleware stack accepts block arguments", async () => {
    const result = await app(envFor("/"));
    expect(result[1]["Configurable-Message"]).toBe("Configured by block.");
  });

  it("middleware stack accepts only and except as options", async () => {
    let result = await ActionsController.action("show")(envFor("/"));
    expect(result[1]["Middleware-Order"]).toBe("First!");

    result = await ActionsController.action("index")(envFor("/"));
    expect(result[1]["Middleware-Order"]).toBeUndefined();
  });
});

describe("TestInheritedMiddleware", () => {
  let app: RackApp;
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

  it("middleware stack accepts block arguments", async () => {
    const result = await app(envFor("/"));
    expect(result[1]["Configurable-Message"]).toBe("Configured by block.");
  });
});
