/* Inline icon set. Kept local rather than pulled from an icon package so the
   site ships no icon-font or sprite request, and so stroke weight stays
   consistent with the 1px technical borders used everywhere else. */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
};

const P = (d) => (props) => (
  <svg {...base} {...props}>
    {d}
  </svg>
);

export const Sun = P(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
);
export const Moon = P(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />);
export const Menu = P(<path d="M3 6h18M3 12h18M3 18h18" />);
export const Close = P(<path d="M18 6 6 18M6 6l12 12" />);
export const ArrowRight = P(<path d="M5 12h14M13 6l6 6-6 6" />);
export const ArrowUp = P(<path d="M12 19V5M6 11l6-6 6 6" />);

export const Rotate = P(
  <>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
  </>
);
export const Reset = P(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </>
);
export const Plus = P(<path d="M12 5v14M5 12h14" />);
export const Minus = P(<path d="M5 12h14" />);
export const Explode = P(
  <>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
  </>
);
export const Assemble = P(
  <>
    <path d="M12 8V4M12 20v-4M8 12H4M20 12h-4" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </>
);
export const Tag = P(
  <>
    <path d="M3 8.5V4a1 1 0 0 1 1-1h4.5L21 15.5 15.5 21z" />
    <circle cx="7" cy="7" r="1.2" />
  </>
);
export const Bulb = P(
  <>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.2.9 2h5.2c0-.8.3-1.5.9-2A6 6 0 0 0 12 3z" />
  </>
);
export const Expand = P(<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />);
export const Shrink = P(<path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" />);
export const Camera = P(
  <>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
    <circle cx="12" cy="13" r="3.2" />
  </>
);
export const Flame = P(
  <path d="M12 3s5 4.2 5 8.6a5 5 0 0 1-10 0C7 9.4 9 8 9 8s.4 2 1.6 2.6C11.6 11.1 12 8.7 12 3z" />
);

/* --- domain icons --------------------------------------------------------- */
export const HardHat = P(
  <>
    <path d="M3 17h18" />
    <path d="M5 15v-1a7 7 0 0 1 14 0v1" />
    <path d="M10 4.3A7 7 0 0 1 14 4.3" />
    <path d="M9.5 8V4.6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V8" />
  </>
);
export const Layers = P(
  <>
    <path d="m12 3 9 5-9 5-9-5 9-5z" />
    <path d="m3 13 9 5 9-5" />
  </>
);
export const Spark = P(
  <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M18.4 5.6l-2.5 2.5M8.1 15.9l-2.5 2.5" />
);
export const Compass = P(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5.5-5.5 2 2-5.5z" />
  </>
);
export const Chart = P(
  <>
    <path d="M3 21h18" />
    <path d="M6 21V11M11 21V5M16 21v-7M21 21v-4" />
  </>
);

/* --- brands (simple glyphs, no wordmarks) --------------------------------- */
export const LinkedIn = P(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7.5 10.5V17M7.5 7.5v.01M11.5 17v-3.6a2 2 0 0 1 4 0V17" />
  </>
);
export const GitHub = P(
  <path d="M9 19c-4 1.4-4-2.1-5.6-2.6M15 21v-3.3a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.3s-1-.3-3.4 1.3a11.7 11.7 0 0 0-6 0C6.5 2.6 5.4 2.9 5.4 2.9a4.3 4.3 0 0 0-.1 3.3A4.7 4.7 0 0 0 4 9.4c0 4.7 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21" />
);
export const XLogo = P(<path d="M4 4l16 16M20 4L4 20" />);
export const WhatsApp = P(
  <>
    <path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.3L3 20.5l1.8-5.3A8.5 8.5 0 1 1 21 11.5z" />
    <path d="M8.8 8.4c.3-.1.7 0 .9.4l.6 1.1c.1.3.1.5-.1.7l-.4.5c-.1.2-.2.4 0 .7a5.3 5.3 0 0 0 2.4 2.1c.3.1.5.1.7-.1l.5-.5c.2-.2.4-.2.7-.1l1.2.6c.3.2.4.5.3.8a2 2 0 0 1-2 1.4 7.2 7.2 0 0 1-5.3-5.4 2 2 0 0 1 .5-1.7z" />
  </>
);
export const Mail = P(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 6.5 8.5 6 8.5-6" />
  </>
);
export const Pin = P(
  <>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </>
);
export const Doc = P(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </>
);

/** Name → component, so data files can reference an icon by string. */
export const ICONS = {
  hardhat: HardHat,
  layers: Layers,
  spark: Spark,
  compass: Compass,
  chart: Chart,
  linkedin: LinkedIn,
  github: GitHub,
  x: XLogo,
  whatsapp: WhatsApp,
  mail: Mail,
  email: Mail,
  pin: Pin,
  doc: Doc,
};

export function Icon({ name, ...props }) {
  const C = ICONS[name];
  return C ? <C {...props} /> : null;
}
