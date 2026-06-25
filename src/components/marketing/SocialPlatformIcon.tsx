export function SocialPlatformIcon({ platform }: { platform: string }) {
  const iconClass = "size-7";

  if (platform === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={iconClass}>
        <defs>
          <linearGradient id="instagram-gradient" x1="4" x2="20" y1="20" y2="4" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FEDA75" />
            <stop offset="0.28" stopColor="#FA7E1E" />
            <stop offset="0.52" stopColor="#D62976" />
            <stop offset="0.74" stopColor="#962FBF" />
            <stop offset="1" stopColor="#4F5BD5" />
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="18" height="18" rx="5" fill="url(#instagram-gradient)" />
        <circle cx="12" cy="12" r="4" fill="none" stroke="#fff" strokeWidth="1.8" />
        <circle cx="16.7" cy="7.4" r="1.2" fill="#fff" />
      </svg>
    );
  }

  if (platform === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={iconClass}>
        <circle cx="12" cy="12" r="11" fill="#1877F2" />
        <path
          d="M13.7 21v-7.1h2.4l.4-2.8h-2.8V9.4c0-.8.2-1.4 1.4-1.4h1.5V5.5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2H8.2V14h2.5v7h3Z"
          fill="#fff"
        />
      </svg>
    );
  }

  if (platform === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={iconClass}>
        <rect width="24" height="24" rx="3" fill="#0A66C2" />
        <path d="M7.1 9.1H4V20h3.1V9.1ZM5.6 4a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 5.6 4Zm14.1 9.8c0-3.2-1.7-4.7-4-4.7a3.4 3.4 0 0 0-3.1 1.7h-.1V9.1h-3V20h3.1v-5.4c0-1.4.3-2.8 2-2.8s1.8 1.6 1.8 2.9V20h3.2v-6.2Z" fill="#fff" />
      </svg>
    );
  }

  if (platform === "tiktok" || platform === "douyin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={iconClass}>
        <rect width="24" height="24" rx="5" fill="#010101" />
        <path d="M14.1 4.2c.3 2.4 1.7 3.8 4.1 4v2.9a7 7 0 0 1-3.9-1.2v5.4c0 2.7-1.9 4.7-4.7 4.7a4.5 4.5 0 0 1-4.5-4.6c0-3 2.6-5.1 5.5-4.5v3c-1.3-.4-2.5.3-2.5 1.5 0 1 .7 1.7 1.7 1.7s1.7-.6 1.7-1.9v-11h2.6Z" fill="#25F4EE" opacity="0.9" />
        <path d="M15 4.2c.3 2.4 1.7 3.8 4.1 4v2.9a7 7 0 0 1-3.9-1.2v5.4c0 2.7-1.9 4.7-4.7 4.7a4.5 4.5 0 0 1-4.5-4.6c0-3 2.6-5.1 5.5-4.5v3c-1.3-.4-2.5.3-2.5 1.5 0 1 .7 1.7 1.7 1.7s1.7-.6 1.7-1.9v-11H15Z" fill="#FE2C55" opacity="0.9" />
        <path d="M14.5 4.2c.3 2.4 1.7 3.8 4.1 4v2.9a7 7 0 0 1-3.9-1.2v5.4c0 2.7-1.9 4.7-4.7 4.7a4.5 4.5 0 0 1-4.5-4.6c0-3 2.6-5.1 5.5-4.5v3c-1.3-.4-2.5.3-2.5 1.5 0 1 .7 1.7 1.7 1.7s1.7-.6 1.7-1.9v-11h2.6Z" fill="#fff" />
      </svg>
    );
  }

  if (platform === "red") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={iconClass}>
        <rect width="24" height="24" rx="5" fill="#FF2442" />
        <text x="12" y="14.5" textAnchor="middle" fill="#fff" fontSize="6.4" fontWeight="800" fontFamily="Arial, sans-serif">
          RED
        </text>
      </svg>
    );
  }

  if (platform === "wechat-channels") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={iconClass}>
        <rect width="24" height="24" rx="5" fill="#FF9F2A" />
        <path
          d="M6.1 12.2c0-2.2 1.8-4 4-4 1.3 0 2.3.5 3 1.4.7-.9 1.8-1.4 3-1.4 2.2 0 4 1.8 4 4s-1.8 4-4 4c-1.2 0-2.3-.5-3-1.4-.7.9-1.8 1.4-3 1.4-2.2 0-4-1.8-4-4Zm3.9-2.1a2.1 2.1 0 1 0 0 4.2c.8 0 1.5-.4 1.9-1.1l-1.5-1.4 1.5-1.4a2.1 2.1 0 0 0-1.9-.3Zm6.2 0c-.8 0-1.5.4-1.9 1.1l1.5 1.4-1.5 1.4a2.1 2.1 0 1 0 1.9-3.9Z"
          fill="#fff"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden className={iconClass}>
      <rect width="24" height="24" rx="5" fill="#fff" />
      <path d="M12 11v3.2h4.6a4.9 4.9 0 0 1-1.8 2.8l2.7 2.1c1.6-1.5 2.5-3.7 2.5-6.3 0-.6-.1-1.2-.2-1.8H12Z" fill="#4285F4" />
      <path d="M12 20.5c2.3 0 4.2-.8 5.6-2.1L14.8 17a5.3 5.3 0 0 1-7.9-2.8H4.1v2.2A8.5 8.5 0 0 0 12 20.5Z" fill="#34A853" />
      <path d="M6.9 14.2a5.1 5.1 0 0 1 0-3.4V8.6H4.1a8.5 8.5 0 0 0 0 7.8l2.8-2.2Z" fill="#FBBC05" />
      <path d="M12 6.6c1.2 0 2.4.4 3.3 1.3l2.5-2.5A8.5 8.5 0 0 0 4.1 8.6l2.8 2.2A5.1 5.1 0 0 1 12 6.6Z" fill="#EA4335" />
      <path d="M5.8 4.4h12.4v3.2H5.8V4.4Z" fill="#4285F4" opacity="0.12" />
    </svg>
  );
}
