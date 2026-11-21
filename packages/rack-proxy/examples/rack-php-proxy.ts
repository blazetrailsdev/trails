import { Request } from "@blazetrails/rack";
import { env as ENV, kernelURI, rbObjRespondTo, setEnv, TopLevel } from "@blazetrails/ruby-compat";

import { Proxy } from "../lib/index.js";

type RackEnv = Parameters<Proxy["call"]>[0];
type Triplet = Parameters<Proxy["rewriteResponse"]>[0];
type Middleware = { use(klass: unknown, opts: Record<string, unknown>): void };
type Trails = { application?: { config: { middleware: Middleware } } | null };

export class RackPhpProxy extends Proxy {
  protected override async performRequest(env: RackEnv): ReturnType<Proxy["call"]> {
    const request = new Request(env);
    if (/\.php/.test(request.path)) {
      env["HTTP_HOST"] =
        ENV["HTTP_HOST"] != null
          ? (kernelURI(ENV["HTTP_HOST"]) as { host: string }).host
          : "localhost";
      setEnv("PHP_PATH", ENV["PHP_PATH"] ?? "/manual/en/tutorial.firstpage.php");

      env["REQUEST_PATH"] = ENV["PHP_PATH"] ?? `/php/${request.fullpath}`;
      env["PATH_INFO"] = ENV["PHP_PATH"] ?? `/php/${request.fullpath}`;

      env["content-length"] = null;

      return super.performRequest(env);
    } else {
      return (this.app as { call(env: RackEnv): ReturnType<Proxy["call"]> }).call(env);
    }
  }

  override rewriteResponse(triplet: Triplet): Triplet {
    const [, headers] = triplet as unknown as [number, Record<string, unknown>];

    headers["content-length"] = null;

    return triplet;
  }
}

const Trails = (TopLevel as { Trails?: Trails }).Trails;
if (Trails != null && rbObjRespondTo(Trails, "application") && Trails.application) {
  Trails.application.config.middleware.use(RackPhpProxy, {
    backend: "http://php.net",
    streaming: false,
  });
}
