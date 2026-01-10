# Book Enrichment Edge Function

Cette fonction Supabase Edge Function enrichit automatiquement les métadonnées de livres (cover, pages, description) depuis Google Books et OpenLibrary.

## Configuration

### Variables d'environnement requises

Dans votre projet Supabase, allez dans **Settings > Edge Functions > Secrets** et ajoutez :

- `SUPABASE_SERVICE_ROLE_KEY`: La clé service role de votre projet (Settings > API > service_role key)
- `SUPABASE_URL`: L'URL de votre projet Supabase (généralement déjà configurée)
- `GOOGLE_BOOKS_API_KEY` (optionnel): Votre clé API Google Books pour meilleure qualité de métadonnées

### Déploiement

```bash
# Installer Supabase CLI si pas déjà fait
npm install -g supabase

# Se connecter à votre projet
supabase login

# Lier le projet
supabase link --project-ref YOUR_PROJECT_REF

# Déployer la fonction
supabase functions deploy book_enrich_v1
```

## Utilisation

```typescript
const { data, error } = await supabase.functions.invoke('book_enrich_v1', {
  body: {
    bookId: 'uuid-du-livre', // Optionnel: UUID du livre dans books
    isbn: '9782720201639', // Optionnel: ISBN du livre
    googleBooksId: 'book-id', // Optionnel: ID Google Books
    openlibraryWorkKey: '/works/OL123456W', // Optionnel: Clé OpenLibrary work
    openlibraryEditionKey: '/books/OL123456M', // Optionnel: Clé OpenLibrary edition
  }
});
```

## Comportement

1. **Détermination du livre** :
   - Si `bookId` fourni → fetch depuis `books` table
   - Sinon si `isbn` fourni → cherche par ISBN dans `books`
   - Retourne erreur si livre non trouvé

2. **Enrichissement cover** (avec validation URL) :
   - Priorité 1: Google Books cover (zoom=2 ou fife=w800 pour meilleure qualité)
   - Priorité 2: OpenLibrary cover_id (`covers.openlibrary.org/b/id/{id}-L.jpg`)
   - Priorité 3: OpenLibrary ISBN cover (`covers.openlibrary.org/b/isbn/{isbn}-L.jpg`)
   - Validation: HEAD request pour vérifier que l'URL existe (status 200)

3. **Enrichissement description** (>= 120 chars) :
   - Priorité 1: Google Books description
   - Priorité 2: OpenLibrary work description
   - Priorité 3: OpenLibrary edition description
   - Fallback: "Description indisponible pour le moment. Appuie sur IA pour générer un résumé."

4. **Enrichissement pages** :
   - Priorité 1: OpenLibrary edition `number_of_pages`
   - Priorité 2: Google Books `pageCount`

5. **Mise à jour DB** :
   - Met à jour `books` avec les champs trouvés
   - Retourne `{ ok: true, updatedFields, sourcesUsed, metadata }`

## Réponse

```typescript
{
  ok: true,
  updatedFields: ['cover_url', 'total_pages', 'description'],
  sourcesUsed: {
    cover: ['Google'],
    description: ['Google'],
    pages: ['OpenLibrary_edition']
  },
  metadata: {
    cover_url: 'https://...',
    total_pages: 300,
    description: '...',
    openlibrary_cover_id: 123456,
    openlibrary_work_key: '/works/OL123456W',
    openlibrary_edition_key: '/books/OL123456M',
    google_books_id: 'book-id'
  }
}
```

## Sécurité

- La fonction vérifie l'authentification via le header `Authorization`
- Utilise la clé service role uniquement pour les updates DB (pas exposée au client)
- Gère les erreurs gracieusement sans exposer d'infos sensibles
- Pas de dépendance CORS côté client (tous les appels externes sont dans l'Edge Function)

## Performance

- Cache côté client recommandé (30 min TTL) pour éviter les re-enrichissements
- Throttle recommandé: max 3 enrichissements simultanés
- Cooldown: 1 minute entre enrichissements du même livre

