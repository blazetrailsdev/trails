# frozen_string_literal: true

#\ -d -p 2929 --env test
builder.run(function (env) { return [200, { "content-type": "text/plain" }, ["OK"]]; });
