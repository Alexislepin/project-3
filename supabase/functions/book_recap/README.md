# Book Recap Edge Function

Cette fonction Supabase Edge Function génère des rappels de lecture (recaps) avec IA pour aider les utilisateurs à se remémorer où ils en sont dans leur lecture, jusqu'à une page spécifique.

## Configuration

### Variables d'environnement requises

Dans votre projet Supabase, allez dans **Settings > Edge Functions > Secrets** et ajoutez :

- `OPENAI_API_KEY`: Votre clé API OpenAI (obtenue sur https://platform.openai.com/api-keys)
- `SUPABASE_SERVICE_ROLE_KEY`: La clé service role de votre projet (Settings > API > service_role key)
- `SUPABASE_URL`: L'URL de votre projet Supabase (généralement déjà configurée)

### Déploiement

```bash
# Installer Supabase CLI si pas déjà fait
npm install -g supabase

# Se connecter à votre projet
supabase login

# Lier le projet
supabase link --project-ref YOUR_PROJECT_REF

# Déployer la fonction
supabase functions deploy book_recap
```

## Utilisation

```typescript
const { data, error } = await supabase.functions.invoke('book_recap', {
  body: {
    bookId: 'book-uuid', // UUID du livre dans la table books
    uptoPage: 50, // Page jusqu'à laquelle générer le rappel
    mode: 'global', // 'global' | 'chapters' | 'bullets' (optionnel, défaut: 'global')
    language: 'fr', // 'fr' | 'en' (optionnel, défaut: 'fr')
    force: false // Force la régénération même si en cache (optionnel, défaut: false)
  }
});
```

## Comportement

1. **Cache DB**: Vérifie d'abord `book_ai_summaries` pour un rappel existant (user_id, book_id, mode, language, upto_page >= demandé)
2. **Génération**: Si pas en cache (ou `force=true`):
   - Récupère les métadonnées du livre depuis `books`
   - Génère un rappel avec OpenAI (gpt-4o-mini) selon le mode demandé
   - **Important**: Le rappel ne révèle RIEN au-delà de `uptoPage` (pas de spoilers)
3. **Sauvegarde**: Sauvegarde automatiquement le rappel en cache pour éviter les régénérations coûteuses

## Modes de rappel

- **`global`**: Rappel en 8-12 lignes, format narratif continu
- **`chapters`**: Rappel organisé par sections/actes (ou "Repères" si structure inconnue)
- **`bullets`**: 10 points clés sous forme de liste à puces

## Sécurité

- La fonction vérifie l'authentification via le header `Authorization`
- Utilise la clé service role uniquement pour les updates DB (pas exposée au client)
- Les rappels sont stockés par utilisateur (RLS: users can only read/insert/update their own summaries)
- Gère les erreurs gracieusement sans exposer d'infos sensibles

## Base de données

La fonction utilise la table `book_ai_summaries` créée par la migration `20250131000000_add_book_ai_summaries.sql`.

**Structure**:
- `user_id` (UUID) - Utilisateur propriétaire
- `book_id` (UUID) - Livre concerné
- `upto_page` (INTEGER) - Page jusqu'à laquelle le rappel est valide
- `mode` (TEXT) - Format: 'global', 'chapters', 'bullets'
- `language` (TEXT) - Langue: 'fr', 'en'
- `summary` (TEXT) - Texte du rappel

**Index**: `(user_id, book_id, mode, language, upto_page DESC)` pour des recherches rapides de cache.

