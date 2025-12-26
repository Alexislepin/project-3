# Clean Description Edge Function

Cette fonction Supabase Edge Function nettoie et traduit les descriptions de livres en utilisant OpenAI.

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
supabase functions deploy clean-description
```

## Utilisation

```typescript
const { data, error } = await supabase.functions.invoke('clean-description', {
  body: {
    bookId: 'book-uuid', // Optionnel: pour sauvegarder en DB
    raw: 'Raw description text...',
    targetLang: 'fr' // Optionnel, défaut: 'fr'
  }
});
```

## Sécurité

- La fonction vérifie l'authentification via le header `Authorization`
- Utilise la clé service role uniquement pour les updates DB (pas exposée au client)
- Limite les tokens OpenAI pour réduire les coûts
- Gère les erreurs gracieusement sans exposer d'infos sensibles

