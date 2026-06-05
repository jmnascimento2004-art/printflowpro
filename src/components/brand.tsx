import Image from 'next/image';

type BrandLogoProps = {
  subtitle?: string;
  compact?: boolean;
  className?: string;
  textClassName?: string;
};

export function BrandMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <Image
      src="/printflowpro-mark.svg"
      alt="PrintFlowPRO"
      width={64}
      height={64}
      className={`${className} shrink-0 rounded-xl object-contain shadow-sm shadow-primary/20`}
      priority
    />
  );
}

export function BrandLogo({ subtitle, compact = false, className = '', textClassName = '' }: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <BrandMark className={compact ? 'h-8 w-8' : 'h-10 w-10'} />
      {!compact && (
        <div className="min-w-0">
          <p className={`truncate text-lg font-extrabold leading-none tracking-tight text-primary ${textClassName}`}>
            PrintFlowPRO
          </p>
          {subtitle && (
            <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
