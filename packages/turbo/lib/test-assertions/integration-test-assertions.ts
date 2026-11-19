import { assertEqual } from "@blazetrails/activesupport/testing/assertions";
import { Mime } from "@blazetrails/actionpack";
import { rbCallSuper } from "@blazetrails/ruby-compat";
import { TestAssertions } from "../test-assertions.js";

type IntegrationTestAssertionsHost = {
  assertResponse(type: number | string, message?: string): void;
  response: { mediaType: unknown };
};
type Block = ((selected: unknown) => unknown) | null;

export function assertTurboStream(
  this: IntegrationTestAssertionsHost,
  {
    status = "ok",
    ...attributes
  }: { status?: number | string; action: string } & Record<string, unknown>,
  block: Block = null,
): unknown {
  this.assertResponse(status);
  assertEqual(Mime.get("turbo_stream"), this.response.mediaType);
  return rbCallSuper(this, assertTurboStream, attributes, block);
}

export function assertNoTurboStream(
  this: IntegrationTestAssertionsHost,
  {
    status = "ok",
    ...attributes
  }: { status?: number | string; action: string } & Record<string, unknown>,
): unknown {
  this.assertResponse(status);
  assertEqual(Mime.get("turbo_stream"), this.response.mediaType);
  return rbCallSuper(this, assertNoTurboStream, attributes);
}

export const IntegrationTestAssertions = { assertTurboStream, assertNoTurboStream };
Object.assign(TestAssertions, { IntegrationTestAssertions });
