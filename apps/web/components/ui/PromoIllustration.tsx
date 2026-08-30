'use client';

// Original illustrated mascot for the homepage promo banner — a friendly
// "wallet" character in the site's brand blue, holding a shopping bag,
// with floating coins and a trust badge. Fully original design (no
// copyrighted characters or third-party branding).
export function PromoIllustration() {
  return (
    <svg viewBox="0 0 420 280" className="promo-illustration-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="walletBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5EB8FF" />
          <stop offset="100%" stopColor="#0096FF" />
        </linearGradient>
        <linearGradient id="bagGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#EAF6FF" />
        </linearGradient>
        <linearGradient id="coinGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE07A" />
          <stop offset="100%" stopColor="#F5B300" />
        </linearGradient>
      </defs>

      {/* Floating coins */}
      <g>
        <circle cx="60" cy="60" r="22" fill="url(#coinGrad)" />
        <text x="60" y="67" textAnchor="middle" fontSize="20" fontWeight="800" fill="#8a5a00">đ</text>
      </g>
      <g>
        <circle cx="365" cy="70" r="18" fill="url(#coinGrad)" />
        <text x="365" y="76" textAnchor="middle" fontSize="16" fontWeight="800" fill="#8a5a00">%</text>
      </g>
      <g>
        <circle cx="380" cy="200" r="14" fill="url(#coinGrad)" />
        <text x="380" y="205" textAnchor="middle" fontSize="13" fontWeight="800" fill="#8a5a00">đ</text>
      </g>

      {/* Sparkles */}
      <path d="M100 40 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z" fill="#fff" opacity="0.85" />
      <path d="M320 35 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" fill="#fff" opacity="0.85" />

      {/* Shopping bag */}
      <g transform="translate(255,120)">
        <rect x="0" y="20" width="70" height="70" rx="8" fill="url(#bagGrad)" stroke="#cfe8ff" strokeWidth="2" />
        <path d="M15 20 v-14 a20 20 0 0 1 40 0 v14" fill="none" stroke="#0096FF" strokeWidth="6" strokeLinecap="round" />
        <circle cx="20" cy="55" r="5" fill="#0096FF" />
        <circle cx="50" cy="55" r="5" fill="#0096FF" />
      </g>

      {/* Wallet mascot body */}
      <g transform="translate(120,90)">
        <rect x="0" y="0" width="130" height="110" rx="28" fill="url(#walletBody)" />
        {/* zipper / seam line */}
        <path d="M10 30 h110" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 8" />
        {/* eyes */}
        <circle cx="45" cy="60" r="7" fill="#0B2545" />
        <circle cx="90" cy="60" r="7" fill="#0B2545" />
        <circle cx="47" cy="57" r="2" fill="#fff" />
        <circle cx="92" cy="57" r="2" fill="#fff" />
        {/* smile */}
        <path d="M50 78 q17 16 34 0" fill="none" stroke="#0B2545" strokeWidth="4" strokeLinecap="round" />
        {/* blush */}
        <circle cx="30" cy="72" r="6" fill="#ff9db3" opacity="0.6" />
        <circle cx="105" cy="72" r="6" fill="#ff9db3" opacity="0.6" />
        {/* little arms waving */}
        <path d="M0 60 q-18 -6 -22 10" fill="none" stroke="#0096FF" strokeWidth="10" strokeLinecap="round" />
        <path d="M130 60 q18 -18 8 -34" fill="none" stroke="#0096FF" strokeWidth="10" strokeLinecap="round" />
      </g>

      {/* Trust badge */}
      <g transform="translate(45,190)">
        <circle cx="20" cy="20" r="20" fill="#22c55e" />
        <path d="M11 20 l6 6 12 -13" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
