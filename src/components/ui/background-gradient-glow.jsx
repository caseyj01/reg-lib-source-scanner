import { cn } from '@/lib/utils';

export function BackgroundGradientGlow({ className, children }) {
  return (
    <div className={cn('relative w-full', className)}>
      {/* Soft morning mist gradient */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(135deg,
              rgba(248,250,252,1) 0%,
              rgba(219,234,254,0.7) 30%,
              rgba(165,180,252,0.5) 60%,
              rgba(129,140,248,0.6) 100%
            ),
            radial-gradient(circle at 20% 30%, rgba(255,255,255,0.6) 0%, transparent 40%),
            radial-gradient(circle at 80% 70%, rgba(199,210,254,0.4) 0%, transparent 50%),
            radial-gradient(circle at 40% 80%, rgba(224,231,255,0.3) 0%, transparent 60%)
          `,
        }}
      />
      {/* Content sits above the gradient */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
}
