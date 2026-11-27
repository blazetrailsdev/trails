export default async function setup(): Promise<void> {
  const { env: ENV } = await import("@blazetrails/ruby-compat");
  if (ENV["ISOLATION_TEST"] != null) return;
  const { buildTemplates } = await import("@blazetrails/trails-tsc");
  await buildTemplates([
    decodeURIComponent(new URL("../../lib/generators", import.meta.url).pathname),
    decodeURIComponent(
      new URL(
        "../../lib/generators/solid-queue/update/templates/db/add-batches-to-solid-queue.ts",
        import.meta.url,
      ).pathname,
    ),
  ]);
}
