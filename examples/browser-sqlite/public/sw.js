const base = new URL("./", self.location.href).pathname;
const previewRoot = `${base}preview/`;
const moduleRoot = `${base}rt/`;
const runtimePage = `${base}runtime.html`;
const ANSWER_TIMEOUT = 120_000;

const PRECACHE = self.__PRECACHE__;
const CACHE_PREFIX = "trails-playground-";
const cacheName = PRECACHE ? `${CACHE_PREFIX}${PRECACHE.version}` : null;
const hashed = new Set(PRECACHE ? PRECACHE.files.filter((f) => f.startsWith("assets/")) : []);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== cacheName) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener("message", (event) => {
  if (event.data?.type === "sw:precache" && cacheName) event.waitUntil(precache());
});

async function precache() {
  const cache = await caches.open(cacheName);
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const missing = ["", ...PRECACHE.files].filter((f) => !have.has(`${base}${f}`));
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.allSettled(missing.slice(i, i + 8).map((f) => cache.add(`${base}${f}`)));
  }
}

async function offline(request, url) {
  const cache = await caches.open(cacheName);
  const file = url.pathname.slice(base.length);
  if (hashed.has(file)) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
  }
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const hit = await cache.match(url.pathname);
    if (hit) return hit;
    throw error;
  }
  if (response.status === 200) {
    await cache.put(url.pathname, response.clone()).catch(() => null);
  }
  return response;
}

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
    return;
  }
  if (cacheName && event.request.method === "GET" && url.pathname.startsWith(base)) {
    event.respondWith(offline(event.request, url));
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
    const timer = setTimeout(() => resolve(null), ANSWER_TIMEOUT);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data);
    };
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
