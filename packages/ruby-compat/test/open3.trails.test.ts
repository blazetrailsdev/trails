import { describe, expect, it } from "vitest";
import { Open3 } from "../lib/index.js";

describe("Open3.popen3", () => {
  it("streams stdout lines while the child runs and answers the block's value", async () => {
    const seen: [string, boolean][] = [];
    const result = await Open3.popen3(
      "sh",
      "-c",
      "cat; echo b; sleep 0.3; echo c >&2",
      async (stdin, stdout, stderr, waitThr) => {
        stdin.write("a\n");
        stdin.close();
        let line: string | null;
        while ((line = await stdout.getsAsync()) !== null) seen.push([line, waitThr.isAlive()]);
        const err = new TextDecoder().decode((await stderr.readAsync()) as Uint8Array);
        return [err, (await waitThr.value()).exitstatus()];
      },
    );
    expect(seen).toEqual([
      ["a\n", true],
      ["b\n", true],
    ]);
    expect(result).toEqual(["c\n", 0]);
  });

  it("raises what the spawn failed with", async () => {
    await expect(
      Open3.popen3("definitely-not-a-command-xyz", "arg", () => null),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
