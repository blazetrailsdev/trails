import { describe, it, expect, vi } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { deprecator } from "../deprecator.js";

class FakeRawConnection {
  query(): void {}
}

function captureDeprecations<T>(fn: () => T): { result: T; messages: string[] } {
  const messages: string[] = [];
  const spy = vi.spyOn(deprecator(), "warn").mockImplementation((message?: string) => {
    messages.push(String(message));
    return undefined;
  });
  try {
    return { result: fn(), messages };
  } finally {
    spy.mockRestore();
  }
}

describe("deprecated raw-connection initialize overload", () => {
  describe("PostgreSQLAdapter", () => {
    it("constructs an adapter from the legacy raw-connection signature", () => {
      const raw = new FakeRawConnection();
      const { result: adapter } = captureDeprecations(() => new PostgreSQLAdapter(raw as never));
      expect(adapter).toBeInstanceOf(PostgreSQLAdapter);
      expect(
        (adapter as unknown as { _unconfiguredConnection: { client: unknown } })
          ._unconfiguredConnection.client,
      ).toBe(raw);
    });

    it("does not warn for the legacy raw-connection signature", () => {
      const { messages } = captureDeprecations(
        () => new PostgreSQLAdapter(new FakeRawConnection() as never),
      );
      expect(messages).toEqual([]);
    });

    it("does not warn for the modern config-hash signature", () => {
      const { messages } = captureDeprecations(() => new PostgreSQLAdapter({ database: "blog" }));
      expect(messages).toEqual([]);
    });

    it("honors prepared_statements from the deprecated config", () => {
      const { result: adapter } = captureDeprecations(
        () =>
          new PostgreSQLAdapter(new FakeRawConnection() as never, null, null, {
            preparedStatements: false,
          }),
      );
      expect(adapter.preparedStatements).toBe(false);
    });

    it("raises ArgumentError when a config hash is passed with extra arguments", () => {
      expect(
        // @ts-expect-error — the overload signatures forbid a second arg for the
        () => new PostgreSQLAdapter({ database: "blog" }, { database: "blog" }),
      ).toThrow(ArgumentError);
    });

    it("normalizes a null deprecated config to an empty hash", () => {
      const { result: adapter } = captureDeprecations(
        () => new PostgreSQLAdapter(new FakeRawConnection() as never, null),
      );
      expect(adapter).toBeInstanceOf(PostgreSQLAdapter);
    });

    it("treats a null trailing arg as absent for a config hash (does not raise)", () => {
      // @ts-expect-error — overloads forbid a second arg for the modern form;
      expect(() => new PostgreSQLAdapter({ database: "blog" }, null)).not.toThrow();
    });
  });

  describe("Mysql2Adapter", () => {
    it("constructs an adapter from the legacy raw-connection signature", () => {
      const raw = new FakeRawConnection();
      const { result: adapter } = captureDeprecations(() => new Mysql2Adapter(raw as never));
      expect(adapter).toBeInstanceOf(Mysql2Adapter);
      expect(
        (adapter as unknown as { _unconfiguredConnection: unknown })._unconfiguredConnection,
      ).toBe(raw);
    });

    it("does not warn for the modern config-hash signature", () => {
      const { messages } = captureDeprecations(() => new Mysql2Adapter({ database: "blog" }));
      expect(messages).toEqual([]);
    });

    it("honors prepared_statements from the deprecated config", () => {
      const { result: adapter } = captureDeprecations(
        () =>
          new Mysql2Adapter(new FakeRawConnection() as never, null, null, {
            preparedStatements: false,
          }),
      );
      expect(adapter.preparedStatements).toBe(false);
    });

    it("leaves the caller's hash alone on every config arm, as symbolize_keys copies", () => {
      const config = { database: "blog" };
      new Mysql2Adapter(config);
      expect(config).not.toHaveProperty("flags");

      const deprecatedConfig = { database: "blog" };
      new Mysql2Adapter(new FakeRawConnection() as never, null, null, deprecatedConfig);
      expect(deprecatedConfig).not.toHaveProperty("flags");

      const deprecatedConnectionOptions = { database: "blog" };
      new Mysql2Adapter(new FakeRawConnection() as never, null, deprecatedConnectionOptions);
      expect(deprecatedConnectionOptions).not.toHaveProperty("flags");
    });

    it("raises ArgumentError when a config hash is passed with extra arguments", () => {
      expect(
        // @ts-expect-error — the overload signatures forbid a second arg for the
        () => new Mysql2Adapter({ database: "blog" }, { database: "blog" }),
      ).toThrow(ArgumentError);
    });
  });
});

describe("config-hash constructor retains foreignKeys in _config", () => {
  type FkGuards = {
    isForeignKeysEnabled(): boolean;
    useForeignKeys(): boolean;
  };
  const guards = (adapter: PostgreSQLAdapter | Mysql2Adapter) => adapter as unknown as FkGuards;

  it("PostgreSQLAdapter honors foreignKeys:false and defaults to true", () => {
    const disabled = new PostgreSQLAdapter({ foreignKeys: false });
    expect(disabled.supportsForeignKeys()).toBe(true);
    expect(guards(disabled).isForeignKeysEnabled()).toBe(false);
    expect(guards(disabled).useForeignKeys()).toBe(false);

    const enabled = new PostgreSQLAdapter({});
    expect(guards(enabled).isForeignKeysEnabled()).toBe(true);
    expect(guards(enabled).useForeignKeys()).toBe(true);
  });

  it("Mysql2Adapter honors foreignKeys:false and defaults to true", () => {
    const disabled = new Mysql2Adapter({ foreignKeys: false } as never);
    expect(disabled.supportsForeignKeys()).toBe(true);
    expect(guards(disabled).isForeignKeysEnabled()).toBe(false);
    expect(guards(disabled).useForeignKeys()).toBe(false);

    const enabled = new Mysql2Adapter({});
    expect(guards(enabled).isForeignKeysEnabled()).toBe(true);
    expect(guards(enabled).useForeignKeys()).toBe(true);
  });
});
