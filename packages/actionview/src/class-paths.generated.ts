import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./base.js";
import * as m1 from "./buffers.js";
import * as m2 from "./cache-expiry.js";
import * as m3 from "./dependency-tracker.js";
import * as m4 from "./dependency-tracker/tse-tracker.js";
import * as m5 from "./dependency-tracker/wildcard-resolver.js";
import * as m6 from "./digestor.js";
import * as m7 from "./flows.js";
import * as m8 from "./helpers/cache-helper.js";
import * as m9 from "./helpers/date-helper.js";
import * as m10 from "./helpers/number-helper.js";
import * as m11 from "./helpers/tag-helper.js";
import * as m12 from "./helpers/tags/base.js";
import * as m13 from "./helpers/tags/check-box.js";
import * as m14 from "./helpers/tags/collection-check-boxes.js";
import * as m15 from "./helpers/tags/collection-helpers.js";
import * as m16 from "./helpers/tags/collection-radio-buttons.js";
import * as m17 from "./helpers/tags/collection-select.js";
import * as m18 from "./helpers/tags/color-field.js";
import * as m19 from "./helpers/tags/date-field.js";
import * as m20 from "./helpers/tags/date-select.js";
import * as m21 from "./helpers/tags/datetime-field.js";
import * as m22 from "./helpers/tags/datetime-local-field.js";
import * as m23 from "./helpers/tags/datetime-select.js";
import * as m24 from "./helpers/tags/email-field.js";
import * as m25 from "./helpers/tags/file-field.js";
import * as m26 from "./helpers/tags/grouped-collection-select.js";
import * as m27 from "./helpers/tags/hidden-field.js";
import * as m28 from "./helpers/tags/label.js";
import * as m29 from "./helpers/tags/month-field.js";
import * as m30 from "./helpers/tags/number-field.js";
import * as m31 from "./helpers/tags/password-field.js";
import * as m32 from "./helpers/tags/radio-button.js";
import * as m33 from "./helpers/tags/range-field.js";
import * as m34 from "./helpers/tags/search-field.js";
import * as m35 from "./helpers/tags/select.js";
import * as m36 from "./helpers/tags/tel-field.js";
import * as m37 from "./helpers/tags/text-area.js";
import * as m38 from "./helpers/tags/text-field.js";
import * as m39 from "./helpers/tags/time-field.js";
import * as m40 from "./helpers/tags/time-select.js";
import * as m41 from "./helpers/tags/time-zone-select.js";
import * as m42 from "./helpers/tags/translator.js";
import * as m43 from "./helpers/tags/url-field.js";
import * as m44 from "./helpers/tags/week-field.js";
import * as m45 from "./helpers/tags/weekday-select.js";
import * as m46 from "./helpers/text-helper.js";
import * as m47 from "./log-subscriber.js";
import * as m48 from "./lookup-context.js";
import * as m49 from "./path-set.js";
import * as m50 from "./renderer/abstract-renderer.js";
import * as m51 from "./renderer/collection-renderer.js";
import * as m52 from "./renderer/object-renderer.js";
import * as m53 from "./renderer/partial-renderer.js";
import * as m54 from "./renderer/renderer.js";
import * as m55 from "./renderer/streaming-template-renderer.js";
import * as m56 from "./renderer/template-renderer.js";
import * as m57 from "./rendering.js";
import * as m58 from "./template-details.js";
import * as m59 from "./template-path.js";
import * as m60 from "./template.js";
import * as m61 from "./template/error.js";
import * as m62 from "./template/handlers/html.js";
import * as m63 from "./template/handlers/raw.js";
import * as m64 from "./template/handlers/tse.js";
import * as m65 from "./template/html.js";
import * as m66 from "./template/inline.js";
import * as m67 from "./template/raw-file.js";
import * as m68 from "./template/renderable.js";
import * as m69 from "./template/resolver.js";
import * as m70 from "./template/sources/file.js";
import * as m71 from "./template/text.js";
import * as m72 from "./template/types.js";
import * as m73 from "./testing/resolvers.js";
import * as m74 from "./unbound-template.js";

registerClassPaths([
  [() => m50.AbstractRenderer, "ActionView::AbstractRenderer"],
  [() => m50.RenderedCollection, "ActionView::AbstractRenderer::RenderedCollection"],
  [() => m50.EmptyCollection, "ActionView::AbstractRenderer::RenderedCollection::EmptyCollection"],
  [() => m50.RenderedTemplate, "ActionView::AbstractRenderer::RenderedTemplate"],
  [() => m61.ActionViewError, "ActionView::ActionViewError"],
  [() => m0.Base, "ActionView::Base"],
  [() => m2.ViewReloader, "ActionView::CacheExpiry::ViewReloader"],
  [() => m51.CollectionRenderer, "ActionView::CollectionRenderer"],
  [() => m51.CollectionIterator, "ActionView::CollectionRenderer::CollectionIterator"],
  [() => m51.MixedCollectionIterator, "ActionView::CollectionRenderer::MixedCollectionIterator"],
  [
    () => m51.PreloadCollectionIterator,
    "ActionView::CollectionRenderer::PreloadCollectionIterator",
  ],
  [() => m51.SameCollectionIterator, "ActionView::CollectionRenderer::SameCollectionIterator"],
  [() => m3.DependencyTracker, "ActionView::DependencyTracker"],
  [() => m4.TSETracker, "ActionView::DependencyTracker::TSETracker"],
  [() => m5.WildcardResolver, "ActionView::DependencyTracker::WildcardResolver"],
  [() => m6.Digestor, "ActionView::Digestor"],
  [() => m6.Injected, "ActionView::Digestor::Injected"],
  [() => m6.Missing, "ActionView::Digestor::Missing"],
  [() => m6.Node, "ActionView::Digestor::Node"],
  [() => m6.NullLogger, "ActionView::Digestor::NullLogger"],
  [() => m6.Partial, "ActionView::Digestor::Partial"],
  [() => m61.EncodingError, "ActionView::EncodingError"],
  [() => m69.FileSystemResolver, "ActionView::FileSystemResolver"],
  [() => m73.FixtureResolver, "ActionView::FixtureResolver"],
  [() => m8.UncacheableFragmentError, "ActionView::Helpers::CacheHelper::UncacheableFragmentError"],
  [() => m9.DateTimeSelector, "ActionView::Helpers::DateTimeSelector"],
  [() => m10.InvalidNumberError, "ActionView::Helpers::NumberHelper::InvalidNumberError"],
  [() => m11.TagBuilder, "ActionView::Helpers::TagHelper::TagBuilder"],
  [() => m12.Base, "ActionView::Helpers::Tags::Base"],
  [() => m13.CheckBox, "ActionView::Helpers::Tags::CheckBox"],
  [() => m14.CollectionCheckBoxes, "ActionView::Helpers::Tags::CollectionCheckBoxes"],
  [() => m14.CheckBoxBuilder, "ActionView::Helpers::Tags::CollectionCheckBoxes::CheckBoxBuilder"],
  [() => m15.Builder, "ActionView::Helpers::Tags::CollectionHelpers::Builder"],
  [() => m16.CollectionRadioButtons, "ActionView::Helpers::Tags::CollectionRadioButtons"],
  [
    () => m16.RadioButtonBuilder,
    "ActionView::Helpers::Tags::CollectionRadioButtons::RadioButtonBuilder",
  ],
  [() => m17.CollectionSelect, "ActionView::Helpers::Tags::CollectionSelect"],
  [() => m18.ColorField, "ActionView::Helpers::Tags::ColorField"],
  [() => m19.DateField, "ActionView::Helpers::Tags::DateField"],
  [() => m20.DateSelect, "ActionView::Helpers::Tags::DateSelect"],
  [() => m21.DatetimeField, "ActionView::Helpers::Tags::DatetimeField"],
  [() => m22.DatetimeLocalField, "ActionView::Helpers::Tags::DatetimeLocalField"],
  [() => m23.DatetimeSelect, "ActionView::Helpers::Tags::DatetimeSelect"],
  [() => m24.EmailField, "ActionView::Helpers::Tags::EmailField"],
  [() => m25.FileField, "ActionView::Helpers::Tags::FileField"],
  [() => m26.GroupedCollectionSelect, "ActionView::Helpers::Tags::GroupedCollectionSelect"],
  [() => m27.HiddenField, "ActionView::Helpers::Tags::HiddenField"],
  [() => m28.Label, "ActionView::Helpers::Tags::Label"],
  [() => m28.LabelBuilder, "ActionView::Helpers::Tags::Label::LabelBuilder"],
  [() => m29.MonthField, "ActionView::Helpers::Tags::MonthField"],
  [() => m30.NumberField, "ActionView::Helpers::Tags::NumberField"],
  [() => m31.PasswordField, "ActionView::Helpers::Tags::PasswordField"],
  [() => m32.RadioButton, "ActionView::Helpers::Tags::RadioButton"],
  [() => m33.RangeField, "ActionView::Helpers::Tags::RangeField"],
  [() => m34.SearchField, "ActionView::Helpers::Tags::SearchField"],
  [() => m35.Select, "ActionView::Helpers::Tags::Select"],
  [() => m36.TelField, "ActionView::Helpers::Tags::TelField"],
  [() => m37.TextArea, "ActionView::Helpers::Tags::TextArea"],
  [() => m38.TextField, "ActionView::Helpers::Tags::TextField"],
  [() => m39.TimeField, "ActionView::Helpers::Tags::TimeField"],
  [() => m40.TimeSelect, "ActionView::Helpers::Tags::TimeSelect"],
  [() => m41.TimeZoneSelect, "ActionView::Helpers::Tags::TimeZoneSelect"],
  [() => m42.Translator, "ActionView::Helpers::Tags::Translator"],
  [() => m43.UrlField, "ActionView::Helpers::Tags::UrlField"],
  [() => m45.WeekdaySelect, "ActionView::Helpers::Tags::WeekdaySelect"],
  [() => m44.WeekField, "ActionView::Helpers::Tags::WeekField"],
  [() => m46.Cycle, "ActionView::Helpers::TextHelper::Cycle"],
  [() => m57.I18nProxy, "ActionView::I18nProxy"],
  [() => m47.LogSubscriber, "ActionView::LogSubscriber"],
  [() => m47.Start, "ActionView::LogSubscriber::Start"],
  [() => m48.LookupContext, "ActionView::LookupContext"],
  [() => m48.DetailsKey, "ActionView::LookupContext::DetailsKey"],
  [() => m61.MissingTemplate, "ActionView::MissingTemplate"],
  [() => m61.Results, "ActionView::MissingTemplate::Results"],
  [() => m61.Result, "ActionView::MissingTemplate::Results::Result"],
  [() => m73.NullResolver, "ActionView::NullResolver"],
  [() => m52.ObjectRenderer, "ActionView::ObjectRenderer"],
  [() => m1.OutputBuffer, "ActionView::OutputBuffer"],
  [() => m7.OutputFlow, "ActionView::OutputFlow"],
  [() => m51.PartialIteration, "ActionView::PartialIteration"],
  [() => m53.PartialRenderer, "ActionView::PartialRenderer"],
  [() => m49.PathSet, "ActionView::PathSet"],
  [() => m1.RawOutputBuffer, "ActionView::RawOutputBuffer"],
  [() => m1.RawStreamingBuffer, "ActionView::RawStreamingBuffer"],
  [() => m54.Renderer, "ActionView::Renderer"],
  [() => m69.Resolver, "ActionView::Resolver"],
  [() => m69.PathParser, "ActionView::Resolver::PathParser"],
  [() => m69.ParsedPath, "ActionView::Resolver::PathParser::ParsedPath"],
  [() => m1.StreamingBuffer, "ActionView::StreamingBuffer"],
  [() => m7.StreamingFlow, "ActionView::StreamingFlow"],
  [() => m55.StreamingTemplateRenderer, "ActionView::StreamingTemplateRenderer"],
  [() => m55.Body, "ActionView::StreamingTemplateRenderer::Body"],
  [() => m61.StrictLocalsError, "ActionView::StrictLocalsError"],
  [() => m61.SyntaxErrorInTemplate, "ActionView::SyntaxErrorInTemplate"],
  [() => m60.Template, "ActionView::Template"],
  [() => m62.Html, "ActionView::Template::Handlers::Html"],
  [() => m63.Raw, "ActionView::Template::Handlers::Raw"],
  [() => m64.TSE, "ActionView::Template::Handlers::TSE"],
  [() => m65.HTML, "ActionView::Template::HTML"],
  [() => m66.Inline, "ActionView::Template::Inline"],
  [() => m67.RawFile, "ActionView::Template::RawFile"],
  [() => m68.Renderable, "ActionView::Template::Renderable"],
  [() => m72.SimpleType, "ActionView::Template::SimpleType"],
  [() => m70.File, "ActionView::Template::Sources::File"],
  [() => m71.Text, "ActionView::Template::Text"],
  [() => m58.TemplateDetails, "ActionView::TemplateDetails"],
  [() => m58.Requested, "ActionView::TemplateDetails::Requested"],
  [() => m59.TemplatePath, "ActionView::TemplatePath"],
  [() => m56.TemplateRenderer, "ActionView::TemplateRenderer"],
  [() => m74.UnboundTemplate, "ActionView::UnboundTemplate"],
  [() => m61.WrongEncodingError, "ActionView::WrongEncodingError"],
]);
