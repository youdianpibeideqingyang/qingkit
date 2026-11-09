/**
 * 与 Rust 端通信。在普通浏览器里（npm run dev 调界面时）没有 Tauri，
 * 这里返回演示数据，方便单独调样式。
 */
import { invoke } from "@tauri-apps/api/core";

export interface NetInterface {
  name: string;
  ip: string;
  kind: "wifi" | "ethernet" | "vpn" | "virtual" | "other";
  label: string;
  recommended: boolean;
  note: string | null;
}

export interface ListeningPort {
  port: number;
  pid: number;
  command: string;
  project: string | null;
  exposure: "lan" | "loopback" | "specific";
  addresses: string[];
}

export type Browser = "chrome" | "safari" | "edge" | "arc";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const demoInterfaces: NetInterface[] = [
  { name: "en0", ip: "192.168.31.24", kind: "wifi", label: "Wi‑Fi", recommended: true, note: null },
  { name: "en7", ip: "10.32.8.115", kind: "ethernet", label: "有线", recommended: false, note: null },
  { name: "utun4", ip: "172.16.2.9", kind: "vpn", label: "VPN / 隧道", recommended: false, note: "VPN 通道，手机通常连不上" },
];

const demoPorts: ListeningPort[] = [
  { port: 5173, pid: 2, command: "node", project: "vite-demo", exposure: "loopback", addresses: ["127.0.0.1"] },
  { port: 5389, pid: 3, command: "node", project: "rn_taro_hotel", exposure: "lan", addresses: ["*"] },
  { port: 7890, pid: 4, command: "FlClash", project: null, exposure: "loopback", addresses: ["127.0.0.1"] },
  { port: 8080, pid: 1, command: "node", project: "trn-ztrip-hotel-nfes-function", exposure: "lan", addresses: ["*", "[::]"] },
];

export async function listInterfaces(): Promise<NetInterface[]> {
  if (!inTauri) return demoInterfaces;
  return invoke<NetInterface[]>("list_interfaces");
}

export async function listListeningPorts(): Promise<ListeningPort[]> {
  if (!inTauri) return demoPorts;
  return invoke<ListeningPort[]>("list_listening_ports");
}

export async function probePort(ip: string, port: number): Promise<boolean> {
  if (!inTauri) return demoPorts.some((p) => p.port === port && p.exposure === "lan");
  return invoke<boolean>("probe_port", { ip, port });
}

export async function browserCurrentUrl(browser: Browser): Promise<string> {
  if (!inTauri) return "http://localhost:8080/free-order?env=fat";
  return invoke<string>("browser_current_url", { browser });
}

export async function setPinned(pinned: boolean): Promise<void> {
  if (inTauri) await invoke("set_pinned", { pinned });
}

/** 切换大窗口 / 菜单栏面板。 */
export async function setExpanded(expanded: boolean): Promise<void> {
  if (inTauri) await invoke("set_expanded", { expanded });
}

export async function hidePanel(): Promise<void> {
  if (inTauri) await invoke("hide_panel");
}

export async function quitApp(): Promise<void> {
  if (inTauri) await invoke("quit_app");
}

export async function readClipboardText(): Promise<string> {
  if (inTauri) {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    return (await readText()) ?? "";
  }
  return navigator.clipboard?.readText?.() ?? "";
}

export async function writeClipboardText(text: string): Promise<void> {
  try {
    if (inTauri) {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(text);
      return;
    }
    await navigator.clipboard?.writeText(text);
  } catch (e) {
    console.warn("写入剪贴板失败", e);
  }
}

export async function writeClipboardPng(png: Uint8Array): Promise<void> {
  if (inTauri) {
    const { writeImage } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeImage(png);
    return;
  }
  const blob = new Blob([png as BlobPart], { type: "image/png" });
  await navigator.clipboard?.write([new ClipboardItem({ "image/png": blob })]);
}

export async function openInBrowser(url: string): Promise<void> {
  if (inTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank");
}

/** 面板重新获得焦点时回调（用来刷新端口、读剪贴板）。 */
export async function onPanelFocus(cb: () => void): Promise<() => void> {
  if (!inTauri) {
    window.addEventListener("focus", cb);
    return () => window.removeEventListener("focus", cb);
  }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().onFocusChanged(({ payload }) => {
    if (payload) cb();
  });
}
