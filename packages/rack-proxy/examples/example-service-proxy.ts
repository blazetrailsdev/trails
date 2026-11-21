import { Request } from "@blazetrails/rack";
import { env as ENV, kernelURI, rbObjRespondTo, setEnv, TopLevel } from "@blazetrails/ruby-compat";

import { Proxy } from "../lib/index.js";

type RackEnv = Parameters<Proxy["call"]>[0];
type Middleware = { use(klass: unknown, opts: Record<string, unknown>): void };
type Trails = { application?: { config: { middleware: Middleware } } | null };

setEnv("SERVICE_URL", ENV["SERVICE_URL"] ?? "http://guides.rubyonrails.org");

export class ExampleServiceProxy extends Proxy {
  protected override async performRequest(env: RackEnv): ReturnType<Proxy["call"]> {
    const request = new Request(env);

    if (/^\/example_service/.test(request.path)) {
      const backend = kernelURI(ENV["SERVICE_URL"]!) as { host: string };
      env["HTTP_HOST"] = backend.host;

      env["PATH_INFO"] = ENV["SERVICE_PATH"] ?? "/configuring.html";

      env["HTTP_COOKIE"] = "";
      return super.performRequest(env);
    } else {
      return (this.app as { call(env: RackEnv): ReturnType<Proxy["call"]> }).call(env);
    }
  }
}

const Trails = (TopLevel as { Trails?: Trails }).Trails;
if (Trails != null && rbObjRespondTo(Trails, "application") && Trails.application) {
  Trails.application.config.middleware.use(ExampleServiceProxy, {
    backend: ENV["SERVICE_URL"],
    streaming: false,
  });
}
