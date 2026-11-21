import { rbObjRespondTo, TopLevel } from "@blazetrails/ruby-compat";

import { Proxy } from "../lib/index.js";

type RackEnv = Parameters<Proxy["call"]>[0];
type Triplet = Parameters<Proxy["rewriteResponse"]>[0];
type Middleware = { use(klass: unknown, opts: Record<string, unknown>): void };
type Trails = { application?: { config: { middleware: Middleware } } | null };

export class ForwardHost extends Proxy {
  override rewriteEnv(env: RackEnv): RackEnv {
    env["HTTP_HOST"] = "example.com";
    return env;
  }

  override rewriteResponse(triplet: Triplet): Triplet {
    const [, headers] = triplet as unknown as [number, Record<string, unknown>];

    headers["X-Foo"] = "Bar";

    headers["content-length"] = null;

    return triplet;
  }
}

const Trails = (TopLevel as { Trails?: Trails }).Trails;
if (Trails != null && rbObjRespondTo(Trails, "application") && Trails.application) {
  Trails.application.config.middleware.use(ForwardHost, {
    backend: "http://example.com",
    streaming: false,
  });
}
