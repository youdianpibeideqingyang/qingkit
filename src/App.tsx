import { useEffect, useState } from "react";
import { hidePanel, quitApp, setPinned } from "./lib/bridge";
import { loadPref, savePref, useToast } from "./lib/useToast";
import { IconBraces, IconCheck, IconPin, IconPower, IconQr } from "./components/Icons";
import { QrPanel } from "./components/QrPanel";
import { JsonPanel } from "./components/JsonPanel";

type Tab = "qr" | "json";

export default function App() {
  const [tab, setTab] = useState<Tab>(() => loadPref<Tab>("tab", "qr"));
  const [pinned, setPinnedState] = useState(false);
  const { message, show } = useToast();

  useEffect(() => savePref("tab", tab), [tab]);

  useEffect(() => {
    setPinned(pinned);
  }, [pinned]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pinned) hidePanel();
      if (e.metaKey && (e.key === "1" || e.key === "2")) {
        e.preventDefault();
        setTab(e.key === "1" ? "qr" : "json");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  return (
    <div className="panel">
      <div className="header">
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
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className="icon-btn"
            aria-label={pinned ? "取消固定面板" : "固定面板（失焦不收起）"}
            title={pinned ? "取消固定" : "固定面板（失焦不收起）"}
            aria-pressed={pinned}
            onClick={() => setPinnedState((v) => !v)}
          >
            <IconPin />
          </button>
          <button className="icon-btn" aria-label="退出 QingKit" title="退出 QingKit" onClick={() => quitApp()}>
            <IconPower />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: tab === "json" ? 10 : 12, overflowY: tab === "qr" ? "auto" : "hidden" }}>
        {tab === "qr" ? <QrPanel toast={show} /> : <JsonPanel toast={show} />}
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
