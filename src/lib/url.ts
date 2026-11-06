/** 把本机地址换成手机可访问的局域网地址。 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "[::]"]);

export interface LanUrl {
  /** 手机访问地址 */
  url: string;
  /** 端口（未写时按协议默认 80 / 443） */
  port: number;
  /** 原地址是否是本机地址（localhost 等），是的话主机名被替换了 */
  replaced: boolean;
  /** 原地址的主机名 */
  host: string;
}

/**
 * 支持的输入：
 *   localhost:8080/path、http://127.0.0.1:5173/、8080、:8080/a、
 *   http://192.168.1.3:3000（已经是局域网地址则原样保留）
 */
export function toLanUrl(input: string, lanIp: string): LanUrl | null {
  let text = input.trim();
  if (!text) return null;
  if (/^\d{2,5}$/.test(text)) text = `localhost:${text}`;
  if (text.startsWith(":")) text = `localhost${text}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `http://${text}`;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (!u.hostname) return null;
  const host = u.hostname;
  const replaced = LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
  if (replaced && lanIp) u.hostname = lanIp;
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  let url = u.toString();
  // 用户没写路径时，不要自作主张加结尾的 “/”
  if (!/^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i.test(text) && u.pathname === "/" && !u.search && !u.hash) {
    url = url.replace(/\/$/, "");
  }
  return { url, port, replaced, host };
}

/** 文本看起来像不像一个可以转码的本机地址（用来自动读取剪贴板）。 */
export function looksLikeLocalUrl(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 2048 || /\s/.test(t)) return false;
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$|\?|#)/i.test(t);
}

/** 只监听本机时，给常见开发服务器的改法。 */
export function hostFixHints(command: string, project?: string | null): string[] {
  const c = command.toLowerCase();
  const p = (project ?? "").toLowerCase();
  if (c.includes("python")) return ["python3 -m http.server 8000 --bind 0.0.0.0", "Flask：flask run --host 0.0.0.0", "Django：python manage.py runserver 0.0.0.0:8000"];
  if (c.includes("java")) return ["Spring Boot：server.address=0.0.0.0"];
  if (c.includes("ruby")) return ["rails s -b 0.0.0.0"];
  if (p.includes("next")) return ["next dev -H 0.0.0.0"];
  return ["Vite：npx vite --host 0.0.0.0", "webpack-dev-server：--host 0.0.0.0", "Next.js：next dev -H 0.0.0.0"];
}
