require "json"
require "fugit"
require "chronic"

ENV["TZ"] = "UTC"

def num(f)
  f = f.to_f
  return f.to_s unless f.finite?
  f % 1 == 0 ? f.to_i : f
end

def eo(t)
  [num(t.to_f), t.zone.name]
end

def fugit_value(o)
  case o
  when nil then nil
  when Array then ["Array", o.map { |e| fugit_value(e) }]
  when Fugit::Cron then ["Fugit::Cron", o.to_cron_s]
  when Fugit::Duration then ["Fugit::Duration", o.deflate.to_plain_s, o.to_h.transform_values { |v| num(v) }]
  when EtOrbi::EoTime then ["EtOrbi::EoTime", *eo(o)]
  else [o.class.name, o.to_s]
  end
end

def guard
  yield
rescue StandardError, ScriptError => e
  { "err" => e.class.name.split("::").last }
end

def run(c)
  case c["k"]
  when "parse"
    fugit_value(Fugit.parse(c["s"]))
  when "cron"
    o = Fugit.parse(c["s"])
    return fugit_value(o) unless o.is_a?(Fugit::Cron)
    from = EtOrbi::EoTime.new(c["from"], c["zone"])
    nexts = []
    t = from
    5.times { t = o.next_time(t); nexts << eo(t) }
    prevs = []
    t = from
    5.times { t = o.previous_time(t); prevs << eo(t) }
    [o.to_cron_s, nexts, prevs]
  when "dur"
    d = Fugit.parse_duration(c["s"])
    return nil if d.nil?
    [
      d.to_plain_s, d.deflate.to_plain_s, d.to_iso_s, d.to_long_s, num(d.to_sec),
      guard { eo(d + EtOrbi::EoTime.new(c["from"], c["zone"])) },
      guard { eo(EtOrbi::EoTime.new(c["from"], c["zone"]) - d) },
    ]
  when "eo"
    t = EtOrbi.parse(c["s"])
    [*eo(t), t.to_s, t.utc_offset, t.strftime("%Y-%m-%d %H:%M:%S.%L %z %:z %Z %a %j %U %u"), t.to_debug_s]
  when "chronic"
    r = Chronic.parse(c["s"], now: Time.at(c["now"]).utc)
    r.nil? ? nil : num(r.to_f)
  end
rescue StandardError, ScriptError => e
  { "err" => e.class.name.split("::").last }
end

puts JSON.generate(JSON.parse($stdin.read).map { |c| run(c) })
