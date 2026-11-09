import type { Token, TokenClass } from "./json";

export interface Match {
  line: number; // 从 0 开始
  start: number;
  end: number;
}

/** 在每一行里查找关键字（不跨行），默认忽略大小写。最多返回 limit 处。 */
export function findMatches(lines: string[], query: string, caseSensitive = false, limit = 10000): Match[] {
  if (!query) return [];
  const q = caseSensitive ? query : query.toLowerCase();
  const out: Match[] = [];
  for (let i = 0; i < lines.length; i++) {
    const text = caseSensitive ? lines[i] : lines[i].toLowerCase();
    let from = 0;
    while (true) {
      const idx = text.indexOf(q, from);
      if (idx < 0) break;
      out.push({ line: i, start: idx, end: idx + q.length });
      if (out.length >= limit) return out;
      from = idx + Math.max(1, q.length);
    }
  }
  return out;
}

/** “:120” 或 “120行” 表示跳到第 120 行，返回从 1 开始的行号。 */
export function parseGotoLine(query: string): number | null {
  const m = query.trim().match(/^(?::|第)?\s*(\d+)\s*行?$/);
  if (!m || !(query.trim().startsWith(":") || query.trim().startsWith("第") || query.trim().endsWith("行"))) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

export interface Segment {
  text: string;
  cls: TokenClass;
  /** 0：普通；1：命中；2：当前命中 */
  mark: 0 | 1 | 2;
}

/** 把一行的高亮 token 按命中区间切开，方便渲染 <mark>。 */
export function splitByRanges(tokens: Token[], ranges: { start: number; end: number; current: boolean }[]): Segment[] {
  if (ranges.length === 0) return tokens.map((t) => ({ text: t.text, cls: t.cls, mark: 0 }));
  // 收集所有切点
  const cuts = new Set<number>();
  for (const r of ranges) {
    cuts.add(r.start);
    cuts.add(r.end);
  }
  const markAt = (pos: number): 0 | 1 | 2 => {
    let m: 0 | 1 | 2 = 0;
    for (const r of ranges) {
      if (pos >= r.start && pos < r.end) {
        if (r.current) return 2;
        m = 1;
      }
    }
    return m;
  };
  const out: Segment[] = [];
  let offset = 0;
  for (const t of tokens) {
    const tStart = offset;
    const tEnd = offset + t.text.length;
    const points = [tStart, ...[...cuts].filter((c) => c > tStart && c < tEnd).sort((a, b) => a - b), tEnd];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (b <= a) continue;
      const seg: Segment = { text: t.text.slice(a - tStart, b - tStart), cls: t.cls, mark: markAt(a) };
      const last = out[out.length - 1];
      if (last && last.cls === seg.cls && last.mark === seg.mark) last.text += seg.text;
      else out.push(seg);
    }
    offset = tEnd;
  }
  return out;
}

/** 估算一行的显示宽度（等宽字体，中日韩等全角字符算 2 个字符宽）。 */
export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || c >= 0x20000) ? 2 : 1;
  }
  return w;
}
