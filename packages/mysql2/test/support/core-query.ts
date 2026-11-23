type PromiseQuery = (options: object) => Promise<[unknown, unknown]>;

export function withCoreQuery<T extends object>(connection: T): T {
  const query = (connection as { query?: PromiseQuery }).query;
  if (typeof query !== "function") return connection;
  const core = ((connection as { connection?: object }).connection ??= {}) as Record<
    string,
    unknown
  >;
  core.query = (options: object, onResult: (this: object, e?: unknown) => void) => {
    const command = { _rows: [] as unknown[], _fields: [] as unknown[] };
    query.call(connection, options).then(
      ([rows, fields]) => {
        command._rows.push(rows);
        command._fields.push(fields);
        onResult.call(command, null);
      },
      (e: unknown) => onResult.call(command, e),
    );
    return command;
  };
  return connection;
}
