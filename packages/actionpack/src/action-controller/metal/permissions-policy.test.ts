import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { PermissionsPolicy } from "../../action-dispatch/http/permissions-policy.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";

const POLICY = new PermissionsPolicy((p) => {
  p.gyroscope(":self");
});

class PolicyController extends Base {
  static {
    this.permissionsPolicy({ only: "index" }, function (this: PolicyController, f) {
      f.gyroscope(":none");
      this.seen = f;
    });
    this.permissionsPolicy({ only: "bare" });
  }

  seen: PermissionsPolicy | null = null;

  index(): void {
    this.head("ok");
  }

  bare(): void {
    this.head("ok");
  }
}

async function process(action: string, policy = POLICY): Promise<PolicyController> {
  const request = new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "localhost" });
  request.permissionsPolicy = policy;
  const controller = new PolicyController();
  await controller.dispatch(action, request, new Response());
  return controller;
}

describe("permissionsPolicy class DSL", () => {
  it("invokes the block with controller as `this` (mirrors Rails instance_exec)", async () => {
    const controller = await process("index");
    expect(controller.seen).toBe(controller.request.permissionsPolicy);
  });

  it("assigns a clone of the request's policy back, leaving the original alone", async () => {
    const controller = await process("index");
    expect(controller.request.permissionsPolicy).not.toBe(POLICY);
    expect(controller.request.permissionsPolicy!.build()).toBe("gyroscope 'none'");
    expect(POLICY.build()).toBe("gyroscope 'self'");
  });

  it("registers a no-op before_action when no block is provided (matches Rails)", async () => {
    const controller = await process("bare");
    expect(controller.request.permissionsPolicy).toBe(POLICY);
  });

  it("hands the block nil when the request has no policy, as nil.clone answers nil", async () => {
    await expect(process("index", null as never)).rejects.toThrow(TypeError);
  });
});
