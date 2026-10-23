# frozen_string_literal: true

builder.run(function (env) {
  const body = "frozen";
  if (!Object.isFrozen(body)) throw new Error("Not frozen!");
  return [200, { "content-type": "text/plain" }, [body]];
});
