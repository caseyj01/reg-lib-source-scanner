import React from 'react';

function ArrowUpRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

export function ButtonColorful({
  children,
  label,
  onClick,
  disabled = false,
  className = '',
  type = 'button',
  title,
}) {
  const text = label ?? children;
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`bcf-btn ${disabled ? 'bcf-disabled' : ''} ${className}`}
    >
      <div className="bcf-glow" />
      <div className="bcf-content">
        <span>{text}</span>
        <ArrowUpRight />
      </div>
    </button>
  );
}
