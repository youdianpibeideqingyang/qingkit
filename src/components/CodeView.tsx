import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Token } from "../lib/json";
import { displayWidth, splitByRanges, type Match } from "../lib/search";

const LINE_HEIGHT = 19;
const PAD = 8;
const OVERSCAN = 40;

interface Props {
  lines: Token[][];
  matches: Match[];
  current: number; // 当前命中下标，-1 表示无
  flagLines: Set<number>; // 从 1 开始的行号
  gotoLine: number | null; // 从 1 开始
}

/** 只渲染可见区域的代码视图，几万行也不卡。 */
export function CodeView({ lines, matches, current, flagLines, gotoLine }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxWidth = useMemo(() => {
    let w = 0;
    for (const l of lines) {
      let lw = 0;
      for (const t of l) lw += displayWidth(t.text);
      if (lw > w) w = lw;
    }
    return w;
  }, [lines]);

  const byLine = useMemo(() => {
    const map = new Map<number, { start: number; end: number; current: boolean }[]>();
    matches.forEach((m, idx) => {
      const arr = map.get(m.line) ?? [];
      arr.push({ start: m.start, end: m.end, current: idx === current });
      map.set(m.line, arr);
    });
    return map;
  }, [matches, current]);

  const scrollToLine = (line0: number) => {
    const el = ref.current;
    if (!el) return;
    const top = PAD + line0 * LINE_HEIGHT;
    if (top < el.scrollTop + LINE_HEIGHT * 2 || top > el.scrollTop + el.clientHeight - LINE_HEIGHT * 3) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2);
      setScrollTop(el.scrollTop);
    }
  };

  // 当前命中变化：先滚到那一行（让它被渲染），再水平滚到命中位置
  useEffect(() => {
    if (current < 0 || !matches[current]) return;
    scrollToLine(matches[current].line);
    requestAnimationFrame(() => {
      const mark = ref.current?.querySelector<HTMLElement>("[data-current]");
      mark?.scrollIntoView({ block: "nearest", inline: "center" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, matches]);

  useEffect(() => {
    if (gotoLine !== null) scrollToLine(Math.min(lines.length, gotoLine) - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotoLine]);

  const first = Math.max(0, Math.floor((scrollTop - PAD) / LINE_HEIGHT) - OVERSCAN);
  const last = Math.min(lines.length, Math.ceil((scrollTop + height) / LINE_HEIGHT) + OVERSCAN);
  const numWidth = Math.max(3, String(lines.length).length) + 1.5;

  const rows = [];
  for (let i = first; i < last; i++) {
    const segs = splitByRanges(lines[i], byLine.get(i) ?? []);
    const isGoto = gotoLine === i + 1;
    rows.push(
      <div className={`ln ${flagLines.has(i + 1) ? "flag" : ""} ${isGoto ? "goto" : ""}`} key={i} style={{ top: PAD + i * LINE_HEIGHT }}>
        <span className="num" style={{ width: `${numWidth}ch` }}>
          {i + 1}
        </span>
        <span>
          {segs.map((s, j) => {
            const cls = s.cls === "space" || s.cls === "punct" ? undefined : `t-${s.cls}`;
            if (s.mark === 0) return cls ? <span key={j} className={cls}>{s.text}</span> : <span key={j}>{s.text}</span>;
            return (
              <mark key={j} className={`${cls ?? ""} ${s.mark === 2 ? "cur" : ""}`} data-current={s.mark === 2 ? "" : undefined}>
                {s.text}
              </mark>
            );
          })}
        </span>
      </div>,
    );
  }

  return (
    <div className="code" ref={ref} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div
        className="code-inner"
        style={{ height: PAD * 2 + lines.length * LINE_HEIGHT, minWidth: `calc(${maxWidth + numWidth}ch + 40px)` }}
      >
        {rows}
      </div>
    </div>
  );
}
