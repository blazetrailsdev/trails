import { describe, expect, it } from "vitest";
import { Lint, MockRequest } from "@blazetrails/rack";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Lobster } from "../lib/lobster.js";

function lobster(): MockRequest {
  return new MockRequest(new Lint(new Lobster()));
}

function lambdaLobster(): MockRequest {
  return new MockRequest(new Lint(Lobster.LambdaLobster));
}

describe("Rackup::Lobster::LambdaLobster", () => {
  it("be a single lambda", () => {
    expect(Lobster.LambdaLobster).toBeInstanceOf(Function);
  });

  it("look like a lobster", async () => {
    const res = await lambdaLobster().get("/");
    expect(res.isOk).toBeTruthy();
    expect(res.body).toContain("(,(,,(,,,(");
    expect(res.body).toContain("?flip");
  });

  it("be flippable", async () => {
    const res = await lambdaLobster().get("/?flip");
    expect(res.isOk).toBeTruthy();
    expect(res.body).toContain("(,,,(,,(,(");
  });
});

describe("Rackup::Lobster", () => {
  it("look like a lobster", async () => {
    const res = await lobster().get("/");
    expect(res.isOk).toBeTruthy();
    expect(res.body).toContain("(,(,,(,,,(");
    expect(res.body).toContain("?flip");
    expect(res.body).toContain("crash");
  });

  it("be flippable", async () => {
    const res = await lobster().get("/?flip=left");
    expect(res.isOk).toBeTruthy();
    expect(res.body).toContain("),,,),,),)");
  });

  it("provide crashing for testing purposes", async () => {
    await expect(lobster().get("/?flip=crash")).rejects.toThrow(RuntimeError);
  });
});
