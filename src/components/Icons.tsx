import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: P, strokeWidth = 1.4) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

export const IconQr = (p: P) => (
  <svg {...base(p, 1.5)}>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <path d="M9.5 9.5h1.5M13 9.5v1.5M9.5 13h4" />
  </svg>
);

export const IconBraces = (p: P) => (
  <svg {...base(p, 1.5)}>
    <path d="M5.5 2.5c-1.5 0-2 .7-2 2v1.6c0 .9-.5 1.4-1.5 1.9 1 .5 1.5 1 1.5 1.9v1.6c0 1.3.5 2 2 2M10.5 2.5c1.5 0 2 .7 2 2v1.6c0 .9.5 1.4 1.5 1.9-1 .5-1.5 1-1.5 1.9v1.6c0 1.3-.5 2-2 2" />
  </svg>
);

export const IconPin = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.5 1.8l4.7 4.7-1.6.6-2.6 2.6-.3 3.1-1.1 1.1-2.4-2.4-3.5 3.5M6.2 9.8 3.8 7.4l1.1-1.1 3.1-.3 2.6-2.6z" />
  </svg>
);

export const IconPower = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 2v5.5M4.6 4.2a5.3 5.3 0 1 0 6.8 0" />
  </svg>
);

export const IconClipboard = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="2.5" width="9" height="12" rx="1.5" />
    <path d="M6 2.5h4v2H6z" />
  </svg>
);

export const IconChrome = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="2.3" />
    <path d="M8 5.7h5.6M6 9.2 3.3 4.4M10 9.2l-2.7 4.7" />
  </svg>
);

export const IconCompass = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="6.3" />
    <path d="M10.6 5.4 9.2 9.2 5.4 10.6 6.8 6.8z" />
  </svg>
);

export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
  </svg>
);

export const IconChevronDown = (p: P) => (
  <svg {...base({ size: 10, ...p })} viewBox="0 0 10 10">
    <path d="M2 3.5 5 6.5 8 3.5" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base({ size: 10, ...p }, 1.5)} viewBox="0 0 10 10">
    <path d="M3.5 2 6.5 5 3.5 8" />
  </svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base(p, 1.6)}>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
  </svg>
);

export const IconCheckCircle = (p: P) => (
  <svg {...base(p, 1.6)}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M5.3 8.2 7.1 10l3.6-3.8" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base(p, 1.8)}>
    <path d="M3 8.5 6.3 11.5 13 4.5" />
  </svg>
);

export const IconWarn = (p: P) => (
  <svg {...base(p, 1.5)}>
    <path d="M8 1.8 14.8 13.7H1.2z" />
    <path d="M8 6.2v3.4M8 11.6v.2" />
  </svg>
);

export const IconInfo = (p: P) => (
  <svg {...base(p, 1.5)}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 4.8v3.8M8 11v.2" />
  </svg>
);

export const IconError = (p: P) => (
  <svg {...base(p, 1.5)}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...base(p, 1.6)}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3.5 3.5" />
  </svg>
);

export const IconExpandAll = (p: P) => (
  <svg {...base(p, 1.5)}>
    <path d="M4 3l4 4 4-4M4 9l4 4 4-4" />
  </svg>
);

export const IconCollapseAll = (p: P) => (
  <svg {...base(p, 1.5)}>
    <path d="M4 7l4-4 4 4M4 13l4-4 4 4" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base(p, 1.6)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const IconExpand = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
  </svg>
);

export const IconShrink = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 7H9V3M9 7l4.5-4.5M3 9h4v4M7 9l-4.5 4.5" />
  </svg>
);

export const IconHide = (p: P) => (
  <svg {...base(p, 1.5)}>
    <path d="M3 2.8h10M8 13.5V6M5 9l3-3 3 3" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base(p, 1.4)}>
    <path d="M2.5 4.2h11M6.2 4.2V2.8h3.6v1.4M4 4.2l.7 9.3h6.6l.7-9.3M6.6 6.8v4.4M9.4 6.8v4.4" />
  </svg>
);
