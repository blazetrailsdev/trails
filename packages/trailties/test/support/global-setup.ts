const SETUPS = [
  () => import("./build-templates.js"),
  () => import("./isolation/global-setup.js"),
  () => import("../../../solid-cable/test/support/build-templates.js"),
  () => import("../../../solid-queue/test/support/build-templates.js"),
  () => import("../../../solid-cache/test/support/build-templates.js"),
  () => import("../../../actionmailbox/test/support/build-templates.js"),
  () => import("../../../actiontext/test/support/build-templates.js"),
  () => import("../../../stimulus/test/support/build-templates.js"),
];

export default async function setup(): Promise<void> {
  for (const file of SETUPS) {
    const { default: run } = await file();
    await run();
  }
}
