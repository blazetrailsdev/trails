import { buildViews } from "@blazetrails/trails-tsc";

const roots = [
  "../../../actionview/src/test-helpers/precompiled",
  "../../../actionpack/src/test-helpers/precompiled",
];

export default async function setup(): Promise<void> {
  for (const root of roots) {
    await buildViews({ cwd: decodeURIComponent(new URL(root, import.meta.url).pathname) });
  }
}
