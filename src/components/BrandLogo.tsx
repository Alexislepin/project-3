import { BRAND } from '../lib/brand';

type BrandLogoProps = {
  size?: number;
  color?: string;
  className?: string;
};

/**
 * BrandLogo component - THE ONLY WAY to display the brand name
 * 
 * Rules:
 * - Always displays "LEXU." (uppercase with period)
 * - Uses consistent typography (LexuBrand font, weight 800, letterSpacing -0.05em)
 * - Never write "Lexu" or "LEXU" directly in code - always use this component
 */
export function BrandLogo({
  size = 28,
  color = '#000',
  className = '',
}: BrandLogoProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: BRAND.fontFamily === 'LexuBrand' ? 'Inter, system-ui, sans-serif' : BRAND.fontFamily,
        fontSize: size,
        fontWeight: BRAND.weight,
        letterSpacing: BRAND.letterSpacing,
        textTransform: 'uppercase', // Safety: ensure uppercase even if name changes
        color,
      }}
    >
      {BRAND.name}
    </span>
  );
}

