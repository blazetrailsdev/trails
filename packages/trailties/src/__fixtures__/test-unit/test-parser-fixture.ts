export {};
declare function test(name: string, block: () => void): void;
declare function assert(value: boolean): void;
declare function assertNot(value: boolean): void;
declare function myTestingAlias(name: string, block: () => void): void;
declare const self: { test: typeof test };

export class TestParserTestFixture {
  testMethod() {
    assert(true);

    assert(true);
  }

  // prettier-ignore
  testOneline() { assert(true); }
}

test("declarative", () => {
  assert(true);

  assert(true);
});

self.test("declarative explicit receiver", () => {
  assert(true);

  assert(true);
});

test("declarative oneline", () => assert(true));

test("declarative multiline w/ braces", () => {
  assert(true);
  assertNot(false);
});

myTestingAlias("method_alias", () => assert(true));
