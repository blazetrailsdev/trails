# frozen_string_literal: true

builder.run(function (env) { return [200, { "content-type": "text/plain" }, [new Error().stack.split("\n")[1].match(/:(\d+):\d+\)?$/)[1]]]; });
