// The scaffold, end to end, over HTTP: create, list, show, delete.
//
// `08` answers `/up`, which renders no view, opens no connection and checks no
// token. This rung drives the generated `TrailsController` the way a browser
// does: GET the form, carry its session cookie and authenticity token into the
// POST, follow the redirect, list, show, then delete through `_method=delete`
// and confirm the record is gone. Every step prints one `[09]` line, and the
// final `[09] crud=ok` line is printed only when all of them held.
//
// The database is `storage/production.sqlite3`; the check script recreates it
// with the `trails` table before each run.
import { Handler } from "@blazetrails/rackup";
import { Trails } from "@blazetrails/trailties";
import "@blazetrails/rackup/dist/handler/node.js";
import "./views-manifest.js";
import "../../.trails/entry.generated.js";

const app = Trails.application!;
const railsApp = (env: Record<string, unknown>) => app.call(env);
const server = await Handler.Node.run(railsApp, { Port: 3179, Host: "127.0.0.1" });
const address = server.address();
const port = address && typeof address === "object" ? address.port : 3179;
const base = `http://127.0.0.1:${port}`;

const jar = new Map<string, string>();
function remember(res: Response): void {
  const all = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const line of all) {
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}
function cookieHeader(): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function request(method: string, path: string, form?: Record<string, string>) {
  const headers: Record<string, string> = { cookie: cookieHeader() };
  let body: string | undefined;
  if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  const res = await fetch(`${base}${path}`, { method, headers, body, redirect: "manual" });
  remember(res);
  const text = await res.text();
  return { status: res.status, location: res.headers.get("location") ?? "", text };
}
function token(html: string): string {
  const m = /name="authenticity_token" value="([^"]+)"/.exec(html);
  return m ? m[1] : "";
}

let ok = true;
function step(name: string, pass: boolean, detail: string): void {
  if (!pass) ok = false;
  console.log(`[09] ${name} ${pass ? "ok" : "FAIL"} ${detail}`);
}

const form = await request("GET", "/trails/new");
const csrf = token(form.text);
step("new", form.status === 200 && csrf !== "", `status=${form.status} token=${csrf.length}`);

const created = await request("POST", "/trails", {
  authenticity_token: csrf,
  "trail[name]": "Ridge Loop",
  "trail[length]": "12",
});
const idMatch = /\/trails\/(\d+)$/.exec(created.location);
const id = idMatch ? idMatch[1] : "";
step(
  "create",
  created.status === 302 && id !== "",
  `status=${created.status} location=${created.location}`,
);

const list = await request("GET", "/trails");
step("index", list.status === 200 && list.text.includes("Ridge Loop"), `status=${list.status}`);

const shown = await request("GET", `/trails/${id}`);
step(
  "show",
  shown.status === 200 && shown.text.includes("Ridge Loop") && shown.text.includes("12"),
  `status=${shown.status}`,
);

const deleted = await request("POST", `/trails/${id}`, {
  authenticity_token: token(shown.text) || csrf,
  _method: "delete",
});
step("destroy", deleted.status === 303, `status=${deleted.status} location=${deleted.location}`);

const gone = await request("GET", `/trails/${id}`);
const after = await request("GET", "/trails");
step(
  "gone",
  gone.status === 404 && !after.text.includes("Ridge Loop"),
  `show=${gone.status} index=${after.status}`,
);

console.log(`[09] crud=${ok ? "ok" : "FAIL"}`);
await Handler.Node.shutdown();
