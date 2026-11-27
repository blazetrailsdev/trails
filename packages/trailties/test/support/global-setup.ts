const SETUPS = [
  "./build-templates.ts",
  "./isolation/global-setup.ts",
  "../../../solid-cable/test/support/build-templates.ts",
  "../../../solid-queue/test/support/build-templates.ts",
  "../../../solid-cache/test/support/build-templates.ts",
  "../../../actionmailbox/test/support/build-templates.ts",
  "../../../actiontext/test/support/build-templates.ts",
  "../../../stimulus/test/support/build-templates.ts",
];

export default async function setup(): Promise<void> {
  for (const file of SETUPS) {
    const path = decodeURIComponent(new URL(file, import.meta.url).pathname);
    const { default: run } = (await import(path)) as { default: () => Promise<void> };
    await run();
  }
}
