import { useEffect, useMemo, useState } from "react";
import { readClipboardText, writeClipboardText } from "../lib/bridge";
import {
  allZones,
  formatInZone,
  localZone,
  parseTimeInput,
  relativeTime,
  UNIT_LABEL,
  zoneLabel,
  type Parsed,
} from "../lib/time";
import { loadPref, savePref } from "../lib/useToast";
import { IconClipboard, IconClose, IconCopy, IconError, IconSearch } from "./Icons";

const LOCAL = "local";
const DEFAULT_ZONES = [LOCAL, "UTC", "Asia/Shanghai", "America/New_York", "Europe/London", "Asia/Tokyo"];

function useNow(paused: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    let timer: number;
    // 对齐到整秒再跳，秒数变化更整齐
    const tick = () => {
      setNow(Date.now());
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [paused]);
  return now;
}

function CopyBtn({ text, label, toast }: { text: string; label: string; toast: (m: string) => void }) {
  return (
    <button
      className="icon-btn copy-mini"
      aria-label={`复制${label}`}
      title={`复制${label}`}
      onClick={async () => {
        await writeClipboardText(text);
        toast(`已复制 ${text.length > 28 ? text.slice(0, 28) + "…" : text}`);
      }}
    >
      <IconCopy size={13} />
    </button>
  );
}

export function TimePanel({ toast, expanded }: { toast: (msg: string) => void; expanded: boolean }) {
  const local = useMemo(localZone, []);
  const zonesAll = useMemo(allZones, []);
  const [input, setInput] = useState<string>(() => loadPref("time.input", ""));
  const [srcZone, setSrcZone] = useState<string>(() => loadPref("time.srcZone", LOCAL));
  const [zones, setZones] = useState<string[]>(() => loadPref("time.zones", DEFAULT_ZONES));
  const [paused, setPaused] = useState(false);
  const now = useNow(paused);

  useEffect(() => savePref("time.input", input), [input]);
  useEffect(() => savePref("time.srcZone", srcZone), [srcZone]);
  useEffect(() => savePref("time.zones", zones), [zones]);

  const resolve = (z: string) => (z === LOCAL ? local : z);
  const srcTz = resolve(srcZone);

  const parsed: Parsed | null = useMemo(() => (input.trim() ? parseTimeInput(input, srcTz) : null), [input, srcTz]);
  const invalid = input.trim() !== "" && !parsed;
  // 显示“当前时间”时取整秒，避免毫秒位每秒跳一下显得乱
  const ms = parsed ? parsed.ms : Math.floor(now / 1000) * 1000;
  const subMs = parsed?.subMs;

  // 去重：本地时区和列表里某个时区相同时，合并成一行
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return zones
      .map((z) => ({ key: z, tz: resolve(z) }))
      .filter((r) => {
        if (seen.has(r.tz)) return false;
        seen.add(r.tz);
        return true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, local]);

  const pullClipboard = async () => {
    const text = (await readClipboardText().catch(() => "")).trim();
    if (!text) return toast("剪贴板是空的");
    setInput(text.slice(0, 200));
  };

  const sec = Math.floor(ms / 1000);
  const numbers: { label: string; value: string }[] = [
    { label: "秒", value: String(sec) },
    { label: "毫秒", value: String(ms) },
  ];
  if (parsed?.unit === "us" || parsed?.unit === "ns") numbers.push({ label: "微秒", value: `${ms}${(subMs ?? "").padEnd(3, "0").slice(0, 3)}` });
  if (parsed?.unit === "ns") numbers.push({ label: "纳秒", value: `${ms}${(subMs ?? "").padEnd(6, "0")}` });

  const nowLocal = formatInZone(now, local);
  const utcIso = formatInZone(ms, "UTC", subMs).iso;

  const detectLabel = parsed
    ? parsed.kind === "timestamp"
      ? UNIT_LABEL[parsed.unit!]
      : parsed.hasZone
        ? "日期（自带时区）"
        : `日期（按${srcZone === LOCAL ? "本地" : zoneLabel(srcTz)}时间理解）`
    : null;

  const nowCard = (
    <div className="card time-now">
      <div className="row-between">
        <span className="label">现在</span>
        <button className="btn link" onClick={() => setPaused((p) => !p)}>
          {paused ? "继续走" : "暂停"}
        </button>
      </div>
      <div className="now-main">
        <button className="now-big mono" title="点击复制秒级时间戳" onClick={async () => (await writeClipboardText(String(Math.floor(now / 1000))), toast("已复制秒级时间戳"))}>
          {Math.floor(now / 1000)}
        </button>
        <div className="now-side">
          <span className="mono">{nowLocal.date} {nowLocal.time.slice(0, 8)}</span>
          <span className="now-zone">
            {nowLocal.weekday} · {zoneLabel(local)} UTC{nowLocal.offset}
          </span>
        </div>
      </div>
      <div className="now-actions">
        <button className="chip" onClick={async () => (await writeClipboardText(String(Math.floor(now / 1000))), toast("已复制秒级时间戳"))}>
          复制秒
        </button>
        <button className="chip" onClick={async () => (await writeClipboardText(String(now)), toast("已复制毫秒时间戳"))}>
          复制毫秒
        </button>
        <button className="chip" onClick={() => setInput(String(Math.floor(now / 1000)))}>
          填入下方
        </button>
      </div>
    </div>
  );

  const inputCard = (
    <div className="card time-input">
      <div className="row-between">
        <label htmlFor="time-in" className="label">
          时间戳或日期
        </label>
        {detectLabel && (
          <span className="detect" key={detectLabel}>
            <IconSearch size={12} />
            识别为：{detectLabel}
          </span>
        )}
      </div>
      <div className="time-input-row">
        <input
          id="time-in"
          className={`text-input ${invalid ? "invalid" : ""}`}
          placeholder="1731400000、1731400000123、2026-11-12 14:30"
          value={input}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setInput(e.target.value)}
        />
        {input && (
          <button className="icon-btn" aria-label="清空" title="清空" onClick={() => setInput("")}>
            <IconClose size={12} />
          </button>
        )}
      </div>
      <div className="row-between" style={{ flexWrap: "wrap", rowGap: 6 }}>
        <label className="zone-pick">
          没写时区的日期按
          <select value={srcZone} onChange={(e) => setSrcZone(e.target.value)} aria-label="输入日期所在的时区">
            <option value={LOCAL}>本地（{zoneLabel(local)}）</option>
            {zonesAll.map((z) => (
              <option key={z} value={z}>
                {zoneLabel(z) === z ? z : `${zoneLabel(z)} · ${z}`}
              </option>
            ))}
          </select>
          理解
        </label>
        <button className="chip" onClick={pullClipboard}>
          <IconClipboard size={13} />
          从剪贴板
        </button>
      </div>
      {invalid && (
        <div className="banner err">
          <div className="row">
            <IconError size={16} />
            <span>
              识别不了这个时间。支持：10 / 13 / 16 / 19 位时间戳；2026-11-12 14:30、2026/11/12、2026年11月12日 下午2:30、20261112143000；
              可带时区，如 Z、+08:00、GMT+8。
            </span>
          </div>
        </div>
      )}
    </div>
  );

  const resultCard = (
    <div className="card time-result">
      <div className="row-between result-head">
        <span className="label">{parsed ? "转换结果" : "当前时间"}</span>
        <span className="rel">{relativeTime(ms, now)}</span>
      </div>
      <div className="kv-list">
        {numbers.map((n) => (
          <div className="kv" key={n.label}>
            <span className="k">{n.label}</span>
            <span className="v mono">{n.value}</span>
            <CopyBtn text={n.value} label={`${n.label}时间戳`} toast={toast} />
          </div>
        ))}
        <div className="kv">
          <span className="k">ISO</span>
          <span className="v mono">{utcIso}</span>
          <CopyBtn text={utcIso} label="ISO 时间" toast={toast} />
        </div>
      </div>
      <div className="zone-list">
        {rows.map(({ key, tz }) => {
          const f = formatInZone(ms, tz, subMs);
          const text = `${f.date} ${f.time}`;
          const isSrc = parsed?.kind === "date" && !parsed.hasZone && tz === srcTz;
          return (
            <div className="zone-row" key={key}>
              <div className="zone-name">
                <span className="n">
                  {zoneLabel(tz)}
                  {tz === local && <span className="tag ok">本地</span>}
                  {isSrc && <span className="tag info">输入</span>}
                </span>
                <span className="o">UTC{f.offset}</span>
              </div>
              <div className="zone-time">
                <span className="mono">{text}</span>
                <span className="w">{f.weekday}</span>
              </div>
              <CopyBtn text={text} label={`${zoneLabel(tz)}时间`} toast={toast} />
              {key === LOCAL ? (
                <span className="copy-mini" aria-hidden="true" />
              ) : (
                <button className="icon-btn copy-mini remove" aria-label={`移除 ${zoneLabel(tz)}`} title="移除" onClick={() => setZones((z) => z.filter((x) => x !== key))}>
                  <IconClose size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <select
        className="add-zone"
        value=""
        aria-label="添加时区"
        onChange={(e) => {
          const v = e.target.value;
          if (v && !zones.includes(v)) setZones((z) => [...z, v]);
        }}
      >
        <option value="">＋ 添加时区…</option>
        {zonesAll
          .filter((z) => !zones.includes(z))
          .map((z) => (
            <option key={z} value={z}>
              {zoneLabel(z) === z ? z : `${zoneLabel(z)} · ${z}`}
            </option>
          ))}
      </select>
    </div>
  );

  return (
    <div className={`time-layout ${expanded ? "wide" : ""}`}>
      <div className="time-left">
        {nowCard}
        {inputCard}
      </div>
      <div className="time-right">{resultCard}</div>
    </div>
  );
}
