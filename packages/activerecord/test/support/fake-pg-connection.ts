import pg from "pg";
import { rbClassNewInstance } from "@blazetrails/ruby-compat/include";
import { vi } from "vitest";
import { Connection } from "@blazetrails/pg";

{
  const spy = vi.spyOn(pg, "Client").mockImplementation(function () {
    return { connect: async () => {}, end: async () => {} };
  } as never);
  try {
    await Connection.new({}, () => null);
  } finally {
    spy.mockRestore();
  }
}

type Submittable = {
  submit(connection: object): unknown;
  handleRowDescription?(msg: { fields: unknown[] }): void;
  handleDataRow?(msg: { fields: unknown[] }): void;
  handleCommandComplete?(msg: { text: string }): void;
  handleReadyForQuery?(): void;
};

async function replay(
  query: (config: unknown) => unknown,
  submittable: Submittable,
): Promise<void> {
  let text = "";
  submittable.submit(
    new Proxy(
      {},
      {
        get: (_target, name) => (arg: unknown) => {
          if (name === "query") text = arg as string;
          if (name === "parse") text = (arg as { text: string }).text;
        },
      },
    ),
  );
  const res = (await query({ text, rowMode: "array" })) as {
    fields?: unknown[];
    rows?: unknown[][];
    command?: string;
    rowCount?: number | null;
  } | null;
  const rows = res?.rows ?? [];
  submittable.handleRowDescription?.({ fields: res?.fields ?? [] });
  for (const row of rows) submittable.handleDataRow?.({ fields: row });
  submittable.handleCommandComplete?.({
    text: `${res?.command ?? "SELECT"} ${res?.rowCount ?? rows.length}`,
  });
  submittable.handleReadyForQuery?.();
}

export function fakePgConnection(client: object, { replaySubmittables = true } = {}): Connection {
  const query = (client as { query?: (config: unknown) => unknown }).query;
  if (replaySubmittables && typeof query === "function") {
    (client as { query: (config: unknown) => unknown }).query = (config: unknown) => {
      if (typeof (config as Submittable | null)?.submit !== "function") {
        return query.call(client, config);
      }
      return replay((c) => query.call(client, c), config as Submittable);
    };
  }
  const spy = vi.spyOn(pg, "Client").mockImplementation(function () {
    return client;
  } as never);
  try {
    return rbClassNewInstance(Connection, {});
  } finally {
    spy.mockRestore();
  }
}
