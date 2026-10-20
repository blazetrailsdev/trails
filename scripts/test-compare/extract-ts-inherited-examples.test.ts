import { describe, expect, it } from "vitest";
import { extractTestsFromSource } from "./extract-ts-core.js";

function paths(source: string): string[] {
  const info = extractTestsFromSource(source, "packages/rack/src/x.test.ts");
  return info.testCases.map((tc) => tc.path);
}

describe("an example function called from a suite and a suite nested in it", () => {
  it("replays the examples under the nested suite, as a same-file test subclass inherits them", () => {
    expect(
      paths(`
        function rackRequestTests(makeRequest: () => unknown): void {
          it("one", () => {});
        }
        describe("RackRequestTest", () => {
          rackRequestTests(() => 1);
          describe("TestProxyRequest", () => {
            rackRequestTests(() => 2);
          });
        });
      `),
    ).toEqual(["RackRequestTest > one", "RackRequestTest > TestProxyRequest > one"]);
  });

  it("replays a dynamically titled example under each suite", () => {
    expect(
      paths(`
        function rackRequestTests(): void {
          it(\`handles ASCII NUL input of \${length} bytes\`, () => {});
        }
        describe("RackRequestTest", () => {
          rackRequestTests();
          describe("TestProxyRequest", () => {
            rackRequestTests();
          });
        });
      `),
    ).toHaveLength(2);
  });

  it("visits the examples once when no call site is nested in another", () => {
    expect(
      paths(`
        function shared(): void {
          it("one", () => {});
        }
        describe("A", () => {
          shared();
        });
        describe("B", () => {
          shared();
        });
      `),
    ).toEqual(["one"]);
  });
});
