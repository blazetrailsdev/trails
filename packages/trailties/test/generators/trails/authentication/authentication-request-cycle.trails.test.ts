import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getProcessAdapter } from "@blazetrails/ruby-compat";
import { AppGenerator } from "../../../../lib/generators/trails/app/app-generator.js";
import { AuthenticationGenerator } from "../../../../lib/generators/trails/authentication/authentication-generator.js";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const REQUEST_CYCLE = `import { Trails } from "@blazetrails/trailties";
import { StringIO } from "@blazetrails/ruby-compat";

await import("./config/environment.ts");
const { User } = await import("./app/models/user.ts");
const { Session } = await import("./app/models/session.ts");

await User.create({ email_address: "one@example.com", password: "password" });

const app = Trails.application!;
const request = async (method: string, path: string, env: Record<string, unknown> = {}) => {
  const [status, headers] = await app.call({
    REQUEST_METHOD: method,
    PATH_INFO: path,
    HTTP_HOST: "example.com",
    ...env,
  });
  return { status, headers: headers as Record<string, string> };
};

const body = "email_address=one%40example.com&password=password";
const signIn = await request("POST", "/session", {
  CONTENT_TYPE: "application/x-www-form-urlencoded",
  CONTENT_LENGTH: String(body.length),
  "rack.input": new StringIO(body),
});
const cookie = signIn.headers["set-cookie"].split(";")[0];
const sessionsAfterSignIn = await Session.count();

const anonymous = await request("DELETE", "/session");
const sessionsAfterAnonymous = await Session.count();

const signOut = await request("DELETE", "/session", { HTTP_COOKIE: cookie });

console.log(
  JSON.stringify({
    signIn,
    sessionsAfterSignIn,
    anonymous,
    sessionsAfterAnonymous,
    signOut,
    sessionsAfterSignOut: await Session.count(),
  }),
);`;

describe("AuthenticationGenerator in a generated app", () => {
  it("signs in, resumes the session from its signed cookie, and signs out", async () => {
    const root = fs.mkdtempSync(path.join(PACKAGE_DIR, "tmp-auth-request-cycle-"));
    try {
      await new AppGenerator(
        ["my-app"],
        { skipInstall: true, database: "sqlite", skipActionMailer: false },
        { destinationRoot: root },
      ).invokeAll();
      const app = path.join(root, "my-app");
      fs.mkdirSync(path.join(app, "node_modules/@blazetrails"), { recursive: true });
      const { dependencies } = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
      for (const name of [...Object.keys(dependencies), "@blazetrails/bcrypt"]) {
        if (!name.startsWith("@blazetrails/")) continue;
        fs.symlinkSync(
          path.resolve(PACKAGE_DIR, "..", name.slice("@blazetrails/".length)),
          path.join(app, "node_modules", name),
        );
      }
      const generator = new AuthenticationGenerator([], {}, { destinationRoot: app });
      const executeCommand = generator.executeCommand.bind(generator);
      generator.executeCommand = async (executor, command, ...rest) => {
        if (command !== "add @blazetrails/bcrypt")
          return executeCommand(executor, command, ...rest);
        const manifest = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
        manifest.dependencies["@blazetrails/bcrypt"] = "*";
        fs.writeFileSync(path.join(app, "package.json"), JSON.stringify(manifest, null, 2));
      };
      await generator.invokeAll();
      fs.writeFileSync(path.join(app, "request-cycle.ts"), REQUEST_CYCLE);

      const node = (args: string[]) =>
        spawnSync(getProcessAdapter().execPath!(), args, {
          cwd: app,
          encoding: "utf8",
          env: { PATH: "", TRAILS_ENV: "test" },
        });
      const migrate = node([path.join(app, "bin", "trails"), "db:migrate"]);
      expect(migrate.status).toBe(0);

      const run = node([path.join(app, "request-cycle.ts")]);
      expect(run.status).toBe(0);
      const result = JSON.parse(run.stdout.trim().split("\n").at(-1)!);

      expect(result.signIn.status).toBe(302);
      expect(result.signIn.headers.location).toBe("http://example.com/");
      expect(result.signIn.headers["set-cookie"]).toMatch(/^session_id=[^;]+--[0-9a-f]+;/);
      expect(result.signIn.headers["set-cookie"]).toMatch(/; httponly; samesite=lax/);
      const expires = /expires=([^;]+)/.exec(result.signIn.headers["set-cookie"])![1];
      expect(new Date(expires).getUTCFullYear()).toBeGreaterThan(new Date().getUTCFullYear() + 19);
      expect(result.sessionsAfterSignIn).toBe(1);

      expect(result.anonymous.status).toBe(302);
      expect(result.anonymous.headers.location).toBe("http://example.com/session/new");
      expect(result.sessionsAfterAnonymous).toBe(1);

      expect(result.signOut.status).toBe(302);
      expect(result.signOut.headers.location).toBe("http://example.com/session/new");
      expect(result.signOut.headers["set-cookie"]).toMatch(/^session_id=; .*max-age=0/);
      expect(result.sessionsAfterSignOut).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});
