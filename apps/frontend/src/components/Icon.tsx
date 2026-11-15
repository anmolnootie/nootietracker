import React from 'react';

/**
 * Line icons drawn inline (24px grid, 1.75 stroke, currentColor) - replaces the
 * emoji the UI used to use, with no icon-library dependency. Add a path here to
 * add an icon.
 */
const P: Record<string, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
  truck: <><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5" /><path d="M12 16V8" /><path d="M16 16v-3" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /></>,
  package: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="m4 7.5 8 4.5 8-4.5" /><path d="M12 12v9" /></>,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17" /><path d="M8 3v4M16 3v4" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7 7.5 20h9l1-13" /></>,
  check: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4L12 4z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>,
  upload: <><path d="M12 15V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M4 15v4h16v-4" /></>,
  download: <><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 15v4h16v-4" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  sheet: <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M4 9h16M4 14.5h16M10 9v11.5" /></>,
  inbox: <><path d="M4 13h4l1.5 2.5h5L16 13h4" /><path d="M4 13 6.5 5h11L20 13v6H4z" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 4.5V3h6v1.5" /><path d="M9 11h6M9 15h4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  folder: <><path d="M3.5 7.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5H12L10 5H5a1.5 1.5 0 0 0-1.5 1.5z" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  pin: <><path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  boxes: <><rect x="3.5" y="12" width="8" height="8" rx="1" /><rect x="12.5" y="12" width="8" height="8" rx="1" /><rect x="8" y="4" width="8" height="8" rx="1" /></>,
  pause: <><circle cx="12" cy="12" r="8.5" /><path d="M10 9v6M14 9v6" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  report: <><path d="M5 3h14v18H5z" /><path d="M9 17v-4M12 17V9M15 17v-6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" /></>,
  tag: <><path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z" /><circle cx="8" cy="8.5" r="1.3" /></>,
  users: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.6a3 3 0 0 1 0 5.8" /><path d="M17 14a5.5 5.5 0 0 1 3.5 5" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  logout: <><path d="M14 4h5v16h-5" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>,
  forms: <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  rocket: <><path d="M12 3c3.5 2 5 5.5 5 9l-2.5 4h-5L7 12c0-3.5 1.5-7 5-9z" /><circle cx="12" cy="10" r="1.6" /><path d="M9.5 16 8 20.5l4-2 4 2-1.5-4.5" /></>,
  delivered: <><circle cx="12" cy="12" r="8.5" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
};

export type IconName = keyof typeof P;

export const Icon: React.FC<{ name: string; size?: number; className?: string; strokeWidth?: number }> = ({ name, size = 18, className = '', strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
    {P[name] || P.file}
  </svg>
);
