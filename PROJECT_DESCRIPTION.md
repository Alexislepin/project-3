# 📚 LUXUS - Application de Suivi d'Activités et Réseau Social

## Vue d'ensemble

LUXUS est une application web progressive (PWA) moderne et minimaliste conçue pour suivre vos activités quotidiennes : lecture, sport, apprentissage et habitudes. C'est un mélange entre Goodreads, Strava et un journal personnel, avec une dimension sociale pour partager votre progression avec vos amis.

## 🎯 Concept Principal

L'application permet aux utilisateurs de :
- **Suivre leurs activités** : Lecture de livres, séances de sport, sessions d'apprentissage, habitudes quotidiennes
- **Construire une bibliothèque personnelle** : Gérer les livres en cours, terminés, ou à lire
- **Partager leur progression** : Les activités sont visibles par les personnes qui vous suivent
- **Analyser leurs performances** : Statistiques hebdomadaires, suivi d'objectifs, séries de jours consécutifs
- **Interagir socialement** : Suivre d'autres utilisateurs, réagir aux activités, commenter

## 🏗️ Architecture Technique

### Stack Technologique
- **Frontend** : React 18 + TypeScript
- **Styling** : Tailwind CSS (design system personnalisé)
- **Base de données** : Supabase (PostgreSQL)
- **Authentification** : Supabase Auth (email/mot de passe)
- **Build Tool** : Vite
- **Icônes** : Lucide React

### Structure du Projet
```
src/
├── components/
│   ├── auth/              # Composants d'authentification
│   │   ├── Login.tsx      # Formulaire de connexion
│   │   ├── Signup.tsx     # Formulaire d'inscription
│   │   └── Onboarding.tsx # Onboarding initial (intérêts, objectifs)
│   ├── layout/            # Composants de mise en page
│   │   ├── AppLayout.tsx  # Layout principal avec navigation
│   │   └── BottomNav.tsx  # Barre de navigation inférieure
│   └── [Modals & Cards]   # Composants réutilisables
├── contexts/
│   └── AuthContext.tsx    # Contexte d'authentification global
├── lib/
│   ├── supabase.ts        # Configuration Supabase client
│   └── googleBooks.ts     # Intégration Google Books API
├── pages/
│   ├── Home.tsx           # Feed d'activités (Stitch Feed)
│   ├── Library.tsx        # Bibliothèque personnelle
│   ├── Insights.tsx       # Statistiques et analyses
│   ├── Profile.tsx        # Profil utilisateur
│   ├── Search.tsx         # Recherche de livres et utilisateurs
│   ├── Clubs.tsx          # Clubs de lecture (à développer)
│   ├── LogActivity.tsx    # Modal de création d'activité
│   ├── ActiveSession.tsx  # Session de lecture en cours
│   └── SessionSummary.tsx # Résumé après une session
└── utils/
    ├── dateUtils.ts       # Fonctions utilitaires pour dates
    └── goalNotifications.ts # Système de notifications d'objectifs
```

## 📱 Fonctionnalités Principales

### 1. Stitch Feed (Page d'accueil)
Le feed principal affiche un flux d'activités avec trois filtres :
- **Tous** : Toutes les activités publiques
- **Abonnements** : Activités des personnes que vous suivez
- **Moi** : Vos propres activités

Chaque carte d'activité affiche :
- Avatar et nom de l'utilisateur
- Type d'activité avec icône (livre, haltère, cerveau, coche)
- Détails (pages lues, durée, etc.)
- Notes personnelles
- Réactions (likes) et commentaires
- Date relative ("il y a 2 heures")

Statistiques affichées en haut :
- Série actuelle (flame icon)
- Activités cette semaine
- Progression vers les objectifs

### 2. Bibliothèque (Library)
Gestion complète de votre bibliothèque de livres :
- **Onglets** : En cours de lecture / Terminés / À lire
- **Recherche** : Scanner code-barres ou recherche via Google Books API
- **Progression** : Barre de progression visuelle, page actuelle / pages totales
- **Gestion** :
  - Mettre à jour le statut (lecture, terminé, à lire)
  - Marquer comme abandonné
  - Ajouter/modifier la page actuelle
  - Supprimer de la bibliothèque

Chaque livre affiche :
- Couverture du livre
- Titre et auteur
- Pourcentage de progression
- Barre de progression colorée
- Boutons d'action rapide

### 3. Insights (Analyses)
Page d'analyse de vos performances :
- **Statistiques hebdomadaires** :
  - Pages lues cette semaine
  - Minutes d'exercice
  - Minutes d'apprentissage
  - Habitudes complétées
- **Objectifs** : Progression vers vos objectifs personnels avec barres de progression
- **Séries** : Série actuelle et série record
- **Messages motivationnels** : Encouragements personnalisés basés sur votre progression

### 4. Profil
Profil utilisateur complet :
- **Photo de profil** et nom d'affichage
- **Bio** personnalisable
- **Statistiques** :
  - Série actuelle et série la plus longue
  - Abonnés et abonnements
  - Livres lus, pages totales
  - Minutes d'activité
- **Intérêts** : Tags visuels (Lecture, Fitness, Apprentissage)
- **Paramètres** :
  - Modifier le profil
  - Notifications
  - Se déconnecter

### 5. Recherche (Search)
Double fonctionnalité de recherche :
- **Recherche de livres** :
  - Scanner code-barres ISBN
  - Recherche texte via Google Books API
  - Aperçu des résultats avec couverture
  - Ajout direct à la bibliothèque
- **Recherche d'utilisateurs** :
  - Recherche par nom d'utilisateur ou nom d'affichage
  - Liste des résultats avec avatars
  - Bouton suivre/ne plus suivre
  - Accès aux profils

### 6. Log Activity (Modal)
Modal central pour créer une activité (bouton + jaune flottant) :
- **Types d'activités** :
  - 📖 **Lecture** : Sélection du livre, pages lues, durée, notes
  - 💪 **Sport** : Type d'exercice, durée, notes
  - 🧠 **Apprentissage** : Sujet, durée, notes
  - ✅ **Habitude** : Nom de l'habitude, notes
- **Visibilité** : Public / Privé
- **Session active** : Possibilité de démarrer un chronomètre pour suivre en temps réel

### 7. Clubs (À développer)
Section pour les clubs de lecture :
- État actuel : Page vide avec message "Coming soon"
- Potentiel : Groupes de lecture, défis communs, discussions

## 🗄️ Schéma de Base de Données

### Tables Principales

#### `user_profiles`
Profils utilisateurs étendus :
- `id` (uuid, FK vers auth.users)
- `username` (unique)
- `display_name`
- `bio`
- `avatar_url`
- `current_streak` / `longest_streak`
- `total_pages_read`
- `total_books_completed`
- `interests` (array de texte)

#### `books`
Catalogue de livres :
- `id` (uuid)
- `title`
- `author`
- `isbn`
- `cover_url`
- `description`
- `total_pages`
- `edition`
- `google_books_id`

#### `user_books`
Bibliothèque personnelle :
- `id` (uuid)
- `user_id` (FK vers user_profiles)
- `book_id` (FK vers books)
- `status` (reading, completed, want_to_read, abandoned)
- `current_page`
- `started_at` / `completed_at`
- `rating` (1-5 étoiles)

#### `activities`
Toutes les activités des utilisateurs :
- `id` (uuid)
- `user_id` (FK)
- `type` (reading, workout, learning, habit)
- `title`
- `description` (notes personnelles)
- `book_id` (nullable, pour les activités de lecture)
- `pages_read`
- `duration_minutes`
- `visibility` (public, private)
- `created_at`

#### `follows`
Relations sociales :
- `follower_id` (celui qui suit)
- `following_id` (celui qui est suivi)
- Contrainte unique (follower_id, following_id)

#### `activity_reactions`
Likes sur les activités :
- `id` (uuid)
- `activity_id` (FK)
- `user_id` (FK)
- Contrainte unique (activity_id, user_id)

#### `activity_comments`
Commentaires :
- `id` (uuid)
- `activity_id` (FK)
- `user_id` (FK)
- `content` (texte du commentaire)
- `created_at`

#### `user_goals`
Objectifs personnalisés :
- `id` (uuid)
- `user_id` (FK)
- `type` (daily_pages, weekly_workouts, daily_learning_time)
- `target_value` (valeur cible)
- `period` (daily, weekly)

#### `notification_preferences`
Préférences de notifications :
- `user_id` (FK)
- `goal_reminders` (boolean)
- `social_interactions` (boolean)
- `weekly_summary` (boolean)

### Sécurité RLS (Row Level Security)

Toutes les tables ont RLS activé avec des politiques strictes :
- Les utilisateurs ne peuvent voir que leurs propres données
- Les activités sont visibles uniquement par l'auteur et ses followers
- Les profils publics sont visibles par tous
- Les follows, reactions et comments sont gérés avec des politiques appropriées

## 🎨 Design System

### Palette de Couleurs
- **Couleurs de base** : Tons pierre (stone-50 à stone-900)
- **Accent** : Lime (lime-400, lime-500, lime-600)
- **Backgrounds** :
  - Fond principal : stone-50
  - Cartes : white
  - Accents : lime-400
- **Texte** :
  - Principal : stone-900
  - Secondaire : stone-600
  - Muted : stone-400

### Philosophie de Design
- **Minimaliste** : Interface épurée, pas de distraction
- **Mobile-First** : Optimisé pour smartphones
- **Calme et Premium** : Design sophistiqué avec couleurs neutres
- **Typographie claire** : Hiérarchie visuelle forte
- **Signal > Bruit** : Focus sur le contenu, pas les métriques virales

### Composants Visuels
- **Cartes** : Arrondies (rounded-lg), ombre légère
- **Boutons** :
  - Primaire : Lime, arrondi complet (rounded-full)
  - Secondaire : Fond stone-100, texte stone-700
- **Icônes** : Lucide React, taille 20px par défaut
- **Espacements** : Système cohérent (p-4, gap-4, etc.)

## 🔐 Authentification et Sécurité

### Système d'Authentification
- **Provider** : Supabase Auth
- **Méthode** : Email et mot de passe
- **Confirmation email** : Désactivée par défaut
- **Context global** : AuthContext pour gérer l'état utilisateur
- **Protection des routes** : Routes protégées avec redirection

### Flux Utilisateur
1. **Inscription** : Email, mot de passe, username, display name
2. **Onboarding** : Sélection des intérêts et définition des objectifs
3. **Création automatique du profil** : Trigger Supabase crée le profil
4. **Accès à l'app** : Redirection vers le feed

### Sécurité
- RLS activé sur toutes les tables
- Politiques strictes pour chaque opération (SELECT, INSERT, UPDATE, DELETE)
- Validation côté serveur via Supabase
- Pas de données sensibles dans le code client
- Variables d'environnement pour les clés API

## 📊 Algorithmes et Logique Métier

### Calcul des Séries (Streaks)
```typescript
// Logique de série :
// - Jour actif = au moins une activité ce jour
// - Série actuelle = nombre de jours consécutifs jusqu'à aujourd'hui
// - Série se réinitialise si un jour est manqué
// - Affichage avec icône flame 🔥
```

### Progression des Objectifs
```typescript
// Pour chaque objectif :
// 1. Récupérer toutes les activités de la période (jour/semaine)
// 2. Sommer les valeurs (pages, minutes, nombre)
// 3. Calculer pourcentage : (valeur actuelle / cible) * 100
// 4. Afficher barre de progression colorée
```

### Algorithme du Feed
```typescript
// Feed "Tous" : Toutes les activités publiques, triées par date DESC
// Feed "Abonnements" : Activités des users suivis, triées par date DESC
// Feed "Moi" : Mes propres activités, triées par date DESC
// Limite : 50 activités par requête
// Rechargement : Pull-to-refresh (futur)
```

### Mise à Jour de la Progression de Lecture
```typescript
// Lors d'une activité de lecture :
// 1. Récupérer le livre dans user_books
// 2. Incrémenter current_page de pages_read
// 3. Si current_page >= total_pages : marquer comme "completed"
// 4. Mettre à jour completed_at
// 5. Incrémenter total_books_completed dans user_profile
```

## 🚀 Guide de Déploiement

### Prérequis
1. Compte Supabase avec un projet créé
2. Node.js 18+ installé localement
3. Compte de déploiement (Vercel, Netlify, etc.)

### Installation Locale
```bash
# 1. Cloner le projet
unzip project.zip
cd project

# 2. Installer les dépendances
npm install

# 3. Configurer .env
VITE_SUPABASE_URL=votre-url-supabase
VITE_SUPABASE_ANON_KEY=votre-cle-anon

# 4. Lancer en dev
npm run dev

# 5. Build pour production
npm run build
```

### Configuration Supabase
1. **Créer les tables** : Appliquer toutes les migrations du dossier `supabase/migrations/`
2. **Désactiver confirmation email** : Supabase Dashboard > Authentication > Settings > Disable email confirmation
3. **Configurer RLS** : Les politiques sont incluses dans les migrations
4. **Ajouter des livres** : Les migrations incluent des livres d'exemple

### Déploiement
- **Netlify** : Connecter le repo, build command : `npm run build`, publish dir : `dist`
- **Vercel** : Import project, framework preset : Vite, auto-détection
- Ajouter les variables d'environnement dans les paramètres du hosting

## 🔮 Évolutions Futures

### Fonctionnalités à Ajouter
1. **Clubs de lecture** : Création, gestion, discussions
2. **Commentaires** : Système de commentaires complet (actuellement interface seulement)
3. **Notifications push** : Alertes pour objectifs, interactions sociales
4. **Analytics avancés** : Graphiques, tendances, rapports mensuels
5. **Badges et achievements** : Système de récompenses pour milestones
6. **Export de données** : Export CSV/JSON de toutes les activités
7. **Mode sombre** : Toggle dark mode avec persistence
8. **PWA complète** : Installation mobile, offline mode
9. **Partage social** : Partager des activités sur réseaux sociaux externes
10. **Recommandations** : Suggestions de livres basées sur l'historique

### Améliorations Techniques
- Pagination infinie sur le feed
- Cache des requêtes avec React Query
- Optimisation des images (lazy loading, compression)
- Tests unitaires et E2E
- CI/CD automatisé
- Monitoring et analytics (Sentry, Posthog)

## 📝 Prompt de Génération

**Voici le prompt qui pourrait générer cette application :**

```
Crée une application web moderne de suivi d'activités personnelles avec réseau social,
inspirée de Goodreads et Strava. L'application doit permettre aux utilisateurs de :

1. Suivre plusieurs types d'activités : lecture (avec gestion de bibliothèque), sport,
   apprentissage, et habitudes quotidiennes
2. Construire et gérer une bibliothèque personnelle de livres avec suivi de progression
3. Partager leurs activités avec un feed social où ils peuvent suivre d'autres utilisateurs
4. Analyser leurs performances avec des statistiques, objectifs, et séries de jours consécutifs
5. Interagir socialement : suivre des utilisateurs, réagir aux activités, commenter
6. Rechercher des livres via Google Books API ou scanner de code-barres
7. Gérer leur profil avec photo, bio, intérêts

Contraintes techniques :
- Stack : React + TypeScript + Tailwind CSS + Supabase + Vite
- Design : Minimaliste, mobile-first, couleurs neutres (stone) avec accent lime
- Base de données : PostgreSQL via Supabase avec RLS activé
- Auth : Email/password via Supabase Auth
- Architecture : Composants réutilisables, séparation des préoccupations

Fonctionnalités clés :
- Navigation bottom bar avec 5 pages : Home (feed), Search, Log Activity (modal),
  Library, Profile
- Feed avec filtres : Tous / Abonnements / Moi
- Bibliothèque avec onglets : En cours / Terminés / À lire
- Page Insights avec stats hebdomadaires et objectifs
- Système de streaks (séries de jours consécutifs)
- Modal de création d'activité avec types multiples
- Recherche utilisateurs et livres
- Scanner code-barres pour ajouter des livres

L'application doit être production-ready avec une attention particulière au design,
à l'UX mobile, et à la sécurité des données.
```

## 🤝 Contribution

Ce projet est un MVP/démo. Pour contribuer :
1. Fork le projet
2. Créer une branche feature
3. Commit les changements
4. Push et créer une Pull Request

## 📄 License

Projet de démonstration - Usage libre pour apprentissage

---

**Développé avec React + TypeScript + Supabase + Tailwind CSS**
