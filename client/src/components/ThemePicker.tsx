import type { Theme } from '../hooks/use-theme';

interface ThemePickerProps {
  value: Theme;
  onChange: (theme: Theme) => void;
  variant?: 'default' | 'onboarding';
}

const options: { value: Theme; icon: string; label: string }[] = [
  { value: 'system', icon: 'fa-solid fa-display', label: 'System' },
  { value: 'dark', icon: 'fa-solid fa-moon', label: 'Dark' },
  { value: 'light', icon: 'fa-solid fa-sun', label: 'Light' },
];

export default function ThemePicker({ value, onChange, variant = 'default' }: ThemePickerProps) {
  const isOnboarding = variant === 'onboarding';

  return (
    <div className="flex gap-3">
      {options.map((opt) => {
        const active = value === opt.value;
        const cls = isOnboarding
          ? `flex-1 p-4 rounded-xl border transition-all text-center ${active ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:border-[var(--primary)]/50'}`
          : `flex-1 p-4 rounded-xl border transition-all text-center ${active ? 'border-[var(--primary)] bg-[var(--background)]' : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'}`;

        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cls}
          >
            <i className={`${opt.icon} text-xl mb-2${isOnboarding ? ' text-[var(--foreground)]' : ''}`} />
            <span className={`text-sm font-medium block${isOnboarding ? ' text-[var(--foreground)]' : ''}`}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
