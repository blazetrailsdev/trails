const base = new URL("./", self.location.href).pathname;
const previewRoot = `${base}preview/`;
const moduleRoot = `${base}rt/`;
const runtimePage = `${base}runtime.html`;
const ANSWER_TIMEOUT = 30_000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function tabUnder(root, url) {
  if (!url.pathname.startsWith(root)) return null;
  return url.pathname.slice(root.length).split("/")[0] || null;
}

/**
 * The newest runtime frame a tab holds. Nothing is remembered between events:
 * a browser stops an idle worker and starts a fresh one, and each tab runs
 * its own runtime, so the frame is looked up by the `tab` in its URL.
 */
async function runtimeFor(tab) {
  let found = null;
  let newest = -1;
  for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
    const url = new URL(client.url);
    if (url.pathname !== runtimePage || url.searchParams.get("tab") !== tab) continue;
    const session = Number(url.searchParams.get("session"));
    if (session > newest) [found, newest] = [client, session];
  }
  return found;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const tab = tabUnder(previewRoot, url) ?? tabUnder(moduleRoot, url);
  if (tab) {
    event.respondWith(forward(event.request, url, tab));
    return;
  }
  const referrer = event.request.referrer ? new URL(event.request.referrer) : null;
  const from = referrer && referrer.origin === url.origin ? tabUnder(previewRoot, referrer) : null;
  if (from) {
    const moved = new URL(`${previewRoot}${from}${url.pathname}${url.search}`, url.origin);
    event.respondWith(
      event.request.mode === "navigate"
        ? Response.redirect(moved.href, 302)
        : forward(event.request, moved, from),
    );
  }
});

function page(status, text) {
  return new Response(`<p style="font-family:system-ui">${text}</p>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function forward(request, url, tab) {
  const client = await runtimeFor(tab);
  if (!client) return page(503, "The trails runtime is not running. Press Restart in the editor.");
  const body =
    request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer();
  const channel = new MessageChannel();
  const reply = new Promise((resolve) => {
    channel.port1.onmessage = (event) => resolve(event.data);
    setTimeout(() => resolve(null), ANSWER_TIMEOUT);
  });
  client.postMessage(
    {
      type: "sw:request",
      method: request.method,
      url: url.href,
      headers: [...request.headers],
      body,
    },
    [channel.port2],
  );
  const answer = await reply;
  if (!answer) return page(504, "The trails runtime did not answer. Press Restart in the editor.");
  return new Response(answer.body, { status: answer.status, headers: answer.headers });
}
