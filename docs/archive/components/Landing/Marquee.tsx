export default function Marquee() {
  const items = [
    'Motivation Sociale',
    'Souvenirs de lecture',
    'Rappels Intelligents',
    'Statistiques',
  ];

  // Dupliquer les items pour l'animation infinie
  const duplicatedItems = [...items, ...items, ...items, ...items];

  return (
    <div className="bg-lexu-yellow text-lexu-black py-4 overflow-hidden relative">
      <div className="flex animate-marquee whitespace-nowrap">
        {duplicatedItems.map((item, index) => (
          <span
            key={index}
            className="text-2xl md:text-3xl font-display font-bold mx-8 inline-block"
          >
            {item} •
          </span>
        ))}
      </div>
    </div>
  );
}

