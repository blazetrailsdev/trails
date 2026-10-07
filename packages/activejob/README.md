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
uses the repo's one constant mechanism, and nothing of its own. Today only
`ActiveJob::Base` is ported and seated. The rest of this section is the rule
each story that ports a file follows:

- **A framework class is seated by its defining module** with
  `rbModConstSet(Owner, "Name", klass)` from `@blazetrails/ruby-compat`, on the
  namespace object from `src/namespaces.ts`, as `base.ts` does with
  `rbModConstSet(ActiveJob, "Base", Base)`. A serializer is seated on
  `Serializers`, an adapter on `QueueAdapters`, an error class on `ActiveJob`.
  As Ruby's `const_set` does, the seat is also what names the class:
  `ActiveJob::Base`.
- **`self.class.name` is ported as `rbModName(this.constructor)`**, Ruby's
  `Module#name`. A call site does not read `constructor.name` itself:
  `ActiveJob.adapter_name` `demodulize`s the full path (`queue_adapter.rb:11`).
  `rbModName` answers the seated path, and for a class with no seat falls back
  to the name its definition gave it, which then has no seat for `constantize`
  to find.
- **`constantize` resolves the path** by walking the seats: `ActiveJob`, then
  `Base`.
- **A job class defined outside the framework is registered under its Ruby
  name** with `registerConstant("HelloJob", HelloJob)`, which seats it at the
  top level and names it. A namespaced job is registered under its full path,
  `registerConstant("Admin::HelloJob", HelloJob)`.

A job class that was never registered is an unloadable constant: `constantize`
raises `NameError` (`uninitialized constant HelloJob`).
`Core::ClassMethods#deserialize` has no rescue around its `constantize`
(`core.rb:63`), so its port must let that `NameError` propagate.
