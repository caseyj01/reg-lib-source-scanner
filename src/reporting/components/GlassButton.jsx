import React from 'react';

const sizeStyles = {
  sm:      { padding: '6px 16px',  fontSize: '11px' },
  default: { padding: '10px 22px', fontSize: '13px' },
  lg:      { padding: '14px 30px', fontSize: '15px' },
};

export function GlassButton({
  children,
  onClick,
  disabled = false,
  size = 'sm',
  className = '',
  type = 'button',
  title,
}) {
  return (
    <div className={`gb-wrap ${disabled ? 'gb-disabled' : ''} ${className}`}>
      <button
        type={type}
        title={title}
        disabled={disabled}
        onClick={onClick}
        className="gb-btn"
        style={sizeStyles[size] ?? sizeStyles.default}
      >
        <span className="gb-text">{children}</span>
      </button>
      <div className="gb-shadow" />
    </div>
  );
}
