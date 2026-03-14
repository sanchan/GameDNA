import { useTranslation } from 'react-i18next';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { icon: 'w-6 h-6', text: 'text-lg' },
  md: { icon: 'w-8 h-8', text: 'text-2xl' },
  lg: { icon: 'w-12 h-12', text: 'text-5xl sm:text-6xl lg:text-7xl' },
};

export function Logo({ size = 'md' }: LogoProps) {
  const { t } = useTranslation();
  const s = sizes[size];

  return (
    <div className="flex items-center space-x-2">
      <div className={`${s.icon} relative`}>
        <div className="absolute inset-0 bg-[var(--primary)] opacity-10 blur-lg rounded-full" />
        <svg viewBox="0 0 100 100" className="w-full h-full relative z-10">
          <path d="M20 10 Q50 30 80 50 Q50 70 20 90" stroke="var(--primary)" strokeWidth="4" fill="none" />
          <path d="M80 10 Q50 30 20 50 Q50 70 80 90" stroke="var(--primary)" strokeWidth="4" fill="none" opacity="0.65" />
          <circle cx="35" cy="25" r="2" fill="var(--primary)" />
          <circle cx="65" cy="25" r="2" fill="var(--primary)" />
          <circle cx="50" cy="50" r="2" fill="var(--primary)" />
          <circle cx="35" cy="75" r="2" fill="var(--primary)" />
          <circle cx="65" cy="75" r="2" fill="var(--primary)" />
        </svg>
      </div>
      <div className="flex items-baseline">
        <span className={`${s.text} font-light text-white`}>{t('brand.game')}</span>
        <span className={`${s.text} font-bold text-[var(--primary)]`}>{t('brand.dna')}</span>
      </div>
    </div>
  );
}
