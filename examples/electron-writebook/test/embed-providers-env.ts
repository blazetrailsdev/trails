import { afterEach, beforeEach } from "vitest";
import { EmbedProvider } from "../app/models/embed-provider.ts";

/**
 * Writebook's test_helper setup/teardown: a WRITEBOOK_EMBED_PROVIDERS in the shell must
 * not leak into a test, nor out of one.
 */
export function isolateEmbedProviders(): void {
  let before: string | undefined;
  beforeEach(async () => {
    before = process.env.WRITEBOOK_EMBED_PROVIDERS;
    delete process.env.WRITEBOOK_EMBED_PROVIDERS;
    await EmbedProvider.resolution();
  });
  afterEach(async () => {
    if (before == null) delete process.env.WRITEBOOK_EMBED_PROVIDERS;
    else process.env.WRITEBOOK_EMBED_PROVIDERS = before;
    await EmbedProvider.resolution();
  });
}

/** `ENV["WRITEBOOK_EMBED_PROVIDERS"] = value`, then the resolution the app awaits per request. */
export async function setEmbedProviders(value: string): Promise<void> {
  process.env.WRITEBOOK_EMBED_PROVIDERS = value;
  await EmbedProvider.resolution();
}
