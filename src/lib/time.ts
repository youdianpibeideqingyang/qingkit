/**
 * 时间戳 ⇄ 日期互转，支持任意 IANA 时区（基于浏览器内置的 Intl，不依赖第三方库）。
 * 内部统一用“毫秒时间戳（UTC）”表示一个时刻。
 */

export type Unit = "s" | "ms" | "us" | "ns";

export const UNIT_LABEL: Record<Unit, string> = {
  s: "秒级时间戳",
  ms: "毫秒时间戳",
  us: "微秒时间戳",
  ns: "纳秒时间戳",
};

export interface Parsed {
  ms: number;
  kind: "timestamp" | "date";
  unit?: Unit;
  /** 日期里自带时区（Z、+08:00、GMT 等），此时不受“按哪个时区理解”影响 */
  hasZone?: boolean;
  /** 微秒/纳秒时间戳在毫秒以下的部分，原样保留用于显示 */
  subMs?: string;
}

/** 按位数判断时间戳单位：≤11 位秒，12–14 毫秒，15–17 微秒，18–20 纳秒；带小数按秒。 */
export function detectTimestamp(text: string): Parsed | null {
  const t = text.trim().replace(/[_,\s]/g, "");
  if (/^-?\d+\.\d+$/.test(t)) {
    const v = Number(t);
    return Number.isFinite(v) ? { ms: Math.round(v * 1000), kind: "timestamp", unit: "s" } : null;
  }
  if (!/^-?\d{1,20}$/.test(t)) return null;
  const neg = t.startsWith("-");
  const digits = neg ? t.slice(1) : t;
  const len = digits.replace(/^0+(?=\d)/, "").length;
  let unit: Unit;
  if (len <= 11) unit = "s";
  else if (len <= 14) unit = "ms";
  else if (len <= 17) unit = "us";
  else unit = "ns";
  const big = BigInt(t);
  const div = unit === "s" ? 1n : unit === "ms" ? 1n : unit === "us" ? 1000n : 1000000n;
  const ms = unit === "s" ? Number(big) * 1000 : Number(big / div);
  const rem = unit === "us" || unit === "ns" ? (big < 0n ? -big : big) % div : 0n;
  const subMs = rem > 0n ? rem.toString().padStart(unit === "us" ? 3 : 6, "0") : undefined;
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return null;
  return { ms, kind: "timestamp", unit, subMs };
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      era: "short",
    });
    partsCache.set(tz, f);
  }
  return f;
}

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = 周日
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 某个时刻在某时区的“墙上时间”。 */
export function wallTime(ms: number, tz: string): Wall {
  const parts = partsFormatter(tz).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  let year = Number(get("year"));
  if (get("era") === "BC") year = 1 - year;
  return {
    year,
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

function utcFromFields(y: number, mo: number, d: number, h: number, mi: number, s: number, msec: number): number {
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, s, msec);
  return date.getTime();
}

/** 该时刻在时区里相对 UTC 的偏移（分钟），北京时间为 +480。 */
export function tzOffsetMinutes(ms: number, tz: string): number {
  const w = wallTime(ms, tz);
  const asUtc = utcFromFields(w.year, w.month, w.day, w.hour, w.minute, w.second, 0);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/**
 * 把某时区的墙上时间换成时刻。夏令时跳过的时间（不存在）顺延到之后，
 * 重复的时间（回拨）取较早的那个。
 */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, msec: number, tz: string): number {
  const guess = utcFromFields(y, mo, d, h, mi, s, msec);
  const off1 = tzOffsetMinutes(guess, tz);
  let result = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(result, tz);
  if (off2 !== off1) {
    const alt = guess - off2 * 60000;
    // 选墙上时间能对上的那个；都对不上（跳过的时间）就用较晚的偏移
    const w = wallTime(alt, tz);
    result = w.hour === h && w.minute === mi ? Math.min(result, alt) : guess - Math.min(off1, off2) * 60000;
  }
  return result;
}

const DATE_RE =
  /^(-?\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?(?:[.,](\d{1,9}))?)?\s*(Z|UTC|GMT|(?:UTC|GMT)?\s*[+-]\d{1,2}(?::?\d{2})?)?$/i;

/** 统一各种写法：2026/11/12、2026.11.12、2026年11月12日 14时30分、20261112 等。 */
function normalizeDate(text: string): string {
  let t = text.trim();
  t = t.replace(/[年月/.](?=\d)/g, "-").replace(/日|号/g, " ").replace(/[时點点]/g, ":").replace(/分/g, ":").replace(/秒/g, "");
  t = t.replace(/上午|下午|晚上|凌晨/g, (m) => ` ${m} `);
  t = t.replace(/\s+/g, " ").replace(/:\s*$/, "").replace(/: /g, ":").trim();
  // 20261112 或 20261112143000
  const compact = t.match(/^(\d{4})(\d{2})(\d{2})(?:[T ]?(\d{2})(\d{2})(\d{2})?)?$/);
  if (compact) {
    const [, y, mo, d, h, mi, s] = compact;
    t = `${y}-${mo}-${d}` + (h ? ` ${h}:${mi}${s ? `:${s}` : ""}` : "");
  }
  return t;
}

function parseOffset(z: string): number | null {
  const s = z.replace(/^(UTC|GMT)\s*/i, "");
  if (!s || /^z$/i.test(s)) return 0;
  const m = s.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -mins : mins;
}

/** 解析日期文本。没写时区时按 tz 理解。 */
export function parseDateText(text: string, tz: string): Parsed | null {
  const raw = text.trim();
  if (!raw) return null;
  let t = normalizeDate(raw);
  // 下午 3:00 之类
  let pm: boolean | null = null;
  t = t.replace(/\s*(上午|凌晨)\s*/, () => ((pm = false), " ")).replace(/\s*(下午|晚上)\s*/, () => ((pm = true), " "));
  t = t.replace(/\s+/g, " ").trim();
  const m = t.match(DATE_RE);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", s = "0", frac = "", zone] = m;
    let hour = Number(h);
    if (pm === true && hour < 12) hour += 12;
    if (pm === false && hour === 12) hour = 0;
    const msec = Number((frac + "000").slice(0, 3));
    const nums = [Number(mo), Number(d), hour, Number(mi), Number(s)];
    if (nums[0] < 1 || nums[0] > 12 || nums[1] < 1 || nums[1] > 31 || nums[2] > 23 || nums[3] > 59 || nums[4] > 60) return null;
    if (zone) {
      const off = parseOffset(zone.replace(/\s+/g, ""));
      if (off === null) return null;
      return { ms: utcFromFields(Number(y), nums[0], nums[1], hour, nums[3], nums[4], msec) - off * 60000, kind: "date", hasZone: true };
    }
    return { ms: zonedToUtc(Number(y), nums[0], nums[1], hour, nums[3], nums[4], msec, tz), kind: "date", hasZone: false };
  }
  // 兜底：RFC 2822 / 英文写法，必须自带时区，否则结果依赖本机时区，容易误导
  if (/[a-z]/i.test(raw) && /(GMT|UTC|Z\b|[+-]\d{4})/i.test(raw)) {
    const v = Date.parse(raw);
    if (Number.isFinite(v)) return { ms: v, kind: "date", hasZone: true };
  }
  return null;
}

/** 输入既可以是时间戳也可以是日期。 */
export function parseTimeInput(text: string, tz: string): Parsed | null {
  return detectTimestamp(text) ?? parseDateText(text, tz);
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");
const CN_WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function formatOffset(mins: number): string {
  const sign = mins < 0 ? "-" : "+";
  return `${sign}${pad(Math.floor(Math.abs(mins) / 60))}:${pad(Math.abs(mins) % 60)}`;
}

export interface Formatted {
  date: string; // 2026-11-12
  time: string; // 14:30:00 或 14:30:00.123
  weekday: string; // 周四
  offset: string; // +08:00
  iso: string; // 2026-11-12T14:30:00+08:00
}

export function formatInZone(ms: number, tz: string, subMs?: string): Formatted {
  const w = wallTime(ms, tz);
  const off = tzOffsetMinutes(ms, tz);
  const msec = ((ms % 1000) + 1000) % 1000;
  const frac = msec || subMs ? `.${pad(msec, 3)}${subMs ?? ""}` : "";
  const year = w.year < 0 ? `-${pad(w.year, 4)}` : pad(w.year, 4);
  const date = `${year}-${pad(w.month)}-${pad(w.day)}`;
  const time = `${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}${frac}`;
  const offset = formatOffset(off);
  return { date, time, weekday: CN_WEEK[w.weekday] ?? "", offset, iso: `${date}T${time}${off === 0 ? "Z" : offset}` };
}

/** “3 小时前”“2 天后” */
export function relativeTime(ms: number, now: number): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const suffix = diff < 0 ? "前" : "后";
  if (abs < 5000) return "刚刚";
  const units: [number, string][] = [
    [365.25 * 86400000, "年"],
    [30.44 * 86400000, "个月"],
    [86400000, "天"],
    [3600000, "小时"],
    [60000, "分钟"],
    [1000, "秒"],
  ];
  for (const [size, name] of units) {
    if (abs >= size) {
      const v = abs / size;
      return `${v >= 10 || name === "秒" ? Math.floor(v) : Math.floor(v * 10) / 10} ${name}${suffix}`;
    }
  }
  return "刚刚";
}

/** 常用时区的中文名 */
export const ZONE_NAMES: Record<string, string> = {
  UTC: "UTC",
  "Asia/Shanghai": "北京",
  "Asia/Hong_Kong": "香港",
  "Asia/Taipei": "台北",
  "Asia/Tokyo": "东京",
  "Asia/Seoul": "首尔",
  "Asia/Singapore": "新加坡",
  "Asia/Bangkok": "曼谷",
  "Asia/Kolkata": "印度",
  "Asia/Dubai": "迪拜",
  "Europe/London": "伦敦",
  "Europe/Paris": "巴黎",
  "Europe/Berlin": "柏林",
  "Europe/Moscow": "莫斯科",
  "America/New_York": "纽约",
  "America/Chicago": "芝加哥",
  "America/Denver": "丹佛",
  "America/Los_Angeles": "洛杉矶",
  "America/Sao_Paulo": "圣保罗",
  "Australia/Sydney": "悉尼",
  "Pacific/Auckland": "奥克兰",
};

export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function zoneLabel(tz: string): string {
  return ZONE_NAMES[tz] ?? tz.split("/").pop()!.replace(/_/g, " ");
}

/** 可选时区列表；老系统不支持 supportedValuesOf 时用常用时区兜底。 */
export function allZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (list && list.length) return list.includes("UTC") ? list : ["UTC", ...list];
  } catch {
    /* 兜底 */
  }
  return Object.keys(ZONE_NAMES);
}
