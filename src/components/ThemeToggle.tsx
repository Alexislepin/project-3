import { useTheme } from '../contexts/ThemeContext';

const MODES: { value: 'light' | 'dark'; label: string }[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

export function ThemeToggle() {
  const { mode, setMode, resolved } = useTheme();

  return (
    <div className="bg-card-light rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-text-main-light">Apparence</p>
        <span className="text-xs text-muted">Thème {resolved === 'dark' ? 'sombre' : 'clair'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {MODES.map((m) => {
          const selected = mode === m.value;
          return (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`py-2 px-2 rounded-xl text-sm font-semibold transition-colors ${
                selected
                  ? 'bg-primary text-black shadow-sm'
                  : 'bg-surface-2 text-text-main-light border border-border'
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

