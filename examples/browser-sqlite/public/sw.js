let runtimeId = null;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data?.type === "runtime:hello") {
    runtimeId = event.source.id;
    event.ports[0]?.postMessage({ type: "sw:ok" });
  }
});

function underPreview(url) {
  return url.pathname === "/preview" || url.pathname.startsWith("/preview/");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (underPreview(url) || url.pathname.startsWith("/rt/")) {
    event.respondWith(forward(event.request, url));
    return;
  }
  const referrer = event.request.referrer ? new URL(event.request.referrer) : null;
  if (referrer && referrer.origin === url.origin && underPreview(referrer)) {
    const moved = new URL(`/preview${url.pathname}${url.search}`, url.origin);
    event.respondWith(
      event.request.mode === "navigate"
        ? Response.redirect(moved.href, 302)
        : forward(event.request, moved),
    );
  }
});

async function forward(request, url) {
  const client = runtimeId && (await self.clients.get(runtimeId));
  if (!client) {
    return new Response(
      "<p style='font-family:system-ui'>The trails runtime is not running yet…</p>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
  const body =
    request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer();
  const channel = new MessageChannel();
  const reply = new Promise((resolve) => {
    channel.port1.onmessage = (event) => resolve(event.data);
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
  const { status, headers, body: responseBody } = await reply;
  return new Response(responseBody, { status, headers });
}
