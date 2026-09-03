import { MigrationProxy, type Migration } from "../migration.js";

export function migrationProxy(attrs: {
  name: string;
  version: number;
  filename?: string;
  scope?: string;
  migration?: () => Migration | Promise<Migration>;
}): MigrationProxy {
  const proxy = new MigrationProxy(
    attrs.name,
    attrs.version,
    attrs.filename ?? "",
    attrs.scope ?? "",
  );
  const { migration } = attrs;
  if (migration) proxy.migration = async (): Promise<Migration> => migration();
  return proxy;
}
