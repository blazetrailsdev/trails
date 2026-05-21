// PR 2.6 integration fixture — minimal Application subclass + Rack-style
// hello-world handler dispatched through actionpack's `RouteSet`. Used by
// `application.test.ts` to verify `Trails.application.initialize()` + a
// route serves end-to-end through actionpack.
import { bodyFromString } from "@blazetrails/rack";
import { RouteSet } from "@blazetrails/actionpack";
import { Application } from "../../application.js";

export class HelloWorldApp extends Application {}

export function buildRoutes(): RouteSet {
  const routes = new RouteSet();
  const hello = (_env: Record<string, unknown>) =>
    [200, { "content-type": "text/plain" }, bodyFromString("hello world")] as const;
  routes.draw((r) => r.mount(hello, { at: "/hello" }));
  return routes;
}
