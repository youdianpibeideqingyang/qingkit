import { useCallback, useRef, useState } from "react";

/** 提示条：出现时上滑淡入，消失前先播放淡出动画。 */
export function useToast(duration = 1600) {
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);
  const show = useCallback(
    (msg: string) => {
      window.clearTimeout(timer.current);
      window.clearTimeout(leaveTimer.current);
      setLeaving(false);
      setMessage(msg);
      timer.current = window.setTimeout(() => {
        setLeaving(true);
        leaveTimer.current = window.setTimeout(() => {
          setMessage(null);
          setLeaving(false);
        }, 180);
      }, duration);
    },
    [duration],
  );
  return { message, leaving, show };
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
