import { MockRequest } from "@blazetrails/rack";
import { File, FileUtils, Open3, Pathname, Process, setEnv } from "@blazetrails/ruby-compat";
import { ViteAssets } from "@blazetrails/vite-assets";
import { describe, expect, it } from "vitest";

setEnv("VITE_RUBY_SKIP_COMPATIBILITY_CHECK", "true");

const vite = new URL("../node_modules/.bin/vite", import.meta.url).pathname;

describe("trails server in front of bin/vite dev", () => {
  it("fetches a Vite-served asset through DevServerProxy", async () => {
    const root = new Pathname(new URL("../tmp/", import.meta.url).pathname).join(
      crypto.randomUUID(),
    );
    const port = 30000 + Math.floor(Math.random() * 20000);
    await FileUtils.mkdirPAsync(root.join("config").toString());
    await FileUtils.mkdirPAsync(root.join("app/frontend").toString());
    await File.writeAsync(
      root.join("config/vite.json").toString(),
      JSON.stringify({
        all: { sourceCodeDir: "app/frontend" },
        development: { port, publicOutputDir: "vite-dev" },
      }),
    );
    await File.writeAsync(
      root.join("vite.config.mjs").toString(),
      `import RubyPlugin from "vite-plugin-ruby";\nexport default { plugins: [RubyPlugin()] };\n`,
    );
    await File.writeAsync(
      root.join("app/frontend/hello.js").toString(),
      "export const hello = 1;\n",
    );

    try {
      await Open3.popen3(
        `${vite} --config vite.config.mjs & echo $!; wait`,
        { chdir: root.toString() },
        async (stdin, stdout) => {
          stdin.close();
          const pid = Number(await stdout.getsAsync());
          try {
            let line: string | null;
            while ((line = await stdout.getsAsync()) != null && !line.includes("ready in"));

            const viteAssets = ViteAssets.reloadWith({
              root: root.toString(),
              mode: "development",
            });
            const app = () => [404, {}, ["not proxied"]];
            const proxy = new ViteAssets.DevServerProxy(app, { viteAssets, streaming: false });
            const [status, , body] = (await proxy.call(
              MockRequest.envFor("/vite-dev/hello.js"),
            )) as [number, unknown, Iterable<string | Uint8Array>];

            expect(status).toBe(200);
            const text = [...body]
              .map((chunk) => (typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)))
              .join("");
            expect(text).toContain("hello = 1");
          } finally {
            Process.kill("TERM", pid);
          }
        },
      );
    } finally {
      await FileUtils.rmRfAsync(root.toString());
    }
  }, 60_000);
});
