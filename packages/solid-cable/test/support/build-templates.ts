export default async function setup(): Promise<void> {
  const { env: ENV } = await import("@blazetrails/ruby-compat");
  if (ENV["ISOLATION_TEST"] != null) return;
  const { buildTemplates } = await import("@blazetrails/trails-tsc");
  await buildTemplates([
    decodeURIComponent(new URL("../../lib/generators", import.meta.url).pathname),
    decodeURIComponent(
      new URL(
        "../../lib/generators/solid-cable/update/templates/db/migrate/create-compact-channel.ts",
        import.meta.url,
      ).pathname,
    ),
  ]);
}
