import { useEffect, useState } from "react";
import { hidePanel, inTauri, quitApp, setExpanded as setWindowExpanded, setPinned } from "./lib/bridge";
import { loadPref, savePref, useToast } from "./lib/useToast";
import { IconBraces, IconCheck, IconExpand, IconPin, IconPower, IconQr, IconShrink } from "./components/Icons";
import { QrPanel } from "./components/QrPanel";
import { JsonPanel } from "./components/JsonPanel";

type Tab = "qr" | "json";

export default function App() {
  const [tab, setTab] = useState<Tab>(() => loadPref<Tab>("tab", "qr"));
  const [pinned, setPinnedState] = useState(false);
  // 浏览器里调样式时，宽度够大就当作大窗口
  const [expanded, setExpanded] = useState(() => !inTauri && window.innerWidth >= 760);
  const { message, show } = useToast();

  useEffect(() => savePref("tab", tab), [tab]);

  useEffect(() => {
    setPinned(pinned);
  }, [pinned]);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    setWindowExpanded(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape" && !pinned && !expanded) hidePanel();
      if (e.metaKey && (e.key === "1" || e.key === "2")) {
        e.preventDefault();
        setTab(e.key === "1" ? "qr" : "json");
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
    <div className={`panel ${expanded ? "expanded" : ""}`}>
      <div className="header" data-tauri-drag-region={expanded ? "" : undefined}>
        <div className="seg" role="tablist">
          <button role="tab" aria-pressed={tab === "qr"} aria-selected={tab === "qr"} onClick={() => setTab("qr")} title="⌘1">
            <IconQr size={14} />
            二维码
          </button>
          <button role="tab" aria-pressed={tab === "json"} aria-selected={tab === "json"} onClick={() => setTab("json")} title="⌘2">
            <IconBraces size={14} />
            JSON
          </button>
        </div>
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
          <button className="icon-btn" aria-label="退出 QingKit" title="退出 QingKit" onClick={() => quitApp()}>
            <IconPower />
          </button>
        </div>
      </div>

      <div className={`tab-body ${tab}`}>
        {tab === "qr" ? (
          <div className={`qr-layout ${expanded ? "wide" : ""}`}>
            <QrPanel toast={show} />
          </div>
        ) : (
          <JsonPanel toast={show} expanded={expanded} />
        )}
      </div>

      {message && (
        <div className="toast" role="status">
          <IconCheck size={12} />
          {message}
        </div>
      )}
    </div>
  );
}
