# frozen_string_literal: true

builder.run({
  call(env) {
    return [200, { "content-type": "text/plain" }, ["OK"]];
  },
});
