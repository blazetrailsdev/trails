# Ruby-side schema parity dumper

## Setup

```sh
cd scripts/parity/schema/ruby
bundle install     # generates Gemfile.lock — commit it after first run
```

## Running

From the **repo root**:

```sh
bundle exec --gemfile scripts/parity/schema/ruby/Gemfile \
  ruby scripts/parity/schema/ruby/dump.rb \
  scripts/parity/fixtures/01-trivial \
  /tmp/rails-01.json
```

## Tests

```sh
bundle exec --gemfile scripts/parity/schema/ruby/Gemfile \
  ruby scripts/parity/schema/ruby/canonicalize_test.rb
```

## Gemfile.lock

`Gemfile.lock` is not committed in this PR because it requires network
access to RubyGems to resolve. Generate it with `bundle install` from
this directory, then commit it. The CI wiring (added in PR6) will run
`bundle install` from this Gemfile on each push; a committed lock file
is required for reproducible installs.
