# OpenLibrary Proxy Edge Function

Cette fonction Supabase Edge Function agit comme un proxy pour les requêtes OpenLibrary, évitant les problèmes CORS.

## Configuration

Aucune variable d'environnement requise.

### Déploiement

```bash
# Installer Supabase CLI si pas déjà fait
npm install -g supabase

# Se connecter à votre projet
supabase login

# Lier le projet
supabase link --project-ref YOUR_PROJECT_REF

# Déployer la fonction
supabase functions deploy openlibrary
```

## Utilisation

```typescript
const { data, error } = await supabase.functions.invoke('openlibrary', {
  body: {
    workId: 'OL123456W' // ou '/works/OL123456W'
  }
});

// Réponse:
// {
//   description: string | null,
//   subjects: string[] | null
// }
```

## Comportement

1. **Proxy CORS**: Évite les erreurs CORS en faisant le fetch côté serveur
2. **Normalisation**: Extrait `description` (string ou {value: string}) et `subjects`
3. **Gestion d'erreurs**: Retourne `null` pour description/subjects si erreur (pas de throw)
4. **Cache**: Le client doit gérer le cache (Map) pour éviter les re-fetch

## Sécurité

- Headers CORS configurés pour permettre les requêtes depuis le frontend
- Pas d'authentification requise (données publiques OpenLibrary)
- Gestion gracieuse des erreurs sans exposer d'infos sensibles

