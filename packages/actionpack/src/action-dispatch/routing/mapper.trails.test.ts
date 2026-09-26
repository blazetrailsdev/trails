import { describe, expect, it } from "vitest";

import { Constraints, Mapper, type ConstraintsRequest } from "./mapper.js";
import { RouteSet } from "./route-set.js";
import type { Request } from "../http/request.js";
import { X_CASCADE } from "../constants.js";

function fakeRequest(): ConstraintsRequest & Request {
  return {
    env: { PATH_INFO: "/" },
    pathParameters: { id: "1" },
  } as unknown as ConstraintsRequest & Request;
}

describe("ActionDispatch::Routing::Mapper::Constraints", () => {
  it("invokes a function constraint with the constraint as this", () => {
    const receivers: unknown[] = [];
    const constraint = function (this: unknown) {
      receivers.push(this);
      return true;
    };
    const c = new Constraints({}, [constraint], Constraints.SERVE);
    expect(c.matches(fakeRequest())).toBe(true);
    expect(receivers).toEqual([constraint]);
  });

  it("hands each constraint the arguments its arity asks for", () => {
    const req = fakeRequest();
    const seen: unknown[][] = [];
    const zero = () => (seen.push([]), true);
    const one = (r: unknown) => (seen.push([r]), true);
    const two = (params: unknown, r: unknown) => (seen.push([params, r]), true);
    new Constraints({}, [zero, one, two], Constraints.SERVE).matches(req);
    expect(seen).toEqual([[], [req], [req.pathParameters, req]]);
  });

  it("reads arity off the call method of a call-answering object", () => {
    const req = fakeRequest();
    let args: unknown[] = [];
    const constraint = {
      call(params: unknown, r: unknown) {
        args = [params, r];
        return true;
      },
    };
    new Constraints({}, [constraint], Constraints.SERVE).matches(req);
    expect(args).toEqual([req.pathParameters, req]);
  });

  it("prefers an explicit arity over the callable's own", () => {
    const req = fakeRequest();
    let args: unknown[] = [];
    const constraint = Object.assign((...a: unknown[]) => ((args = a), true), { arity: 1 });
    new Constraints({}, [constraint], Constraints.SERVE).matches(req);
    expect(args).toEqual([req]);
  });

  it("falls back to call when matches? is falsy", () => {
    const constraint = { matches: () => false, call: () => true };
    expect(new Constraints({}, [constraint], Constraints.SERVE).matches(fakeRequest())).toBe(true);
  });

  it("CALL invokes a function app and a call-answering app with env", () => {
    const req = fakeRequest();
    const fn = (env: unknown) => ["fn", env];
    const obj = { call: (env: unknown) => ["obj", env] };
    expect(new Constraints(fn, [], Constraints.CALL).serve(req)).toEqual(["fn", req.env]);
    expect(new Constraints(obj, [], Constraints.CALL).serve(req)).toEqual(["obj", req.env]);
  });

  it("SERVE hands the request to the app's serve and is a dispatcher", () => {
    const req = fakeRequest();
    const app = { serve: (r: unknown) => ["served", r] };
    const serve = new Constraints(app, [], Constraints.SERVE);
    expect(serve.serve(req)).toEqual(["served", req]);
    expect(serve.dispatcher()).toBe(true);
    expect(new Constraints(app, [], Constraints.CALL).dispatcher()).toBe(false);
  });

  it("cascades with X-Cascade: pass when a constraint rejects the request", () => {
    const app = { serve: () => ["served"] };
    const c = new Constraints(app, [() => false], Constraints.SERVE);
    expect(c.serve(fakeRequest())).toEqual([404, { [X_CASCADE]: "pass" }, []]);
  });

  it("unwraps a Constraints app, appending its constraints", () => {
    const app = { serve: () => ["served"] };
    const outer = () => true;
    const inner = () => true;
    const wrapped = new Constraints(
      new Constraints(app, [inner], Constraints.SERVE),
      [outer],
      Constraints.SERVE,
    );
    expect(wrapped.app()).toBe(app);
    expect(wrapped.constraints).toEqual([outer, inner]);
  });
});

describe("Mapper#nested under a singleton resource", () => {
  it("constrains the nested param as SingletonResource#nested_param names it", () => {
    const set = new RouteSet();
    const m = new Mapper(set);
    let nestedConstraints: unknown;
    m.resource("session", { constraints: { id: /\d+/ } }, () => {
      m.resources("infos");
      m.nested(() => {
        nestedConstraints = m._scope.get("constraints");
      });
    });
    const index = set
      .getRoutes()
      .find((r) => r.action === "index" && r.controller.endsWith("infos"));
    expect(index?.path).toBe("/session/infos");
    expect(index?.name).toBe("session_infos");
    expect((nestedConstraints as Record<string, unknown>)["session_id"]).toEqual(/\d+/);
  });
});
