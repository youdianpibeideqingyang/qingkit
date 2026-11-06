import { useCallback, useRef, useState } from "react";

export function useToast(duration = 1600) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback(
    (msg: string) => {
      setMessage(msg);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(null), duration);
    },
    [duration],
  );
  return { message, show };
}

/** localStorage 读写；无痕模式或被禁用时静默失败。 */
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`qingkit:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`qingkit:${key}`, JSON.stringify(value));
  } catch {
    /* 忽略 */
  }
}
