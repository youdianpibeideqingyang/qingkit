import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { hidePanel, inTauri, setExpanded as setWindowExpanded, setPinned } from "./lib/bridge";
import { loadPref, savePref, useToast } from "./lib/useToast";
import { IconBraces, IconCheck, IconClock, IconExpand, IconHide, IconPin, IconQr, IconShrink } from "./components/Icons";
import { TimePanel } from "./components/TimePanel";
import { Segmented } from "./components/Segmented";
import { QrPanel } from "./components/QrPanel";
import { JsonPanel } from "./components/JsonPanel";

type Tab = "qr" | "json" | "time";

const TABS: { value: Tab; label: ReactNode; title: string }[] = [
  { value: "qr", label: <><IconQr size={14} />二维码</>, title: "⌘1" },
  { value: "json", label: <><IconBraces size={14} />JSON</>, title: "⌘2" },
  { value: "time", label: <><IconClock size={14} />时间</>, title: "⌘3" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [tab, setTab] = useState<Tab>(() => loadPref<Tab>("tab", "qr"));
  const [pinned, setPinnedState] = useState(false);
  // 浏览器里调样式时，宽度够大就当作大窗口
  const [expanded, setExpanded] = useState(() => !inTauri && window.innerWidth >= 760);
  const { message, leaving, show } = useToast();

  useEffect(() => savePref("tab", tab), [tab]);

  useEffect(() => {
    setPinned(pinned);
  }, [pinned]);

  // 切换大小窗口：内容先淡出 → 窗口平滑缩放 → 换布局 → 内容淡入
  const [morphing, setMorphing] = useState(false);
  const busy = useRef(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const switchSize = useCallback(async (next: boolean) => {
    if (busy.current || expandedRef.current === next) return;
    busy.current = true;
    setMorphing(true);
    await sleep(120);
    try {
      await setWindowExpanded(next);
    } catch (e) {
      console.warn("切换窗口大小失败", e);
    }
    setExpanded(next);
    await sleep(30);
    setMorphing(false);
    busy.current = false;
  }, []);

  const toggleExpanded = () => switchSize(!expandedRef.current);

  const autoExpand = useCallback(() => {
    if (expandedRef.current) return;
    switchSize(true).then(() => show("内容较多，已切到大窗口（⌘E 收回）"));
  }, [show, switchSize]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape" && !pinned && !expanded) hidePanel();
      if (e.metaKey && (e.key === "1" || e.key === "2" || e.key === "3")) {
        e.preventDefault();
        setTab(TABS[Number(e.key) - 1].value);
      }
      if (e.metaKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        toggleExpanded();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`panel ${expanded ? "expanded" : ""} ${morphing ? "morphing" : ""}`}>
      <div className="header" data-tauri-drag-region={expanded ? "" : undefined}>
        <Segmented options={TABS} value={tab} onChange={setTab} tabs ariaLabel="功能" />
        <div className="drag-space" data-tauri-drag-region={expanded ? "" : undefined} />
        <div style={{ display: "flex", gap: 4 }}>
          {!expanded && (
            <button
              className="icon-btn"
              aria-label={pinned ? "取消固定面板" : "固定面板（失焦不收起）"}
              title={pinned ? "取消固定" : "固定面板（失焦不收起）"}
              aria-pressed={pinned}
              onClick={() => setPinnedState((v) => !v)}
            >
              <IconPin />
            </button>
          )}
          <button
            className="icon-btn"
            aria-label={expanded ? "收回菜单栏（⌘E）" : "大窗口（⌘E）"}
            title={expanded ? "收回菜单栏（⌘E）" : "大窗口（⌘E）"}
            onClick={toggleExpanded}
          >
            {expanded ? <IconShrink /> : <IconExpand />}
          </button>
          <button className="icon-btn" aria-label="收起到后台" title="收起到后台（点菜单栏图标再打开；退出请右键菜单栏图标）" onClick={() => hidePanel()}>
            <IconHide />
          </button>
        </div>
      </div>

      {/* 三个页签都保持挂载，切换时不丢状态；显示时淡入 */}
      <div className={`tab-body qr ${tab === "qr" ? "active" : ""}`} hidden={tab !== "qr"}>
        <div className={`qr-layout ${expanded ? "wide" : ""}`}>
          <QrPanel toast={show} />
        </div>
      </div>
      <div className={`tab-body json ${tab === "json" ? "active" : ""}`} hidden={tab !== "json"}>
        <JsonPanel toast={show} expanded={expanded} onAutoExpand={autoExpand} active={tab === "json"} />
      </div>
      <div className={`tab-body time ${tab === "time" ? "active" : ""}`} hidden={tab !== "time"}>
        <TimePanel toast={show} expanded={expanded} />
      </div>

      {message && (
        <div className={`toast ${leaving ? "leaving" : ""}`} role="status">
          <IconCheck size={12} />
          {message}
        </div>
      )}
    </div>
  );
}
