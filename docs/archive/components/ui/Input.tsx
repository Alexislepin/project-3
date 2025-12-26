import { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({
  label,
  error,
  className = '',
  ...props
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={props.id} className="block text-sm font-medium mb-2">
          {label}
        </label>
      )}
      <input
        className={`w-full px-4 py-3 bg-lexu-gray border border-lexu-darkGray rounded-lg text-lexu-white placeholder:text-lexu-white/40 focus:outline-none focus:ring-2 focus:ring-lexu-yellow focus:border-transparent transition-all ${className} ${
          error ? 'border-red-500' : ''
        }`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}










