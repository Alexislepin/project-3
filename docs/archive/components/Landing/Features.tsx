import {
  Users,
  Quote,
  BarChart3,
  Target,
  Scan,
  BookOpen,
} from 'lucide-react';

const features = [
  {
    icon: Users,
    title: 'Le boost social',
    description:
      'Suis tes amis et découvre ce qu'ils lisent. La lecture devient une expérience partagée.',
  },
  {
    icon: Quote,
    title: 'Tes souvenirs',
    description:
      'Capture tes citations favorites et garde une trace de tes moments de lecture préférés.',
  },
  {
    icon: BarChart3,
    title: 'Tracking précis',
    description:
      'Suis ta progression en temps réel avec des statistiques détaillées sur tes habitudes.',
  },
  {
    icon: Target,
    title: 'Objectifs & rappels',
    description:
      'Définis tes objectifs de lecture et reçois des rappels intelligents pour rester motivé.',
  },
  {
    icon: Scan,
    title: 'Scanner instantané',
    description:
      'Ajoute tes livres en un scan. Plus besoin de chercher, Lexu reconnaît tout.',
  },
  {
    icon: BookOpen,
    title: 'Rejoins des clubs',
    description:
      'Partage ta passion avec d'autres lecteurs dans des clubs thématiques.',
  },
];

export default function Features() {
  return (
    <section className="py-20 px-4 bg-lexu-darkGray">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-6xl font-display font-bold text-center mb-16">
          Tout ce dont tu as besoin
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-lexu-gray rounded-xl p-6 border border-lexu-darkGray hover:border-lexu-yellow/30 transition-all duration-300"
              >
                <div className="w-12 h-12 bg-lexu-yellow/20 rounded-lg flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-lexu-yellow" />
                </div>
                <h3 className="text-xl font-display font-semibold mb-2 text-lexu-white">
                  {feature.title}
                </h3>
                <p className="text-lexu-white/70 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}










