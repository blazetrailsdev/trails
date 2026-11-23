import { ApplicationJob } from "./application-job.ts";
import type { Message } from "../models/message.ts";

const MAX_BYTES = 512 * 1024;

/** Fetches each URL in a message, reads its Open Graph / <title> tags and stores a LinkPreview. */
export class LinkPreviewJob extends ApplicationJob {
  async perform(message: Message): Promise<void> {
    for (const url of message.urls()) {
      const meta = await fetchMeta(url);
      if (meta) await message.linkPreviews.createBang({ url, ...meta });
    }
    await message.broadcastRefreshEverywhere();
  }
}

async function fetchMeta(url: string): Promise<Record<string, string | null> | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "ChatterBot/1.0 (+link previews)", accept: "text/html,image/*" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  if (type.startsWith("image/")) {
    await response.body?.cancel();
    return { title: null, description: null, image_url: url, site_name: null };
  }
  if (!type.includes("html")) {
    await response.body?.cancel();
    return null;
  }
  const html = await readCapped(response);
  const tag = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
    const m = html.match(re)?.[0].match(/content=["']([^"']*)["']/i);
    return m ? decode(m[1]) : null;
  };
  const title =
    tag("og:title") ??
    tag("twitter:title") ??
    decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
  let image = tag("og:image") ?? tag("twitter:image");
  if (image) image = new URL(image, response.url).toString();
  if (!title && !image) return null;
  return {
    title: title?.slice(0, 255) || null,
    description: (tag("og:description") ?? tag("description"))?.slice(0, 1000) ?? null,
    image_url: image?.slice(0, 255) ?? null,
    site_name: tag("og:site_name")?.slice(0, 255) ?? null,
  };
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel();
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}
