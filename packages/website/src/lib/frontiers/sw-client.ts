/**
 * Main-thread client for communicating with the sandbox service worker.
 * Uses MessageChannel for request/response pairs and listens for broadcasts.
 */

import type { SwRequest, SwResponse, SwBroadcast, SwMessageMap } from "./sw-protocol.js";

export interface SwClient {
  /** Send a typed request and get the matching response. */
  send<R extends SwRequest>(request: R): Promise<SwMessageMap[R["type"]]>;
  /** Register a listener for broadcast messages from the SW. */
  onBroadcast(fn: (msg: SwBroadcast) => void): () => void;
  /** Unregister the service worker and clean up listeners. */
  destroy(): Promise<void>;
  /** Whether the SW is connected and ready. */
  readonly ready: boolean;
}

export interface SwClientOptions {
  /** SW script path. Default: "/sandbox-sw.js" */
  swPath?: string;
  /** SW registration scope. Default: "/~dev/" */
  scope?: string;
}

const ACTIVATION_TIMEOUT = 10_000;
const INIT_TIMEOUT = 10_000;
const REQUEST_TIMEOUT = 30_000;

export async function createSwClient(options: SwClientOptions = {}): Promise<SwClient> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Service workers not supported");
  }

  const swPath = options.swPath ?? "/sandbox-sw.js";
  const scope = options.scope ?? "/~dev/";

  const reg = await navigator.serviceWorker.register(swPath, { scope });

  const broadcastListeners: Array<(msg: SwBroadcast) => void> = [];

  function handleBroadcast(event: MessageEvent) {
    const data = event.data as SwBroadcast;
    if (data?.type === "vfs:changed" || data?.type === "db:changed") {
      for (const fn of broadcastListeners) fn(data);
    }
  }

  async function teardown() {
    navigator.serviceWorker.removeEventListener("message", handleBroadcast);
    broadcastListeners.length = 0;
    await reg.unregister();
  }

  try {
    // Wait for activation with a timeout
    await new Promise<void>((resolve, reject) => {
      const worker = reg.active ?? reg.installing ?? reg.waiting;
      if (!worker) {
        reject(new Error("No service worker found after registration"));
        return;
      }
      if (worker.state === "activated") {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        worker.removeEventListener("statechange", onStateChange);
        reject(new Error("Service worker activation timed out"));
      }, ACTIVATION_TIMEOUT);

      function onStateChange() {
        if (worker!.state === "activated") {
          clearTimeout(timer);
          worker!.removeEventListener("statechange", onStateChange);
          resolve();
        }
      }
      worker.addEventListener("statechange", onStateChange);
    });

    navigator.serviceWorker.addEventListener("message", handleBroadcast);

    function getController(): ServiceWorker {
      const sw = navigator.serviceWorker.controller ?? reg.active;
      if (!sw) throw new Error("Service worker not available");
      return sw;
    }

    let isReady = false;

    const client: SwClient = {
      get ready() {
        return isReady;
      },

      async send<R extends SwRequest>(request: R): Promise<SwMessageMap[R["type"]]> {
        const sw = getController();
        return new Promise<SwMessageMap[R["type"]]>((resolve, reject) => {
          const channel = new MessageChannel();

          function cleanup() {
            channel.port1.onmessage = null;
            channel.port1.close();
          }

          const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`SW request timed out: ${request.type}`));
          }, REQUEST_TIMEOUT);

          channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            cleanup();
            const response = event.data as SwResponse;
            if (response.type === "error") {
              reject(new Error((response as { type: "error"; message: string }).message));
            } else if (response.type !== request.type) {
              reject(
                new Error(
                  `SW response type mismatch: expected ${request.type}, received ${response.type}`,
                ),
              );
            } else {
              resolve(response as SwMessageMap[R["type"]]);
            }
          };

          try {
            const transfer: Transferable[] = [channel.port2];
            let message: SwRequest = request;

            if ("data" in request && request.data instanceof Uint8Array) {
              const data = request.data.slice();
              message = { ...request, data } as typeof request;
              transfer.push(data.buffer);
            }

            sw.postMessage(message, transfer);
          } catch (error) {
            clearTimeout(timer);
            channel.port2.close();
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      },

      onBroadcast(fn: (msg: SwBroadcast) => void): () => void {
        broadcastListeners.push(fn);
        return () => {
          const idx = broadcastListeners.indexOf(fn);
          if (idx >= 0) broadcastListeners.splice(idx, 1);
        };
      },

      async destroy() {
        isReady = false;
        await teardown();
      },
    };

    // Send init and wait for ready
    const initRequest = client.send({ type: "init" as const });
    const initResponse = await new Promise<Awaited<typeof initRequest>>((resolve, reject) => {
      const timer = setTimeout(() => {
        void initRequest.catch(() => {});
        reject(new Error("SW init timed out"));
      }, INIT_TIMEOUT);

      void initRequest.then(
        (response) => {
          clearTimeout(timer);
          resolve(response);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });

    if (initResponse.type === "init") {
      isReady = true;
    }

    return client;
  } catch (error) {
    await teardown();
    throw error;
  }
}
