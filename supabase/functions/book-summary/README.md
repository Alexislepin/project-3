# Book Summary Edge Function

Cette fonction Supabase Edge Function génère des résumés de livres (2-4 phrases) avec cache en base de données.

## Configuration

### Variables d'environnement requises

Dans votre projet Supabase, allez dans **Settings > Edge Functions > Secrets** et ajoutez :

- `OPENAI_API_KEY` (optionnel): Votre clé API OpenAI pour générer des résumés avec IA. Si absente, utilise un template simple.
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
supabase functions deploy book-summary
```

## Utilisation

```typescript
const { data, error } = await supabase.functions.invoke('book-summary', {
  body: {
    source: 'google', // ou 'openlibrary', etc.
    source_id: 'book-id-from-source',
    title: 'Book Title',
    authors: 'Author Name',
    description: 'Original description...',
    categories: 'Fiction',
    pageCount: 300,
    publishedDate: '2020-01-01',
    lang: 'fr' // ou 'en'
  }
});
```

## Comportement

1. **Cache DB**: Vérifie d'abord `book_summaries` pour un résumé existant (source, source_id, lang)
2. **Génération**: Si pas en cache:
   - Si `OPENAI_API_KEY` existe → utilise OpenAI (gpt-4o-mini)
   - Sinon → utilise un template simple basé sur les métadonnées
3. **Sauvegarde**: Sauvegarde automatiquement le résumé en cache pour éviter les régénérations

## Sécurité

- La fonction vérifie l'authentification via le header `Authorization`
- Utilise la clé service role uniquement pour les updates DB (pas exposée au client)
- Gère les erreurs gracieusement sans exposer d'infos sensibles

