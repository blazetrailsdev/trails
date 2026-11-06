import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { MockRequest } from "@blazetrails/rack";
import { include } from "@blazetrails/ruby-compat";
import type { Generation, Rack } from "../test-helpers/isolation/abstract-unit.js";
import "../test-helpers/isolation/abstract-unit.js";

class MailerPreviewsTest extends TestCase {}
include(MailerPreviewsTest, Isolation);

type Host = Generation & Rack & MailerPreviewsTest;

describe("MailerPreviewsTest", () => {
  let t: Host;
  let lastResponse: { status: number; body: string };

  async function get(path: string, env: Record<string, unknown> = {}): Promise<void> {
    const response = await (await t.app()).call(MockRequest.envFor(path, env as never));
    lastResponse = { status: response[0], body: await t.extractBody(response) };
  }

  beforeEach(async () => {
    t = new MailerPreviewsTest("test") as unknown as Host;
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("/trails/mailers is accessible in development", { timeout: 120_000 }, async () => {
    await t.app("development");
    await get("/trails/mailers");
    expect(lastResponse.status).toBe(200);
  });
});
