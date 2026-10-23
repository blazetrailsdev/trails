import { buildViews } from "@blazetrails/trails-tsc";

const roots = ["../../test-fixtures/precompiled", "../../../actionpack/test-fixtures/precompiled"];

export default async function setup(): Promise<void> {
  for (const root of roots) {
    await buildViews({ cwd: decodeURIComponent(new URL(root, import.meta.url).pathname) });
  }
}
