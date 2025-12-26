import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Plus, Lock, Globe, Check, Search } from 'lucide-react';
import { CreateClubModal } from '../components/CreateClubModal';

interface Club {
  id: string;
  name: string;
  description: string;
  category: string;
  is_private: boolean;
  member_count: number;
  creator: {
    display_name: string;
    username: string;
  };
  is_member: boolean;
}

export function Clubs() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'my-clubs'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    loadClubs();
  }, [filter, user]);

  const loadClubs = async () => {
    if (!user) return;

    setLoading(true);

    let query = supabase
      .from('clubs')
      .select(`
        id,
        name,
        description,
        category,
        is_private,
        member_count,
        user_profiles!clubs_creator_id_fkey(display_name, username)
      `)
      .order('created_at', { ascending: false });

    const { data: clubsData } = await query;

    if (clubsData) {
      const { data: memberships } = await supabase
        .from('club_members')
        .select('club_id')
        .eq('user_id', user.id);

      const memberClubIds = new Set(memberships?.map((m) => m.club_id) || []);

      let processedClubs = clubsData.map((club: any) => ({
        id: club.id,
        name: club.name,
        description: club.description,
        category: club.category,
        is_private: club.is_private,
        member_count: club.member_count,
        creator: club.user_profiles,
        is_member: memberClubIds.has(club.id),
      }));

      if (filter === 'my-clubs') {
        processedClubs = processedClubs.filter((club) => club.is_member);
      }

      setClubs(processedClubs);
    }

    setLoading(false);
  };

  const handleJoinClub = async (clubId: string) => {
    if (!user) return;

    const { error } = await supabase.from('club_members').insert({
      club_id: clubId,
      user_id: user.id,
      role: 'member',
    });

    if (!error) {
      loadClubs();
    }
  };

  const handleLeaveClub = async (clubId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('club_members')
      .delete()
      .eq('club_id', clubId)
      .eq('user_id', user.id);

    if (!error) {
      loadClubs();
    }
  };

  const filteredClubs = clubs.filter((club) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    return (
      club.name?.toLowerCase().includes(query) ||
      club.description?.toLowerCase().includes(query) ||
      club.category?.toLowerCase().includes(query) ||
      club.creator?.username?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 border-b border-stone-200">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Clubs de lecture</h1>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              Créer un club
            </button>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher par nom, catégorie ou créateur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent transition-all"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 px-4 py-2 rounded-xl font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
              }`}
            >
              Tous les clubs
            </button>
            <button
              onClick={() => setFilter('my-clubs')}
              className={`flex-1 px-4 py-2 rounded-xl font-medium transition-colors ${
                filter === 'my-clubs'
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
              }`}
            >
              Mes clubs
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          <div className="text-center py-12 text-stone-500">Chargement des clubs...</div>
        ) : filteredClubs.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 mx-auto text-stone-300 mb-4" />
            <p className="text-stone-600 font-medium mb-2">
              {searchQuery.trim()
                ? 'Aucun club trouvé'
                : filter === 'my-clubs'
                ? "Vous n'avez pas encore rejoint de clubs"
                : 'Aucun club disponible'}
            </p>
            <p className="text-sm text-stone-500 mb-4">
              {searchQuery.trim()
                ? 'Essayez un autre terme de recherche'
                : filter === 'my-clubs'
                ? 'Parcourez tous les clubs pour trouver des communautés qui vous intéressent'
                : 'Soyez le premier à créer un club !'}
            </p>
            {filter === 'my-clubs' && !searchQuery.trim() && (
              <button
                onClick={() => setFilter('all')}
                className="px-6 py-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium"
              >
                Parcourir tous les clubs
              </button>
            )}
          </div>
        ) : (
          filteredClubs.map((club) => (
            <div
              key={club.id}
              className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-stone-900">{club.name}</h3>
                    {club.is_private ? (
                      <Lock className="w-4 h-4 text-stone-500" />
                    ) : (
                      <Globe className="w-4 h-4 text-stone-500" />
                    )}
                  </div>
                  {club.category && (
                    <span className="inline-block px-2.5 py-0.5 bg-lime-100 text-lime-800 rounded-full text-xs font-medium mb-2">
                      {club.category}
                    </span>
                  )}
                  {club.description && (
                    <p className="text-stone-600 text-sm mb-3">{club.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-stone-500">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      <span>{club.member_count} membres</span>
                    </div>
                    <span>by @{club.creator.username}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {club.is_member ? (
                  <>
                    <button className="flex-1 px-4 py-2.5 bg-lime-50 text-lime-800 rounded-xl font-medium flex items-center justify-center gap-2 border border-lime-200">
                      <Check className="w-4 h-4" />
                      Membre
                    </button>
                    <button
                      onClick={() => handleLeaveClub(club.id)}
                      className="px-4 py-2.5 border border-stone-300 text-stone-700 rounded-xl hover:bg-stone-50 transition-colors font-medium"
                    >
                      Quitter
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleJoinClub(club.id)}
                    className="flex-1 px-4 py-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium"
                  >
                    Rejoindre le club
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {isCreateModalOpen && (
        <CreateClubModal
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={() => {
            loadClubs();
            setFilter('my-clubs');
          }}
        />
      )}
    </div>
  );
}
