const testimonials = [
  {
    name: 'Marc Dubois',
    role: 'Lecteur passionné',
    content:
      'Lexu a complètement transformé ma façon de lire. Le côté social me motive énormément et j'ai enfin réussi à tenir mes objectifs de lecture annuels.',
  },
  {
    name: 'Sophie Laurent',
    role: 'Étudiante en littérature',
    content:
      'Adorer pouvoir suivre mes amis et découvrir leurs lectures. Le système de citations est génial pour garder une trace de mes passages préférés.',
  },
];

export default function Testimonials() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl md:text-6xl font-display font-bold text-center mb-16">
          Ce qu'en disent nos utilisateurs
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-lexu-gray rounded-xl p-8 border border-lexu-darkGray"
            >
              <p className="text-lexu-white/80 mb-6 leading-relaxed text-lg">
                "{testimonial.content}"
              </p>
              <div>
                <p className="font-display font-semibold text-lexu-white text-lg">
                  {testimonial.name}
                </p>
                <p className="text-lexu-white/60 text-sm">{testimonial.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}










