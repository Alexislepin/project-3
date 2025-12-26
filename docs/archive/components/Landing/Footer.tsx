import { Instagram, Music } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="relative py-20 px-4 bg-lexu-darkGray overflow-hidden">
      {/* Background Text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <h2 className="text-[15rem] md:text-[25rem] font-display font-bold text-lexu-gray/10 select-none">
          LEXU.APP
        </h2>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto text-center">
        <div className="mb-12">
          <h3 className="text-4xl md:text-6xl font-display font-bold mb-6">
            LEXU.
          </h3>
          <p className="text-lexu-white/60 mb-8">
            Transforme ta lecture en habitude sociale
          </p>
        </div>

        {/* Social Links */}
        <div className="flex justify-center gap-6 mb-12">
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-12 h-12 bg-lexu-gray rounded-full flex items-center justify-center hover:bg-lexu-yellow hover:text-lexu-black transition-all duration-200"
            aria-label="Instagram"
          >
            <Instagram className="w-5 h-5" />
          </a>
          <a
            href="https://tiktok.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-12 h-12 bg-lexu-gray rounded-full flex items-center justify-center hover:bg-lexu-yellow hover:text-lexu-black transition-all duration-200"
            aria-label="TikTok"
          >
            <Music className="w-5 h-5" />
          </a>
        </div>

        <p className="text-lexu-white/40 text-sm">
          © 2025 Lexu. Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}










