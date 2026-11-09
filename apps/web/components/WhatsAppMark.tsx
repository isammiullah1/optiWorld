export function WhatsAppMark({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
  'aria-hidden'?: boolean | 'true';
}): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path
        fill="#ffffff"
        d="M12.04 5.2a6.72 6.72 0 0 0-5.78 10.1l-.62 2.26 2.32-.61a6.72 6.72 0 1 0 4.08-11.75Zm3.86 9.48c-.16.46-.94.86-1.32.92-.34.06-.76.08-1.22-.08-.28-.08-.64-.2-1.1-.4-1.94-.84-3.2-2.8-3.3-2.92-.1-.14-.82-1.1-.82-2.08 0-.98.52-1.46.7-1.66.18-.2.4-.24.54-.24h.38c.12 0 .28-.04.44.34.16.48.56 1.66.6 1.78.06.12.1.26.02.42-.08.16-.12.26-.24.4l-.26.3c-.08.1-.18.22-.08.42.1.2.46.76 1 .1.22 1.34.54 1.82.96 2.04.12.06.26.1.38-.02l.48-.56c.14-.16.28-.14.46-.08.18.06 1.16.54 1.36.64.2.1.34.16.38.24.06.16.06.56-.1.98Z"
      />
    </svg>
  );
}

export function WhatsAppLabel({
  children,
  size = 14,
}: {
  children: React.ReactNode;
  size?: number;
}): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1">
      <WhatsAppMark size={size} />
      {children}
    </span>
  );
}
