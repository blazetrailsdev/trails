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
import * as m17 from "./helpers/csp-helper.js";
import * as m18 from "./helpers/csrf-helper.js";
import * as m19 from "./helpers/date-helper.js";
import * as m20 from "./helpers/debug-helper.js";
import * as m21 from "./helpers/form-options-helper.js";
import * as m22 from "./helpers/form-tag-helper.js";
import * as m23 from "./helpers/javascript-helper.js";
import * as m24 from "./helpers/number-helper.js";
import * as m25 from "./helpers/output-safety-helper.js";
import * as m26 from "./helpers/rendering-helper.js";
import * as m27 from "./helpers/sanitize-helper.js";
import * as m28 from "./helpers/tag-helper.js";
import * as m29 from "./helpers/tags/base.js";
import * as m30 from "./helpers/tags/check-box.js";
import * as m31 from "./helpers/tags/checkable.js";
import * as m32 from "./helpers/tags/collection-check-boxes.js";
import * as m33 from "./helpers/tags/collection-helpers.js";
import * as m34 from "./helpers/tags/collection-radio-buttons.js";
import * as m35 from "./helpers/tags/collection-select.js";
import * as m36 from "./helpers/tags/color-field.js";
import * as m37 from "./helpers/tags/date-field.js";
import * as m38 from "./helpers/tags/date-select.js";
import * as m39 from "./helpers/tags/datetime-field.js";
import * as m40 from "./helpers/tags/datetime-local-field.js";
import * as m41 from "./helpers/tags/datetime-select.js";
import * as m42 from "./helpers/tags/email-field.js";
import * as m43 from "./helpers/tags/file-field.js";
import * as m44 from "./helpers/tags/grouped-collection-select.js";
import * as m45 from "./helpers/tags/hidden-field.js";
import * as m46 from "./helpers/tags/label.js";
import * as m47 from "./helpers/tags/month-field.js";
import * as m48 from "./helpers/tags/number-field.js";
import * as m49 from "./helpers/tags/password-field.js";
import * as m50 from "./helpers/tags/radio-button.js";
import * as m51 from "./helpers/tags/range-field.js";
import * as m52 from "./helpers/tags/search-field.js";
import * as m53 from "./helpers/tags/select-renderer.js";
import * as m54 from "./helpers/tags/select.js";
import * as m55 from "./helpers/tags/tel-field.js";
import * as m56 from "./helpers/tags/text-area.js";
import * as m57 from "./helpers/tags/text-field.js";
import * as m58 from "./helpers/tags/time-field.js";
import * as m59 from "./helpers/tags/time-select.js";
import * as m60 from "./helpers/tags/time-zone-select.js";
import * as m61 from "./helpers/tags/translator.js";
import * as m62 from "./helpers/tags/url-field.js";
import * as m63 from "./helpers/tags/week-field.js";
import * as m64 from "./helpers/tags/weekday-select.js";
import * as m65 from "./helpers/text-helper.js";
import * as m66 from "./helpers/translation-helper.js";
import * as m67 from "./helpers/url-helper.js";
import * as m68 from "./layouts.js";
import * as m69 from "./log-subscriber.js";
import * as m70 from "./lookup-context.js";
import * as m71 from "./model-naming.js";
import * as m72 from "./path-set.js";
import * as m73 from "./record-identifier.js";
import * as m74 from "./renderer/abstract-renderer.js";
import * as m75 from "./renderer/collection-renderer.js";
import * as m76 from "./renderer/object-renderer.js";
import * as m77 from "./renderer/partial-renderer.js";
import * as m78 from "./renderer/renderer.js";
import * as m79 from "./renderer/streaming-template-renderer.js";
import * as m80 from "./renderer/template-renderer.js";
import * as m81 from "./rendering.js";
import * as m82 from "./routing-url-for.js";
import * as m83 from "./template-details.js";
import * as m84 from "./template-path.js";
import * as m85 from "./template.js";
import * as m86 from "./template/error.js";
import * as m87 from "./template/handlers/html.js";
import * as m88 from "./template/handlers/raw.js";
import * as m89 from "./template/handlers/tse.js";
import * as m90 from "./template/html.js";
import * as m91 from "./template/inline.js";
import * as m92 from "./template/raw-file.js";
import * as m93 from "./template/renderable.js";
import * as m94 from "./template/resolver.js";
import * as m95 from "./template/sources/file.js";
import * as m96 from "./template/text.js";
import * as m97 from "./template/types.js";
import * as m98 from "./testing/resolvers.js";
import * as m99 from "./unbound-template.js";

registerClassPaths([
  [() => m74.AbstractRenderer, "ActionView::AbstractRenderer"],
  [() => m74.RenderedCollection, "ActionView::AbstractRenderer::RenderedCollection"],
  [() => m74.EmptyCollection, "ActionView::AbstractRenderer::RenderedCollection::EmptyCollection"],
  [() => m74.RenderedTemplate, "ActionView::AbstractRenderer::RenderedTemplate"],
  [() => m86.ActionViewError, "ActionView::ActionViewError"],
  [() => m0.Base, "ActionView::Base"],
  [() => m2.ViewReloader, "ActionView::CacheExpiry::ViewReloader"],
  [() => m75.CollectionRenderer, "ActionView::CollectionRenderer"],
  [() => m75.CollectionIterator, "ActionView::CollectionRenderer::CollectionIterator"],
  [() => m75.MixedCollectionIterator, "ActionView::CollectionRenderer::MixedCollectionIterator"],
  [
    () => m75.PreloadCollectionIterator,
    "ActionView::CollectionRenderer::PreloadCollectionIterator",
  ],
  [() => m75.SameCollectionIterator, "ActionView::CollectionRenderer::SameCollectionIterator"],
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
  [() => m86.EncodingError, "ActionView::EncodingError"],
  [() => m94.FileSystemResolver, "ActionView::FileSystemResolver"],
  [() => m98.FixtureResolver, "ActionView::FixtureResolver"],
  [() => m10.Helpers, "ActionView::Helpers"],
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
  [() => m17.CspHelper, "ActionView::Helpers::CspHelper"],
  [() => m18.CsrfHelper, "ActionView::Helpers::CsrfHelper"],
  [() => m19.DateHelper, "ActionView::Helpers::DateHelper"],
  [() => m19.DateTimeSelector, "ActionView::Helpers::DateTimeSelector"],
  [() => m20.DebugHelper, "ActionView::Helpers::DebugHelper"],
  [() => m21.FormOptionsHelper, "ActionView::Helpers::FormOptionsHelper"],
  [() => m22.FormTagHelper, "ActionView::Helpers::FormTagHelper"],
  [() => m23.JavaScriptHelper, "ActionView::Helpers::JavaScriptHelper"],
  [() => m24.NumberHelper, "ActionView::Helpers::NumberHelper"],
  [() => m24.InvalidNumberError, "ActionView::Helpers::NumberHelper::InvalidNumberError"],
  [() => m25.OutputSafetyHelper, "ActionView::Helpers::OutputSafetyHelper"],
  [() => m26.RenderingHelper, "ActionView::Helpers::RenderingHelper"],
  [() => m27.ClassMethods, "ActionView::Helpers::SanitizeHelper::ClassMethods"],
  [() => m28.TagBuilder, "ActionView::Helpers::TagHelper::TagBuilder"],
  [() => m29.Base, "ActionView::Helpers::Tags::Base"],
  [() => m31.Checkable, "ActionView::Helpers::Tags::Checkable"],
  [() => m30.CheckBox, "ActionView::Helpers::Tags::CheckBox"],
  [() => m32.CollectionCheckBoxes, "ActionView::Helpers::Tags::CollectionCheckBoxes"],
  [() => m32.CheckBoxBuilder, "ActionView::Helpers::Tags::CollectionCheckBoxes::CheckBoxBuilder"],
  [() => m33.CollectionHelpers, "ActionView::Helpers::Tags::CollectionHelpers"],
  [() => m33.Builder, "ActionView::Helpers::Tags::CollectionHelpers::Builder"],
  [() => m34.CollectionRadioButtons, "ActionView::Helpers::Tags::CollectionRadioButtons"],
  [
    () => m34.RadioButtonBuilder,
    "ActionView::Helpers::Tags::CollectionRadioButtons::RadioButtonBuilder",
  ],
  [() => m35.CollectionSelect, "ActionView::Helpers::Tags::CollectionSelect"],
  [() => m36.ColorField, "ActionView::Helpers::Tags::ColorField"],
  [() => m37.DateField, "ActionView::Helpers::Tags::DateField"],
  [() => m38.DateSelect, "ActionView::Helpers::Tags::DateSelect"],
  [() => m39.DatetimeField, "ActionView::Helpers::Tags::DatetimeField"],
  [() => m40.DatetimeLocalField, "ActionView::Helpers::Tags::DatetimeLocalField"],
  [() => m41.DatetimeSelect, "ActionView::Helpers::Tags::DatetimeSelect"],
  [() => m42.EmailField, "ActionView::Helpers::Tags::EmailField"],
  [() => m43.FileField, "ActionView::Helpers::Tags::FileField"],
  [() => m44.GroupedCollectionSelect, "ActionView::Helpers::Tags::GroupedCollectionSelect"],
  [() => m45.HiddenField, "ActionView::Helpers::Tags::HiddenField"],
  [() => m46.Label, "ActionView::Helpers::Tags::Label"],
  [() => m46.LabelBuilder, "ActionView::Helpers::Tags::Label::LabelBuilder"],
  [() => m47.MonthField, "ActionView::Helpers::Tags::MonthField"],
  [() => m48.NumberField, "ActionView::Helpers::Tags::NumberField"],
  [() => m49.PasswordField, "ActionView::Helpers::Tags::PasswordField"],
  [() => m50.RadioButton, "ActionView::Helpers::Tags::RadioButton"],
  [() => m51.RangeField, "ActionView::Helpers::Tags::RangeField"],
  [() => m52.SearchField, "ActionView::Helpers::Tags::SearchField"],
  [() => m54.Select, "ActionView::Helpers::Tags::Select"],
  [() => m53.SelectRenderer, "ActionView::Helpers::Tags::SelectRenderer"],
  [() => m55.TelField, "ActionView::Helpers::Tags::TelField"],
  [() => m56.TextArea, "ActionView::Helpers::Tags::TextArea"],
  [() => m57.TextField, "ActionView::Helpers::Tags::TextField"],
  [() => m58.TimeField, "ActionView::Helpers::Tags::TimeField"],
  [() => m59.TimeSelect, "ActionView::Helpers::Tags::TimeSelect"],
  [() => m60.TimeZoneSelect, "ActionView::Helpers::Tags::TimeZoneSelect"],
  [() => m61.Translator, "ActionView::Helpers::Tags::Translator"],
  [() => m62.UrlField, "ActionView::Helpers::Tags::UrlField"],
  [() => m64.WeekdaySelect, "ActionView::Helpers::Tags::WeekdaySelect"],
  [() => m63.WeekField, "ActionView::Helpers::Tags::WeekField"],
  [() => m65.TextHelper, "ActionView::Helpers::TextHelper"],
  [() => m65.Cycle, "ActionView::Helpers::TextHelper::Cycle"],
  [() => m66.TranslationHelper, "ActionView::Helpers::TranslationHelper"],
  [() => m67.ClassMethods, "ActionView::Helpers::UrlHelper::ClassMethods"],
  [() => m81.I18nProxy, "ActionView::I18nProxy"],
  [() => m68.Layouts, "ActionView::Layouts"],
  [() => m68.ClassMethods, "ActionView::Layouts::ClassMethods"],
  [() => m68.LayoutConditions, "ActionView::Layouts::ClassMethods::LayoutConditions"],
  [() => m69.LogSubscriber, "ActionView::LogSubscriber"],
  [() => m69.Start, "ActionView::LogSubscriber::Start"],
  [() => m70.LookupContext, "ActionView::LookupContext"],
  [() => m70.DetailsKey, "ActionView::LookupContext::DetailsKey"],
  [() => m86.MissingTemplate, "ActionView::MissingTemplate"],
  [() => m86.Results, "ActionView::MissingTemplate::Results"],
  [() => m86.Result, "ActionView::MissingTemplate::Results::Result"],
  [() => m71.ModelNaming, "ActionView::ModelNaming"],
  [() => m98.NullResolver, "ActionView::NullResolver"],
  [() => m76.ObjectRenderer, "ActionView::ObjectRenderer"],
  [() => m1.OutputBuffer, "ActionView::OutputBuffer"],
  [() => m8.OutputFlow, "ActionView::OutputFlow"],
  [() => m75.PartialIteration, "ActionView::PartialIteration"],
  [() => m77.PartialRenderer, "ActionView::PartialRenderer"],
  [() => m72.PathSet, "ActionView::PathSet"],
  [() => m1.RawOutputBuffer, "ActionView::RawOutputBuffer"],
  [() => m1.RawStreamingBuffer, "ActionView::RawStreamingBuffer"],
  [() => m73.RecordIdentifier, "ActionView::RecordIdentifier"],
  [() => m78.Renderer, "ActionView::Renderer"],
  [() => m81.Rendering, "ActionView::Rendering"],
  [() => m81.ClassMethods, "ActionView::Rendering::ClassMethods"],
  [() => m94.Resolver, "ActionView::Resolver"],
  [() => m94.PathParser, "ActionView::Resolver::PathParser"],
  [() => m94.ParsedPath, "ActionView::Resolver::PathParser::ParsedPath"],
  [() => m82.RoutingUrlFor, "ActionView::RoutingUrlFor"],
  [() => m1.StreamingBuffer, "ActionView::StreamingBuffer"],
  [() => m8.StreamingFlow, "ActionView::StreamingFlow"],
  [() => m79.StreamingTemplateRenderer, "ActionView::StreamingTemplateRenderer"],
  [() => m79.Body, "ActionView::StreamingTemplateRenderer::Body"],
  [() => m86.StrictLocalsError, "ActionView::StrictLocalsError"],
  [() => m86.SyntaxErrorInTemplate, "ActionView::SyntaxErrorInTemplate"],
  [() => m85.Template, "ActionView::Template"],
  [() => m87.Html, "ActionView::Template::Handlers::Html"],
  [() => m88.Raw, "ActionView::Template::Handlers::Raw"],
  [() => m89.TSE, "ActionView::Template::Handlers::TSE"],
  [() => m90.HTML, "ActionView::Template::HTML"],
  [() => m91.Inline, "ActionView::Template::Inline"],
  [() => m92.RawFile, "ActionView::Template::RawFile"],
  [() => m93.Renderable, "ActionView::Template::Renderable"],
  [() => m97.SimpleType, "ActionView::Template::SimpleType"],
  [() => m95.File, "ActionView::Template::Sources::File"],
  [() => m96.Text, "ActionView::Template::Text"],
  [() => m83.TemplateDetails, "ActionView::TemplateDetails"],
  [() => m83.Requested, "ActionView::TemplateDetails::Requested"],
  [() => m84.TemplatePath, "ActionView::TemplatePath"],
  [() => m80.TemplateRenderer, "ActionView::TemplateRenderer"],
  [() => m99.UnboundTemplate, "ActionView::UnboundTemplate"],
  [() => m9.VERSION, "ActionView::VERSION"],
  [() => m86.WrongEncodingError, "ActionView::WrongEncodingError"],
]);
