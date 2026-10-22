import { it, expect } from "vitest";
import { ConditionalGet } from "./conditional-get.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";

function conditionalGet(app: any) {
  return new Lint(new ConditionalGet(app));
}

it("set a 304 status and truncate body when if-modified-since hits", async () => {
  const timestamp = new Date().toUTCString();
  const app = conditionalGet(
    (_env: Record<string, any>) => [200, { "last-modified": timestamp }, ["TEST"]] as any,
  );
  const response = await new MockRequest(app).get("/", {
    HTTP_IF_MODIFIED_SINCE: timestamp,
  });
  expect(response.status).toBe(304);
  expect(response.body.length === 0).toBeTruthy();
});

it("set a 304 status and truncate body when if-modified-since hits and is higher than current time", async () => {
  const app = conditionalGet(
    (_env: Record<string, any>) =>
      [200, { "last-modified": new Date(Date.now() - 3600000).toUTCString() }, ["TEST"]] as any,
  );
  const response = await new MockRequest(app).get("/", {
    HTTP_IF_MODIFIED_SINCE: new Date().toUTCString(),
  });
  expect(response.status).toBe(304);
  expect(response.body.length === 0).toBeTruthy();
});

it("closes bodies", async () => {
  let closed = false;
  const body = {
    each(fn: any) {
      fn("TEST");
    },
    close() {
      closed = true;
    },
  };
  const app = conditionalGet(
    (_env: Record<string, any>) =>
      [200, { "last-modified": new Date(Date.now() - 3600000).toUTCString() }, body] as any,
  );
  const response = await new MockRequest(app).get("/", {
    HTTP_IF_MODIFIED_SINCE: new Date().toUTCString(),
  });
  expect(response.status).toBe(304);
  expect(response.body.length === 0).toBeTruthy();
  expect(closed).toBe(true);
});

it("set a 304 status and truncate body when if-none-match hits", async () => {
  const app = conditionalGet(
    (_env: Record<string, any>) => [200, { etag: "1234" }, ["TEST"]] as any,
  );
  const response = await new MockRequest(app).get("/", {
    HTTP_IF_NONE_MATCH: "1234",
  });
  expect(response.status).toBe(304);
  expect(response.body.length === 0).toBeTruthy();
});

it("set a 304 status and truncate body when if-none-match hits but if-modified-since is after last-modified", async () => {
  const app = conditionalGet(
    (_env: Record<string, any>) =>
      [
        200,
        {
          "last-modified": new Date(Date.now() + 3600000).toUTCString(),
          etag: "1234",
          "content-type": "text/plain",
        },
        ["TEST"],
      ] as any,
  );
  const response = await new MockRequest(app).get("/", {
    HTTP_IF_MODIFIED_SINCE: new Date().toUTCString(),
    HTTP_IF_NONE_MATCH: "1234",
  });
  expect(response.status).toBe(304);
  expect(response.body.length === 0).toBeTruthy();
});

it("not set a 304 status if last-modified is too short", async () => {
  const app = conditionalGet(
    (_env: Record<string, any>) =>
      [200, { "last-modified": "1234", "content-type": "text/plain" }, ["TEST"]] as any,
  );
  const response = await new MockRequest(app).get("/", {
    HTTP_IF_MODIFIED_SINCE: new Date().toUTCString(),
  });
  expect(response.status).toBe(200);
  expect(response.body).toBe("TEST");
});

it("not set a 304 status if if-modified-since hits but etag does not", async () => {
  const timestamp = new Date().toUTCString();
  const app = conditionalGet(
    (_env: Record<string, any>) =>
      [
        200,
        { "last-modified": timestamp, etag: "1234", "content-type": "text/plain" },
        ["TEST"],
      ] as any,
  );
  const response = await new MockRequest(app).get("/", {
    HTTP_IF_MODIFIED_SINCE: timestamp,
    HTTP_IF_NONE_MATCH: "4321",
  });
  expect(response.status).toBe(200);
  expect(response.body).toBe("TEST");
});

it("set a 304 status and truncate body when both if-none-match and if-modified-since hits", async () => {
  const timestamp = new Date().toUTCString();
  const app = conditionalGet(
    (_env: Record<string, any>) =>
      [200, { "last-modified": timestamp, etag: "1234" }, ["TEST"]] as any,
  );
  const response = await new MockRequest(app).get("/", {
    HTTP_IF_MODIFIED_SINCE: timestamp,
    HTTP_IF_NONE_MATCH: "1234",
  });
  expect(response.status).toBe(304);
  expect(response.body.length === 0).toBeTruthy();
});

it("not affect non-GET/HEAD requests", async () => {
  const app = conditionalGet(
    (_env: Record<string, any>) =>
      [200, { etag: "1234", "content-type": "text/plain" }, ["TEST"]] as any,
  );
  const response = await new MockRequest(app).post("/", {
    HTTP_IF_NONE_MATCH: "1234",
  });
  expect(response.status).toBe(200);
  expect(response.body).toBe("TEST");
});

it("not affect non-200 requests", async () => {
  const app = conditionalGet(
    (_env: Record<string, any>) =>
      [302, { etag: "1234", "content-type": "text/plain" }, ["TEST"]] as any,
  );
  const response = await new MockRequest(app).get("/", {
    HTTP_IF_NONE_MATCH: "1234",
  });
  expect(response.status).toBe(302);
  expect(response.body).toBe("TEST");
});

it("not affect requests with malformed HTTP_IF_NONE_MATCH", async () => {
  const badTimestamp = new Date().toISOString().replace("T", " ").slice(0, 19) + " +0000";
  const app = conditionalGet(
    (_env: Record<string, any>) =>
      [
        200,
        {
          "last-modified": new Date(Date.now() - 3600000).toUTCString(),
          "content-type": "text/plain",
        },
        ["TEST"],
      ] as any,
  );
  const response = await new MockRequest(app).get("/", {
    HTTP_IF_MODIFIED_SINCE: badTimestamp,
  });
  expect(response.status).toBe(200);
  expect(response.body).toBe("TEST");
});
