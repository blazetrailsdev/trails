---
title: Guides
description: Guides for Trails, laid out on the Rails Guides table of contents.
---

# Guides

These guides follow the sections and order of the Rails Guides table of contents
(`vendor/rails/v8.0.2/guides/source/documents.yaml`). The Rails Guides are a structural
reference only: they are CC BY-SA 4.0 and trails documentation is CC BY 4.0, so every
trails guide is written from scratch and no Rails Guides prose is copied or adapted
([LICENSES.md](https://github.com/blazetrailsdev/trails/blob/main/LICENSES.md)).

Coming from Rails? Start with [**Trails Idioms**](./idioms.md), the one-page translation
of naming, async, options-object and block conventions every guide uses. Each package's
ratified deviations from Rails are on its [package page](/packages/).

## Start Here

| Rails guide                | Trails guide                                                                                                                                    | Packages                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Getting Started with Rails | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-getting-started-guide.md)) | [trailties](/packages/trailties), [activerecord](/packages/activerecord), [actionpack](/packages/actionpack), [actionview](/packages/actionview) |
| Install Ruby on Rails      | Not applicable: trails installs with pnpm; the Node setup is in [Getting Started](#start-here).                                                 | —                                                                                                                                                |

## Models

| Rails guide                   | Trails guide                                                                                                                                              | Packages                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Active Record Basics          | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-record-basics.md))      | [activerecord](/packages/activerecord)                                       |
| Active Record Migrations      | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-record-migrations.md))  | [activerecord](/packages/activerecord)                                       |
| Active Record Validations     | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-record-validations.md)) | [activerecord](/packages/activerecord), [activemodel](/packages/activemodel) |
| Active Record Callbacks       | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-record-callbacks.md))   | [activerecord](/packages/activerecord), [activemodel](/packages/activemodel) |
| Active Record Associations    | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-association-basics.md))        | [activerecord](/packages/activerecord)                                       |
| Active Record Query Interface | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-record-querying.md))    | [activerecord](/packages/activerecord), [arel](/packages/arel)               |
| Active Model Basics           | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-model-basics.md))       | [activemodel](/packages/activemodel)                                         |

## Views

| Rails guide                    | Trails guide                                                                                                                                          | Packages                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Action View Overview           | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-action-view-overview.md))  | [actionview](/packages/actionview)                                     |
| Layouts and Rendering in Rails | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-layouts-and-rendering.md)) | [actionview](/packages/actionview), [actionpack](/packages/actionpack) |
| Action View Helpers            | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-action-view-helpers.md))   | [actionview](/packages/actionview)                                     |
| Action View Form Helpers       | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-form-helpers.md))          | [actionview](/packages/actionview)                                     |

## Controllers

| Rails guide                       | Trails guide                                                                                                                                                      | Packages                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Action Controller Overview        | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-action-controller-overview.md))        | [actionpack](/packages/actionpack) |
| Action Controller Advanced Topics | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-action-controller-advanced-topics.md)) | [actionpack](/packages/actionpack) |
| Rails Routing from the Outside In | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-routing.md))                           | [actionpack](/packages/actionpack) |

## Other Components

| Rails guide                    | Trails guide                                                                                                                                                   | Packages                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Active Support Core Extensions | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-support-core-extensions.md)) | [activesupport](/packages/activesupport)                                                 |
| Action Mailer Basics           | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-action-mailer-basics.md))           | [actionmailer](/packages/actionmailer), [mail](/packages/mail)                           |
| Action Mailbox Basics          | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-action-mailbox-basics.md))          | [actionmailbox](/packages/actionmailbox)                                                 |
| Action Text Overview           | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-action-text-overview.md))           | [actiontext](/packages/actiontext)                                                       |
| Active Job Basics              | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-job-basics.md))              | [activejob](/packages/activejob), [solid-queue](/packages/solid-queue)                   |
| Active Storage Overview        | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-storage-overview.md))        | [activestorage](/packages/activestorage), [image-processing](/packages/image-processing) |
| Action Cable Overview          | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-action-cable-overview.md))          | [actioncable](/packages/actioncable), [solid-cable](/packages/solid-cable)               |

## Digging Deeper

| Rails guide                           | Trails guide                                                                                                                                                        | Packages                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Rails Internationalization (I18n) API | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-i18n.md))                                | [i18n](/packages/i18n), [activesupport](/packages/activesupport)                                                                     |
| Testing Rails Applications            | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-testing.md))                             | [trailties](/packages/trailties), [actionpack](/packages/actionpack), [activesupport](/packages/activesupport)                       |
| Debugging Rails Applications          | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-debugging-rails-applications.md))        | [trailties](/packages/trailties), [activesupport](/packages/activesupport)                                                           |
| Configuring Rails Applications        | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-configuring.md))                         | [trailties](/packages/trailties)                                                                                                     |
| The Rails Command Line                | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-command-line.md))                        | [trailties](/packages/trailties), [thor](/packages/thor), [rake](/packages/rake)                                                     |
| The Asset Pipeline                    | Not applicable: trails serves assets through Vite, not propshaft or importmap-rails (root `CLAUDE.md`, "importmap-rails and propshaft are out of scope").           | —                                                                                                                                    |
| Working with JavaScript in Rails      | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-working-with-javascript-in-rails.md))    | [vite-assets](/packages/vite-assets), [vite-trails](/packages/vite-trails), [turbo](/packages/turbo), [stimulus](/packages/stimulus) |
| The Rails Initialization Process      | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-initialization.md))                      | [trailties](/packages/trailties)                                                                                                     |
| Autoloading and Reloading             | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-autoloading-and-reloading-constants.md)) | [zeitwerk](/packages/zeitwerk), [trailties](/packages/trailties)                                                                     |
| Active Support Instrumentation        | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-support-instrumentation.md))      | [activesupport](/packages/activesupport)                                                                                             |
| Using Rails for API-only Applications | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-api-app.md))                             | [actionpack](/packages/actionpack), [trailties](/packages/trailties)                                                                 |

## Going to Production

| Rails guide                           | Trails guide                                                                                                                                                      | Packages                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Tuning Performance for Deployment     | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-tuning-performance-for-deployment.md)) | [trailties](/packages/trailties), [activerecord](/packages/activerecord)                                             |
| Caching with Rails: An Overview       | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-caching-with-rails.md))                | [activesupport](/packages/activesupport), [actionview](/packages/actionview), [solid-cache](/packages/solid-cache)   |
| Securing Rails Applications           | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-security.md))                          | [actionpack](/packages/actionpack), [activerecord](/packages/activerecord), [activesupport](/packages/activesupport) |
| Error Reporting in Rails Applications | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-error-reporting.md))                   | [activesupport](/packages/activesupport)                                                                             |

## Advanced Active Record

| Rails guide                  | Trails guide                                                                                                                                                         | Packages                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Active Record and PostgreSQL | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-record-postgresql.md))             | [activerecord](/packages/activerecord), [pg](/packages/pg) |
| Multiple Databases           | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-record-multiple-databases.md))     | [activerecord](/packages/activerecord)                     |
| Active Record Encryption     | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-record-encryption.md))             | [activerecord](/packages/activerecord)                     |
| Composite Primary Keys       | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-active-record-composite-primary-keys.md)) | [activerecord](/packages/activerecord)                     |

## Extending Rails

| Rails guide                                           | Trails guide                                                                                                                                                 | Packages                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| The Basics of Creating Rails Plugins                  | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-plugins.md))                      | [trailties](/packages/trailties)                                                             |
| Rails on Rack                                         | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-rails-on-rack.md))                | [rack](/packages/rack), [actionpack](/packages/actionpack), [trailties](/packages/trailties) |
| Creating and Customizing Rails Generators & Templates | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-generators.md))                   | [trailties](/packages/trailties), [thor](/packages/thor)                                     |
| Getting Started with Engines                          | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-engines.md))                      | [trailties](/packages/trailties)                                                             |
| Rails Application Templates                           | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-rails-application-templates.md))  | [trailties](/packages/trailties), [thor](/packages/thor)                                     |
| Threading and Code Execution in Rails                 | Not yet written ([story](https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0247-website-refresh/stories/website-guide-threading-and-code-execution.md)) | [activesupport](/packages/activesupport), [trailties](/packages/trailties)                   |

## Contributing

How trails is built and how to port a Rails file: [CONTRIBUTING.md](https://github.com/blazetrailsdev/trails/blob/main/CONTRIBUTING.md).
