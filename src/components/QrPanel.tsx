import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  browserCurrentUrl,
  listInterfaces,
  listListeningPorts,
  onPanelFocus,
  openInBrowser,
  probePort,
  readClipboardText,
  writeClipboardPng,
  writeClipboardText,
  type Browser,
  type ListeningPort,
  type NetInterface,
} from "../lib/bridge";
import { hostFixHints, looksLikeLocalUrl, toLanUrl } from "../lib/url";
import { loadPref, savePref } from "../lib/useToast";
import {
  IconCheck,
  IconCheckCircle,
  IconChevronDown,
  IconChrome,
  IconClipboard,
  IconCompass,
  IconCopy,
  IconInfo,
  IconRefresh,
  IconWarn,
} from "./Icons";

/** macOS 自带的后台服务，列表里默认不显示。 */
const SYSTEM_PROCESSES = new Set([
  "rapportd",
  "ControlCe",
  "ControlCenter",
  "sharingd",
  "AirPlayXPCHelper",
  "identityservicesd",
  "remoted",
  "launchd",
  "WiFiAgent",
  "UserEventAgent",
]);

type Reach = "idle" | "checking" | "ok" | "fail" | "external";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function QrPanel({ toast }: { toast: (msg: string) => void }) {
  const [input, setInput] = useState<string>(() => loadPref("qr.input", ""));
  const [ifaces, setIfaces] = useState<NetInterface[]>([]);
  const [ifaceName, setIfaceName] = useState<string | null>(() => loadPref<string | null>("qr.iface", null));
  const [remember, setRemember] = useState<boolean>(() => loadPref("qr.remember", true));
  const [menuOpen, setMenuOpen] = useState(false);
  const [ports, setPorts] = useState<ListeningPort[]>([]);
  const [showSystem, setShowSystem] = useState(false);
  const [loadingPorts, setLoadingPorts] = useState(false);
  const [qr, setQr] = useState<string>("");
  const [reach, setReach] = useState<Reach>("idle");
  const lastClip = useRef<string>("");
  const menuRef = useRef<HTMLDivElement>(null);

  const iface = useMemo(() => {
    return ifaces.find((i) => i.name === ifaceName) ?? ifaces.find((i) => i.recommended) ?? ifaces[0] ?? null;
  }, [ifaces, ifaceName]);

  const lan = useMemo(() => (iface ? toLanUrl(input, iface.ip) : null), [input, iface]);

  const refresh = useCallback(async () => {
    setLoadingPorts(true);
    try {
      const [i, p] = await Promise.all([listInterfaces(), listListeningPorts()]);
      setIfaces(i);
      setPorts(p);
    } catch (e) {
      toast(String(e));
    } finally {
      setLoadingPorts(false);
    }
  }, [toast]);

  const pullClipboard = useCallback(
    async (manual: boolean) => {
      try {
        const text = (await readClipboardText()).trim();
        if (manual) {
          if (!text) return toast("剪贴板是空的");
          setInput(text);
          return;
        }
        // 自动读取：只在剪贴板里是新的本机地址时填入
        if (text && text !== lastClip.current && looksLikeLocalUrl(text)) {
          lastClip.current = text;
          setInput(text);
          toast("已读取剪贴板里的地址");
        }
      } catch (e) {
        if (manual) toast(`读取剪贴板失败：${e}`);
      }
    },
    [toast],
  );

  useEffect(() => {
    refresh();
    pullClipboard(false);
    let unlisten: (() => void) | undefined;
    onPanelFocus(() => {
      refresh();
      pullClipboard(false);
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [refresh, pullClipboard]);

  useEffect(() => savePref("qr.input", input), [input]);
  useEffect(() => savePref("qr.remember", remember), [remember]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  // 生成二维码
  useEffect(() => {
    if (!lan) {
      setQr("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(lan.url, { margin: 1, width: 400, errorCorrectionLevel: "M" })
      .then((d) => !cancelled && setQr(d))
      .catch(() => !cancelled && setQr(""));
    return () => {
      cancelled = true;
    };
  }, [lan]);

  // 检测手机能否访问：从本机用局域网 IP 连一下端口
  useEffect(() => {
    if (!lan || !iface) {
      setReach("idle");
      return;
    }
    const hostIsOurs = lan.replaced || lan.host === iface.ip || ifaces.some((i) => i.ip === lan.host);
    if (!hostIsOurs) {
      setReach("external");
      return;
    }
    setReach("checking");
    let cancelled = false;
    const t = window.setTimeout(() => {
      probePort(iface.ip, lan.port)
        .then((ok) => !cancelled && setReach(ok ? "ok" : "fail"))
        .catch(() => !cancelled && setReach("fail"));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [lan, iface, ifaces, ports]);

  const chooseIface = (name: string) => {
    setIfaceName(name);
    savePref("qr.iface", remember ? name : null);
    setMenuOpen(false);
  };

  const fromBrowser = async (b: Browser, label: string) => {
    try {
      const url = await browserCurrentUrl(b);
      if (!url) return toast(`${label} 没有打开的页面`);
      setInput(url);
    } catch (e) {
      toast(String(e));
    }
  };

  const copyLink = async () => {
    if (!lan) return;
    await writeClipboardText(lan.url);
    toast("已复制链接");
  };

  const copyQr = async () => {
    if (!qr) return;
    try {
      await writeClipboardPng(dataUrlToBytes(qr));
      toast("已复制二维码图片");
    } catch (e) {
      toast(`复制图片失败：${e}`);
    }
  };

  const visiblePorts = ports.filter((p) => showSystem || !SYSTEM_PROCESSES.has(p.command));
  const hiddenCount = ports.length - visiblePorts.length;
  const currentPort = lan?.replaced || (lan && iface && lan.host === iface.ip) ? lan.port : null;
  const currentPortInfo = ports.find((p) => p.port === currentPort);

  const highlightIp = (url: string, ip: string | undefined) => {
    if (!ip || !url.includes(ip)) return url;
    const idx = url.indexOf(ip);
    return (
      <>
        {url.slice(0, idx)}
        <b>{ip}</b>
        {url.slice(idx + ip.length)}
      </>
    );
  };

  return (
    <>
      <div className="card qr-addr">
        <label htmlFor="addr" className="label">
          本机地址
        </label>
        <input
          id="addr"
          className="text-input"
          placeholder="localhost:8080/path，或只写端口 8080"
          value={input}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="qr-sources">
          <button className="chip" onClick={() => pullClipboard(true)}>
            <IconClipboard size={13} />
            从剪贴板
          </button>
          <button className="chip" onClick={() => fromBrowser("chrome", "Chrome")}>
            <IconChrome size={13} />
            Chrome 当前页
          </button>
          <button className="chip" onClick={() => fromBrowser("safari", "Safari")}>
            <IconCompass size={13} />
            Safari 当前页
          </button>
        </div>
        <div className="hr" />
        <div className="row-between">
          <span className="label">手机访问地址</span>
          <div className="dropdown" ref={menuRef}>
            <button
              className="iface-btn"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              disabled={ifaces.length === 0}
            >
              <span className={`dot ${iface && (iface.kind === "vpn" || iface.kind === "virtual") ? "warn" : ""}`} />
              <span className="t">{iface ? `${iface.label} · ${iface.name} · ${iface.ip}` : "没有可用网络"}</span>
              <IconChevronDown />
            </button>
            {menuOpen && (
              <div className="menu" role="listbox" aria-label="选择网卡">
                {ifaces.map((i) => (
                  <button
                    key={`${i.name}-${i.ip}`}
                    className="opt"
                    role="option"
                    aria-selected={i.name === iface?.name}
                    onClick={() => chooseIface(i.name)}
                  >
                    <span className="check">{i.name === iface?.name && <IconCheck size={14} />}</span>
                    <span className="body">
                      <span className="t">
                        {i.label} · {i.name}
                        {i.recommended && "（推荐）"}
                      </span>
                      <span className="ip">{i.ip}</span>
                      {i.note && <span className="note">{i.note}</span>}
                    </span>
                  </button>
                ))}
                <label className="footer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => {
                      setRemember(e.target.checked);
                      savePref("qr.iface", e.target.checked ? iface?.name ?? null : null);
                    }}
                  />
                  记住选择（不勾选则每次用推荐的网卡）
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="lan-url">
          <span className="u">
            {lan ? highlightIp(lan.url, lan.replaced ? iface?.ip : undefined) : <span style={{ color: "var(--text-3)" }}>输入地址后显示</span>}
          </span>
          <button className="icon-btn" aria-label="复制手机访问地址" onClick={copyLink} disabled={!lan}>
            <IconCopy size={15} />
          </button>
        </div>
      </div>

      <div className="card qr-card">
        {qr ? (
          <img className={`qr-img ${reach === "fail" ? "dim" : ""}`} src={qr} alt={`二维码：${lan?.url ?? ""}`} />
        ) : (
          <div className="qr-empty">输入本机地址，或点下方正在监听的端口，生成手机可扫的二维码</div>
        )}

        {reach === "ok" && (
          <div className="status ok">
            <IconCheckCircle size={14} />
            {lan?.port} 已对局域网开放，同一 Wi‑Fi 的手机可直接扫码
          </div>
        )}
        {reach === "checking" && (
          <div className="status muted">
            <IconInfo size={14} />
            正在检测手机能否访问…
          </div>
        )}
        {reach === "external" && (
          <div className="status muted">
            <IconInfo size={14} />
            这不是本机地址，按原样生成二维码
          </div>
        )}
        {reach === "fail" && lan && (
          <div className="banner warn" style={{ width: "100%" }}>
            <div className="row">
              <IconWarn size={16} />
              <span>
                {currentPortInfo?.exposure === "loopback" ? (
                  <b>{lan.port} 只监听 127.0.0.1，手机扫码会打不开。</b>
                ) : currentPortInfo ? (
                  <b>{lan.port} 用 {iface?.ip} 连不上，可能被防火墙拦了。</b>
                ) : (
                  <b>{lan.port} 端口没有服务在运行。</b>
                )}
                {currentPortInfo?.exposure === "loopback" && " 重新启动时让它监听所有网卡："}
              </span>
            </div>
            {currentPortInfo?.exposure === "loopback" &&
              hostFixHints(currentPortInfo.command, currentPortInfo.project).map((h) => (
                <div className="cmd" key={h}>
                  <span title={h}>{h}</span>
                  <button
                    onClick={async () => {
                      await writeClipboardText(h.replace(/^[^：]+：/, ""));
                      toast("已复制命令");
                    }}
                  >
                    复制
                  </button>
                </div>
              ))}
          </div>
        )}

        <div className={reach === "fail" ? "grid-2" : "grid-3"}>
          {reach === "fail" ? (
            <>
              <button className="btn" onClick={refresh}>
                重新检测
              </button>
              <button className="btn" onClick={copyLink}>
                仍然复制链接
              </button>
            </>
          ) : (
            <>
              <button className="btn primary" onClick={copyLink} disabled={!lan}>
                复制链接
              </button>
              <button className="btn" onClick={copyQr} disabled={!qr}>
                复制二维码图片
              </button>
              <button className="btn" onClick={() => lan && openInBrowser(lan.url)} disabled={!lan}>
                浏览器打开
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
        <div className="row-between" style={{ padding: "0 2px" }}>
          <span className="label">本机正在监听 · 点一下出码</span>
          <div style={{ display: "flex", alignItems: "center" }}>
            {hiddenCount > 0 && (
              <button className="btn link" onClick={() => setShowSystem((v) => !v)}>
                {showSystem ? "隐藏系统服务" : `显示系统服务（${hiddenCount}）`}
              </button>
            )}
            <button className="btn link" onClick={refresh} disabled={loadingPorts}>
              <IconRefresh size={12} />
              刷新
            </button>
          </div>
        </div>
        <div className="card ports">
          <div className="ports-list">
            {visiblePorts.length === 0 && <div className="empty-note">{loadingPorts ? "正在扫描…" : "没有发现正在监听的端口"}</div>}
            {visiblePorts.map((p) => (
              <button
                key={p.port}
                className="port-row"
                aria-current={p.port === currentPort}
                onClick={() => setInput(`localhost:${p.port}`)}
                title={`进程 ${p.pid}，监听 ${p.addresses.join("、")}`}
              >
                <span className="p">{p.port}</span>
                <span className="n">
                  {p.command}
                  {p.project ? ` · ${p.project}` : ""}
                </span>
                {p.exposure === "lan" ? (
                  <span className="tag ok">局域网可访问</span>
                ) : p.exposure === "loopback" ? (
                  <span className="tag warn">仅本机</span>
                ) : (
                  <span className="tag warn">仅 {p.addresses[0]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
