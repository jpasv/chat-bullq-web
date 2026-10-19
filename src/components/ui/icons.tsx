import type { SVGProps } from 'react';

export function ZappfyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 50 45" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M9.476 36.599s-2.672.057-4.005-.012C2.239 36.42.083 34.344.055 31.096c-.073-8.511-.073-17.025 0-25.536C.083 2.18 2.269.052 5.7.039 18.439-.012 31.18-.014 43.917.039c3.517.013 5.634 2.215 5.657 5.793.053 8.333.053 16.665-.006 24.998-.028 3.684-2.186 5.739-5.971 5.762-7.8.043-15.599.014-23.428.014-2.092 4.831-5.368 8.383-10.557 8.394-1.706.005-2.922-.417-2.922-.417s2.916-1.322 3.925-3.615c1.202-2.731.454-4.351.454-4.351l-1.594-.018Z"
        fill="url(#zappfy_grad)"
      />
      <path
        d="M27.828 11.226h-8.823a4.226 4.226 0 0 1-4.228-4.223h20.331v4.223L21.655 24.896h9.327a4.226 4.226 0 0 1 4.228 4.223H14.41v-4.223l13.419-13.67Z"
        fill="#171D18"
      />
      <defs>
        <linearGradient id="zappfy_grad" x1="-10.158" y1="43.912" x2="51.345" y2="-1.247" gradientUnits="userSpaceOnUse">
          <stop stopColor="#51C26F" />
          <stop offset="1" stopColor="#F2E901" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function MetaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        fill="url(#meta_grad)"
        d="M18 1L21.62 4.48L26.5 3.28L27.9 8.1L32.72 9.5L31.52 14.38L35 18L31.52 21.62L32.72 26.5L27.9 27.9L26.5 32.72L21.62 31.52L18 35L14.38 31.52L9.5 32.72L8.1 27.9L3.28 26.5L4.48 21.62L1 18L4.48 14.38L3.28 9.5L8.1 8.1L9.5 3.28L14.38 4.48Z"
      />
      <path
        d="M11.5 18.5L16 23L25 13.5"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <defs>
        <linearGradient id="meta_grad" x1="18" y1="1" x2="18" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1FB1FF" />
          <stop offset="1" stopColor="#0066E1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="18" cy="18" r="18" fill="url(#ig_grad)" />
      <rect x="9.5" y="9.5" width="17" height="17" rx="5" stroke="white" strokeWidth="2.6" fill="none" />
      <circle cx="18" cy="18" r="4.4" stroke="white" strokeWidth="2.6" fill="none" />
      <circle cx="23.2" cy="12.8" r="1.15" fill="white" />
      <defs>
        <radialGradient id="ig_grad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(7 38) rotate(-55) scale(48)">
          <stop stopColor="#FFD600" />
          <stop offset="0.25" stopColor="#FF7A00" />
          <stop offset="0.55" stopColor="#FF137C" />
          <stop offset="0.85" stopColor="#A02DAA" />
          <stop offset="1" stopColor="#5851DB" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function GmailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="4" y="8" width="28" height="20" rx="3" fill="white" stroke="#E5E7EB" strokeWidth="0.5" />
      <path d="M4 11a3 3 0 0 1 3-3h1.5v20H7a3 3 0 0 1-3-3V11Z" fill="#4285F4" />
      <path d="M32 11a3 3 0 0 0-3-3h-1.5v20H29a3 3 0 0 0 3-3V11Z" fill="#34A853" />
      <path d="M4 11a3 3 0 0 1 4.86-2.34L18 15.5l9.14-6.84A3 3 0 0 1 32 11l-14 10.5L4 11Z" fill="#EA4335" />
      <path d="M4 11v3l14 10.5L32 14v-3L18 21.5 4 11Z" fill="#C5221F" opacity="0.35" />
    </svg>
  );
}

/** Canal MEMBERS (suporte da área de membros) — capelo de formatura. */
export function MembersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="2" width="32" height="32" rx="8" fill="#4F46E5" />
      <path d="M18 10 7 15.5 18 21l11-5.5L18 10Z" fill="white" />
      <path
        d="M11.5 18v4.5c0 1.66 2.91 3.5 6.5 3.5s6.5-1.84 6.5-3.5V18L18 21.25 11.5 18Z"
        fill="white"
        opacity="0.85"
      />
      <path d="M28 16v6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
