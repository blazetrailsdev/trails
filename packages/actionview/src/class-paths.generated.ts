import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./base.js";
import * as m1 from "./buffers.js";
import * as m2 from "./cache-expiry.js";
import * as m3 from "./context.js";
import * as m4 from "./dependency-tracker.js";
import * as m5 from "./dependency-tracker/tse-tracker.js";
import * as m6 from "./dependency-tracker/wildcard-resolver.js";
import * as m7 from "./digestor.js";
import * as m8 from "./flows.js";
import * as m9 from "./gem-version.js";
import * as m10 from "./helpers.js";
import * as m11 from "./helpers/active-model-helper.js";
import * as m12 from "./helpers/asset-tag-helper.js";
import * as m13 from "./helpers/asset-url-helper.js";
import * as m14 from "./helpers/cache-helper.js";
import * as m15 from "./helpers/capture-helper.js";
import * as m16 from "./helpers/content-exfiltration-prevention-helper.js";
import * as m17 from "./helpers/controller-helper.js";
import * as m18 from "./helpers/csp-helper.js";
import * as m19 from "./helpers/csrf-helper.js";
import * as m20 from "./helpers/date-helper.js";
import * as m21 from "./helpers/debug-helper.js";
import * as m22 from "./helpers/form-helper.js";
import * as m23 from "./helpers/form-options-helper.js";
import * as m24 from "./helpers/form-tag-helper.js";
import * as m25 from "./helpers/javascript-helper.js";
import * as m26 from "./helpers/number-helper.js";
import * as m27 from "./helpers/output-safety-helper.js";
import * as m28 from "./helpers/rendering-helper.js";
import * as m29 from "./helpers/sanitize-helper.js";
import * as m30 from "./helpers/tag-helper.js";
import * as m31 from "./helpers/tags/base.js";
import * as m32 from "./helpers/tags/check-box.js";
import * as m33 from "./helpers/tags/checkable.js";
import * as m34 from "./helpers/tags/collection-check-boxes.js";
import * as m35 from "./helpers/tags/collection-helpers.js";
import * as m36 from "./helpers/tags/collection-radio-buttons.js";
import * as m37 from "./helpers/tags/collection-select.js";
import * as m38 from "./helpers/tags/color-field.js";
import * as m39 from "./helpers/tags/date-field.js";
import * as m40 from "./helpers/tags/date-select.js";
import * as m41 from "./helpers/tags/datetime-field.js";
import * as m42 from "./helpers/tags/datetime-local-field.js";
import * as m43 from "./helpers/tags/datetime-select.js";
import * as m44 from "./helpers/tags/email-field.js";
import * as m45 from "./helpers/tags/file-field.js";
import * as m46 from "./helpers/tags/grouped-collection-select.js";
import * as m47 from "./helpers/tags/hidden-field.js";
import * as m48 from "./helpers/tags/label.js";
import * as m49 from "./helpers/tags/month-field.js";
import * as m50 from "./helpers/tags/number-field.js";
import * as m51 from "./helpers/tags/password-field.js";
import * as m52 from "./helpers/tags/placeholderable.js";
import * as m53 from "./helpers/tags/radio-button.js";
import * as m54 from "./helpers/tags/range-field.js";
import * as m55 from "./helpers/tags/search-field.js";
import * as m56 from "./helpers/tags/select-renderer.js";
import * as m57 from "./helpers/tags/select.js";
import * as m58 from "./helpers/tags/tel-field.js";
import * as m59 from "./helpers/tags/text-area.js";
import * as m60 from "./helpers/tags/text-field.js";
import * as m61 from "./helpers/tags/time-field.js";
import * as m62 from "./helpers/tags/time-select.js";
import * as m63 from "./helpers/tags/time-zone-select.js";
import * as m64 from "./helpers/tags/translator.js";
import * as m65 from "./helpers/tags/url-field.js";
import * as m66 from "./helpers/tags/week-field.js";
import * as m67 from "./helpers/tags/weekday-select.js";
import * as m68 from "./helpers/text-helper.js";
import * as m69 from "./helpers/translation-helper.js";
import * as m70 from "./helpers/url-helper.js";
import * as m71 from "./layouts.js";
import * as m72 from "./log-subscriber.js";
import * as m73 from "./lookup-context.js";
import * as m74 from "./model-naming.js";
import * as m75 from "./path-registry.js";
import * as m76 from "./path-set.js";
import * as m77 from "./record-identifier.js";
import * as m78 from "./renderer/abstract-renderer.js";
import * as m79 from "./renderer/collection-renderer.js";
import * as m80 from "./renderer/object-renderer.js";
import * as m81 from "./renderer/partial-renderer.js";
import * as m82 from "./renderer/renderer.js";
import * as m83 from "./renderer/streaming-template-renderer.js";
import * as m84 from "./renderer/template-renderer.js";
import * as m85 from "./rendering.js";
import * as m86 from "./routing-url-for.js";
import * as m87 from "./template-details.js";
import * as m88 from "./template-path.js";
import * as m89 from "./template.js";
import * as m90 from "./template/error.js";
import * as m91 from "./template/handlers.js";
import * as m92 from "./template/handlers/html.js";
import * as m93 from "./template/handlers/raw.js";
import * as m94 from "./template/handlers/tse.js";
import * as m95 from "./template/html.js";
import * as m96 from "./template/inline.js";
import * as m97 from "./template/raw-file.js";
import * as m98 from "./template/renderable.js";
import * as m99 from "./template/resolver.js";
import * as m100 from "./template/sources/file.js";
import * as m101 from "./template/text.js";
import * as m102 from "./template/types.js";
import * as m103 from "./testing/resolvers.js";
import * as m104 from "./unbound-template.js";
import * as m105 from "./view-paths.js";

registerClassPaths([
  [() => m78.AbstractRenderer, "ActionView::AbstractRenderer"],
  [() => m78.RenderedCollection, "ActionView::AbstractRenderer::RenderedCollection"],
  [() => m78.EmptyCollection, "ActionView::AbstractRenderer::RenderedCollection::EmptyCollection"],
  [() => m78.RenderedTemplate, "ActionView::AbstractRenderer::RenderedTemplate"],
  [() => m90.ActionViewError, "ActionView::ActionViewError"],
  [() => m0.Base, "ActionView::Base"],
  [() => m2.ViewReloader, "ActionView::CacheExpiry::ViewReloader"],
  [() => m79.CollectionRenderer, "ActionView::CollectionRenderer"],
  [() => m79.CollectionIterator, "ActionView::CollectionRenderer::CollectionIterator"],
  [() => m79.MixedCollectionIterator, "ActionView::CollectionRenderer::MixedCollectionIterator"],
  [
    () => m79.PreloadCollectionIterator,
    "ActionView::CollectionRenderer::PreloadCollectionIterator",
  ],
  [() => m79.SameCollectionIterator, "ActionView::CollectionRenderer::SameCollectionIterator"],
  [() => m3.Context, "ActionView::Context"],
  [() => m4.DependencyTracker, "ActionView::DependencyTracker"],
  [() => m5.TSETracker, "ActionView::DependencyTracker::TSETracker"],
  [() => m6.WildcardResolver, "ActionView::DependencyTracker::WildcardResolver"],
  [() => m7.Digestor, "ActionView::Digestor"],
  [() => m7.Injected, "ActionView::Digestor::Injected"],
  [() => m7.Missing, "ActionView::Digestor::Missing"],
  [() => m7.Node, "ActionView::Digestor::Node"],
  [() => m7.NullLogger, "ActionView::Digestor::NullLogger"],
  [() => m7.Partial, "ActionView::Digestor::Partial"],
  [() => m90.EncodingError, "ActionView::EncodingError"],
  [() => m99.FileSystemResolver, "ActionView::FileSystemResolver"],
  [() => m103.FixtureResolver, "ActionView::FixtureResolver"],
  [() => m10.Helpers, "ActionView::Helpers"],
  [() => m11.ActiveModelHelper, "ActionView::Helpers::ActiveModelHelper"],
  [() => m11.ActiveModelInstanceTag, "ActionView::Helpers::ActiveModelInstanceTag"],
  [() => m12.AssetTagHelper, "ActionView::Helpers::AssetTagHelper"],
  [() => m13.AssetUrlHelper, "ActionView::Helpers::AssetUrlHelper"],
  [() => m14.CacheHelper, "ActionView::Helpers::CacheHelper"],
  [() => m14.CachingRegistry, "ActionView::Helpers::CacheHelper::CachingRegistry"],
  [
    () => m14.UncacheableFragmentError,
    "ActionView::Helpers::CacheHelper::UncacheableFragmentError",
  ],
  [() => m15.CaptureHelper, "ActionView::Helpers::CaptureHelper"],
  [
    () => m16.ContentExfiltrationPreventionHelper,
    "ActionView::Helpers::ContentExfiltrationPreventionHelper",
  ],
  [() => m17.ControllerHelper, "ActionView::Helpers::ControllerHelper"],
  [() => m18.CspHelper, "ActionView::Helpers::CspHelper"],
  [() => m19.CsrfHelper, "ActionView::Helpers::CsrfHelper"],
  [() => m20.DateHelper, "ActionView::Helpers::DateHelper"],
  [() => m20.DateTimeSelector, "ActionView::Helpers::DateTimeSelector"],
  [() => m21.DebugHelper, "ActionView::Helpers::DebugHelper"],
  [() => m22.FormHelper, "ActionView::Helpers::FormHelper"],
  [() => m23.FormOptionsHelper, "ActionView::Helpers::FormOptionsHelper"],
  [() => m24.FormTagHelper, "ActionView::Helpers::FormTagHelper"],
  [() => m25.JavaScriptHelper, "ActionView::Helpers::JavaScriptHelper"],
  [() => m26.NumberHelper, "ActionView::Helpers::NumberHelper"],
  [() => m26.InvalidNumberError, "ActionView::Helpers::NumberHelper::InvalidNumberError"],
  [() => m27.OutputSafetyHelper, "ActionView::Helpers::OutputSafetyHelper"],
  [() => m28.RenderingHelper, "ActionView::Helpers::RenderingHelper"],
  [() => m29.SanitizeHelper, "ActionView::Helpers::SanitizeHelper"],
  [() => m29.ClassMethods, "ActionView::Helpers::SanitizeHelper::ClassMethods"],
  [() => m30.TagHelper, "ActionView::Helpers::TagHelper"],
  [() => m30.TagBuilder, "ActionView::Helpers::TagHelper::TagBuilder"],
  [() => m31.Base, "ActionView::Helpers::Tags::Base"],
  [() => m33.Checkable, "ActionView::Helpers::Tags::Checkable"],
  [() => m32.CheckBox, "ActionView::Helpers::Tags::CheckBox"],
  [() => m34.CollectionCheckBoxes, "ActionView::Helpers::Tags::CollectionCheckBoxes"],
  [() => m34.CheckBoxBuilder, "ActionView::Helpers::Tags::CollectionCheckBoxes::CheckBoxBuilder"],
  [() => m35.CollectionHelpers, "ActionView::Helpers::Tags::CollectionHelpers"],
  [() => m35.Builder, "ActionView::Helpers::Tags::CollectionHelpers::Builder"],
  [() => m36.CollectionRadioButtons, "ActionView::Helpers::Tags::CollectionRadioButtons"],
  [
    () => m36.RadioButtonBuilder,
    "ActionView::Helpers::Tags::CollectionRadioButtons::RadioButtonBuilder",
  ],
  [() => m37.CollectionSelect, "ActionView::Helpers::Tags::CollectionSelect"],
  [() => m38.ColorField, "ActionView::Helpers::Tags::ColorField"],
  [() => m39.DateField, "ActionView::Helpers::Tags::DateField"],
  [() => m40.DateSelect, "ActionView::Helpers::Tags::DateSelect"],
  [() => m41.DatetimeField, "ActionView::Helpers::Tags::DatetimeField"],
  [() => m42.DatetimeLocalField, "ActionView::Helpers::Tags::DatetimeLocalField"],
  [() => m43.DatetimeSelect, "ActionView::Helpers::Tags::DatetimeSelect"],
  [() => m44.EmailField, "ActionView::Helpers::Tags::EmailField"],
  [() => m45.FileField, "ActionView::Helpers::Tags::FileField"],
  [() => m46.GroupedCollectionSelect, "ActionView::Helpers::Tags::GroupedCollectionSelect"],
  [() => m47.HiddenField, "ActionView::Helpers::Tags::HiddenField"],
  [() => m48.Label, "ActionView::Helpers::Tags::Label"],
  [() => m48.LabelBuilder, "ActionView::Helpers::Tags::Label::LabelBuilder"],
  [() => m49.MonthField, "ActionView::Helpers::Tags::MonthField"],
  [() => m50.NumberField, "ActionView::Helpers::Tags::NumberField"],
  [() => m51.PasswordField, "ActionView::Helpers::Tags::PasswordField"],
  [() => m52.Placeholderable, "ActionView::Helpers::Tags::Placeholderable"],
  [() => m53.RadioButton, "ActionView::Helpers::Tags::RadioButton"],
  [() => m54.RangeField, "ActionView::Helpers::Tags::RangeField"],
  [() => m55.SearchField, "ActionView::Helpers::Tags::SearchField"],
  [() => m57.Select, "ActionView::Helpers::Tags::Select"],
  [() => m56.SelectRenderer, "ActionView::Helpers::Tags::SelectRenderer"],
  [() => m58.TelField, "ActionView::Helpers::Tags::TelField"],
  [() => m59.TextArea, "ActionView::Helpers::Tags::TextArea"],
  [() => m60.TextField, "ActionView::Helpers::Tags::TextField"],
  [() => m61.TimeField, "ActionView::Helpers::Tags::TimeField"],
  [() => m62.TimeSelect, "ActionView::Helpers::Tags::TimeSelect"],
  [() => m63.TimeZoneSelect, "ActionView::Helpers::Tags::TimeZoneSelect"],
  [() => m64.Translator, "ActionView::Helpers::Tags::Translator"],
  [() => m65.UrlField, "ActionView::Helpers::Tags::UrlField"],
  [() => m67.WeekdaySelect, "ActionView::Helpers::Tags::WeekdaySelect"],
  [() => m66.WeekField, "ActionView::Helpers::Tags::WeekField"],
  [() => m68.TextHelper, "ActionView::Helpers::TextHelper"],
  [() => m68.Cycle, "ActionView::Helpers::TextHelper::Cycle"],
  [() => m69.TranslationHelper, "ActionView::Helpers::TranslationHelper"],
  [() => m70.UrlHelper, "ActionView::Helpers::UrlHelper"],
  [() => m70.ClassMethods, "ActionView::Helpers::UrlHelper::ClassMethods"],
  [() => m85.I18nProxy, "ActionView::I18nProxy"],
  [() => m71.Layouts, "ActionView::Layouts"],
  [() => m71.ClassMethods, "ActionView::Layouts::ClassMethods"],
  [() => m71.LayoutConditions, "ActionView::Layouts::ClassMethods::LayoutConditions"],
  [() => m72.LogSubscriber, "ActionView::LogSubscriber"],
  [() => m72.Start, "ActionView::LogSubscriber::Start"],
  [() => m73.LookupContext, "ActionView::LookupContext"],
  [() => m73.Accessors, "ActionView::LookupContext::Accessors"],
  [() => m73.DetailsKey, "ActionView::LookupContext::DetailsKey"],
  [() => m90.MissingTemplate, "ActionView::MissingTemplate"],
  [() => m90.Results, "ActionView::MissingTemplate::Results"],
  [() => m90.Result, "ActionView::MissingTemplate::Results::Result"],
  [() => m74.ModelNaming, "ActionView::ModelNaming"],
  [() => m103.NullResolver, "ActionView::NullResolver"],
  [() => m80.ObjectRenderer, "ActionView::ObjectRenderer"],
  [() => m1.OutputBuffer, "ActionView::OutputBuffer"],
  [() => m8.OutputFlow, "ActionView::OutputFlow"],
  [() => m79.PartialIteration, "ActionView::PartialIteration"],
  [() => m81.PartialRenderer, "ActionView::PartialRenderer"],
  [() => m75.PathRegistry, "ActionView::PathRegistry"],
  [() => m76.PathSet, "ActionView::PathSet"],
  [() => m1.RawOutputBuffer, "ActionView::RawOutputBuffer"],
  [() => m1.RawStreamingBuffer, "ActionView::RawStreamingBuffer"],
  [() => m77.RecordIdentifier, "ActionView::RecordIdentifier"],
  [() => m82.Renderer, "ActionView::Renderer"],
  [() => m85.Rendering, "ActionView::Rendering"],
  [() => m85.ClassMethods, "ActionView::Rendering::ClassMethods"],
  [() => m99.Resolver, "ActionView::Resolver"],
  [() => m99.PathParser, "ActionView::Resolver::PathParser"],
  [() => m99.ParsedPath, "ActionView::Resolver::PathParser::ParsedPath"],
  [() => m86.RoutingUrlFor, "ActionView::RoutingUrlFor"],
  [() => m1.StreamingBuffer, "ActionView::StreamingBuffer"],
  [() => m8.StreamingFlow, "ActionView::StreamingFlow"],
  [() => m83.StreamingTemplateRenderer, "ActionView::StreamingTemplateRenderer"],
  [() => m83.Body, "ActionView::StreamingTemplateRenderer::Body"],
  [() => m90.StrictLocalsError, "ActionView::StrictLocalsError"],
  [() => m90.SyntaxErrorInTemplate, "ActionView::SyntaxErrorInTemplate"],
  [() => m89.Template, "ActionView::Template"],
  [() => m90.TemplateError, "ActionView::Template::Error"],
  [() => m91.Handlers, "ActionView::Template::Handlers"],
  [() => m92.Html, "ActionView::Template::Handlers::Html"],
  [() => m93.Raw, "ActionView::Template::Handlers::Raw"],
  [() => m94.TSE, "ActionView::Template::Handlers::TSE"],
  [() => m95.HTML, "ActionView::Template::HTML"],
  [() => m96.Inline, "ActionView::Template::Inline"],
  [() => m97.RawFile, "ActionView::Template::RawFile"],
  [() => m98.Renderable, "ActionView::Template::Renderable"],
  [() => m102.SimpleType, "ActionView::Template::SimpleType"],
  [() => m100.File, "ActionView::Template::Sources::File"],
  [() => m101.Text, "ActionView::Template::Text"],
  [() => m87.TemplateDetails, "ActionView::TemplateDetails"],
  [() => m87.Requested, "ActionView::TemplateDetails::Requested"],
  [() => m88.TemplatePath, "ActionView::TemplatePath"],
  [() => m84.TemplateRenderer, "ActionView::TemplateRenderer"],
  [() => m104.UnboundTemplate, "ActionView::UnboundTemplate"],
  [() => m9.VERSION, "ActionView::VERSION"],
  [() => m105.ViewPaths, "ActionView::ViewPaths"],
  [() => m105.ClassMethods, "ActionView::ViewPaths::ClassMethods"],
  [() => m90.WrongEncodingError, "ActionView::WrongEncodingError"],
]);
