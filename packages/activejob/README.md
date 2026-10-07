# @blazetrails/activejob

The port of Rails' `activejob` gem (`vendor/rails/v8.0.2/activejob/`).

## Constant names

Job data names classes by their Ruby constant path and resolves them again
with `constantize`: `Core#serialize` writes `"job_class" => self.class.name`
(`vendor/rails/v8.0.2/activejob/lib/active_job/core.rb:109`) and
`Core::ClassMethods#deserialize` reads it back with
`job_data["job_class"].constantize` (`:63`);
`ObjectSerializer#serialize` writes `"_aj_serialized" => self.class.name`
(`serializers/object_serializer.rb:40`) and `Serializers.deserialize` resolves
it with `safe_constantize` (`serializers.rb:43`).

A JS class's own `name` is only the last segment of that path, so ActiveJob
uses the repo's one constant mechanism, and nothing of its own:

- **A framework class is seated by its defining module** with
  `rbModConstSet(Owner, "Name", klass)` from `@blazetrails/ruby-compat`, on the
  namespace object from `src/namespaces.ts`:
  `rbModConstSet(ActiveJob, "Base", Base)` in `base.ts`,
  `rbModConstSet(Serializers, "SymbolSerializer", SymbolSerializer)` in
  `serializers/symbol-serializer.ts`. As Ruby's `const_set` does, the seat is
  also what names the class: `ActiveJob::Serializers::SymbolSerializer`.
- **`self.class.name` is `rbModName(this.constructor)`**, Ruby's `Module#name`.
  Every site that writes or logs a class name reads it there, and never reads
  `constructor.name`: `ActiveJob.adapter_name` `demodulize`s the full path
  (`queue_adapter.rb:11`).
- **`constantize` resolves the path** by walking the seats: `ActiveJob`, then
  `Serializers`, then `SymbolSerializer`.
- **A job class defined outside the framework is registered under its Ruby
  name** with `registerConstant("HelloJob", HelloJob)`, which seats it at the
  top level and names it. A namespaced job is registered under its full path,
  `registerConstant("Admin::HelloJob", HelloJob)`.

A job class that was never registered is an unloadable constant:
`constantize` raises `NameError` (`uninitialized constant HelloJob`), and
`deserialize` lets it propagate, as Rails does.
