# Book Recap V2 Edge Function

Cette fonction Supabase Edge Function génère des rappels de lecture PRÉCIS basés sur les notes de l'utilisateur, avec plusieurs formats : rappel ultra-rapide (20s), points clés, question de remise en contexte, et rappel complet.

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
supabase functions deploy book_recap_v2
```

## Utilisation

```typescript
const { data, error } = await supabase.functions.invoke('book_recap_v2', {
  body: {
    bookId: 'book-uuid', // UUID du livre dans la table books
    uptoPage: 50, // Page jusqu'à laquelle générer le rappel
    language: 'fr', // 'fr' | 'en' (optionnel, défaut: 'fr')
    force: false // Force la régénération même si en cache (optionnel, défaut: false)
  }
});
```

## Comportement

1. **Cache DB**: Vérifie d'abord `book_ai_summaries` pour un rappel existant (user_id, book_id, mode='v2', language, upto_page >= demandé)
2. **Récupération des notes**: Charge les notes de l'utilisateur jusqu'à `uptoPage` depuis `book_notes` (max 40 notes)
3. **Génération**: Si pas en cache (ou `force=true`):
   - **Si notes existent**: Le rappel est dérivé UNIQUEMENT des notes (vérité primaire). Aucun événement inventé.
   - **Si aucune note**: Fallback sur description du livre + rappel générique avec disclaimer "approximatif"
   - Génère 4 formats avec OpenAI (gpt-4o-mini, JSON mode):
     - `summary`: Rappel complet (8-12 lignes)
     - `ultra_20s`: Rappel ultra-rapide (2-3 phrases, 20 secondes)
     - `takeaways`: Points clés (5 bullets max, format "- ...")
     - `question`: Question pour se remettre dans le livre
   - **Important**: Ne révèle RIEN au-delà de `uptoPage` (zéro spoiler)
4. **Sauvegarde**: Sauvegarde automatiquement le rappel en cache pour éviter les régénérations coûteuses

## Format de réponse

```typescript
{
  summary: string;     // Rappel complet (8-12 lignes)
  ultra_20s: string;   // 2-3 phrases max
  takeaways: string;   // 5 bullets max (format "- ...")
  question: string;   // 1 question courte
  cached: boolean;    // true si depuis le cache
  uptoPage: number;   // Page jusqu'à laquelle le rappel est valide
}
```

## Sécurité

- La fonction vérifie l'authentification via le header `Authorization`
- Utilise la clé service role uniquement pour les updates DB (pas exposée au client)
- Les rappels sont stockés par utilisateur (RLS: users can only read/insert/update their own summaries)
- **OPENAI_API_KEY uniquement dans Supabase secrets, jamais exposée au front**
- Gère les erreurs gracieusement sans exposer d'infos sensibles

## Base de données

La fonction utilise :
- **`book_notes`**: Notes de l'utilisateur par page (créée par migration `20250131000001_add_book_notes_and_extend_summaries.sql`)
- **`book_ai_summaries`**: Cache des rappels (étendue avec colonnes `ultra_20s`, `takeaways`, `question`)

**Structure book_ai_summaries (v2)**:
- `user_id` (UUID) - Utilisateur propriétaire
- `book_id` (UUID) - Livre concerné
- `upto_page` (INTEGER) - Page jusqu'à laquelle le rappel est valide
- `mode` (TEXT) - 'v2' pour cette version
- `language` (TEXT) - Langue: 'fr', 'en'
- `summary` (TEXT) - Rappel complet
- `ultra_20s` (TEXT) - Rappel ultra-rapide
- `takeaways` (TEXT) - Points clés
- `question` (TEXT) - Question de remise en contexte

**Index**: `(user_id, book_id, mode, language, upto_page DESC)` pour des recherches rapides de cache.

