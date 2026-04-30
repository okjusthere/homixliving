import React from "react";

// Plain icon components — no "use client" so they can be used in Server Components too.
type IconProps = { size?: number; stroke?: number; className?: string };

function makeIcon(path: React.ReactNode) {
  const I = ({ size = 16, stroke = 1.5, className = "" }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {path}
    </svg>
  );
  I.displayName = "Icon";
  return I;
}

export const IconDashboard = makeIcon(<><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>);
export const IconDoc = makeIcon(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>);
export const IconPlus = makeIcon(<path d="M12 5v14M5 12h14" />);
export const IconBuilding = makeIcon(<><rect x="4" y="3" width="16" height="18" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>);
export const IconGear = makeIcon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const IconSearch = makeIcon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconSend = makeIcon(<><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>);
export const IconDownload = makeIcon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>);
export const IconTrash = makeIcon(<><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>);
export const IconCheck = makeIcon(<path d="M20 6 9 17l-5-5" />);
export const IconArrow = makeIcon(<><path d="M5 12h14M13 5l7 7-7 7" /></>);
export const IconBack = makeIcon(<><path d="M19 12H5M12 19l-7-7 7-7" /></>);
export const IconClock = makeIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconMail = makeIcon(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="m2 7 10 7 10-7" /></>);
export const IconEye = makeIcon(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEdit = makeIcon(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>);
export const IconFilter = makeIcon(<><path d="M3 4h18M6 12h12M10 20h4" /></>);
export const IconChev = makeIcon(<path d="m9 6 6 6-6 6" />);
export const IconChevDown = makeIcon(<path d="m6 9 6 6 6-6" />);
export const IconCopy = makeIcon(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>);
export const IconClose = makeIcon(<><path d="M18 6 6 18M6 6l12 12" /></>);
