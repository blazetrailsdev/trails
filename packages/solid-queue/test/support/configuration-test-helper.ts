import { capture } from "@blazetrails/activesupport/testing/stream";
import { TopLevel } from "@blazetrails/activesupport";
import { File, env, setEnv } from "@blazetrails/ruby-compat";

export function configFilePath(name: string): string {
  return File.join(TopLevel.Trails!.root()!, `config/${name}.yml`);
}

export async function withEnv(
  envVars: { [key: string]: string | undefined },
  block: () => Promise<void>,
) {
  const originalValues: { [key: string]: string | undefined } = {};
  try {
    for (const [key, value] of Object.entries(envVars)) {
      originalValues[key] = env[key];
      setEnv(key, value);
    }

    await block();
  } finally {
    for (const [key, value] of Object.entries(originalValues)) setEnv(key, value);
  }
}

export async function captureIo(block: () => Promise<void>): Promise<[string, string]> {
  let err = "";
  const out = await capture("stdout", async () => {
    err = await capture("stderr", block);
  });
  return [out, err];
}
