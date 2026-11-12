import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

/** 分段控件：选中态是一块会滑动的底板，而不是瞬间换色。 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  small = false,
  ariaLabel,
  tabs = false,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
  ariaLabel?: string;
  tabs?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const idx = options.findIndex((o) => o.value === value);
      const btn = el.querySelectorAll<HTMLButtonElement>("button")[idx];
      if (btn) setThumb({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // 首次定位不做动画，之后切换才滑动
    const t = requestAnimationFrame(() => setAnimate(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(t);
    };
  }, [value, options]);

  return (
    <div className={`seg ${small ? "small" : ""}`} ref={ref} role={tabs ? "tablist" : "group"} aria-label={ariaLabel}>
      {thumb && (
        <span
          className={`seg-thumb ${animate ? "anim" : ""}`}
          style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }}
          aria-hidden="true"
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          role={tabs ? "tab" : undefined}
          aria-selected={tabs ? o.value === value : undefined}
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
