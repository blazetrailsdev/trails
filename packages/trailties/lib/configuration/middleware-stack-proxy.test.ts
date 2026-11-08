import { beforeEach, describe, expect, it } from "vitest";
import type { MiddlewareStack } from "@blazetrails/actionpack";
import { MiddlewareStackProxy } from "../configuration.js";

describe("MiddlewareStackProxyTest", () => {
  let stack: MiddlewareStackProxy;

  beforeEach(() => {
    stack = new MiddlewareStackProxy();
  });

  function assertPlayback(msgNames: string | string[], args: unknown): void {
    const names = Array.isArray(msgNames) ? msgNames : [msgNames];
    const calls: Array<[string, unknown[]]> = [];
    const mock = new Proxy({} as MiddlewareStack, {
      get:
        (_t, name: string) =>
        (...received: unknown[]) => {
          calls.push([name, received]);
        },
    });
    stack.mergeInto(mock);
    expect(calls).toEqual(names.map((name) => [name, [args]]));
  }

  it("playback insert before", () => {
    stack.insertBefore(":foo");
    assertPlayback("insertBefore", ":foo");
  });

  it("playback insert", () => {
    stack.insert(":foo");
    assertPlayback("insertBefore", ":foo");
  });

  it("playback insert after", () => {
    stack.insertAfter(":foo");
    assertPlayback("insertAfter", ":foo");
  });

  it("playback swap", () => {
    stack.swap(":foo");
    assertPlayback("swap", ":foo");
  });

  it("playback use", () => {
    stack.use(":foo");
    assertPlayback("use", ":foo");
  });

  it("playback delete", () => {
    stack.delete(":foo");
    assertPlayback("delete", ":foo");
  });

  it("playback move before", () => {
    stack.moveBefore(":foo");
    assertPlayback("moveBefore", ":foo");
  });

  it("playback move", () => {
    stack.move(":foo");
    assertPlayback("moveBefore", ":foo");
  });

  it("playback move after", () => {
    stack.moveAfter(":foo");
    assertPlayback("moveAfter", ":foo");
  });

  it("order", () => {
    stack.swap(":foo");
    stack.delete(":foo");

    assertPlayback(["swap", "delete"], ":foo");
  });
});
