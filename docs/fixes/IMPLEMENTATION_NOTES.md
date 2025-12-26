# Implémentation "Résumé Propre" - Notes

## ✅ Fichiers créés/modifiés

### 1. Migration SQL
- **Fichier**: `supabase/migrations/20250102000000_add_description_clean.sql`
- **Contenu**: Ajoute `description_clean` et `description_clean_updated_at` à la table `books`

### 2. Edge Function Supabase
- **Fichier**: `supabase/functions/clean-description/index.ts`
- **README**: `supabase/functions/clean-description/README.md`
- **Fonctionnalités**:
  - Appelle OpenAI API pour nettoyer/traduire les descriptions
  - Met à jour la DB si `bookId` fourni
  - Gère les erreurs gracieusement
  - Skip si texte < 30 caractères

### 3. Composant BookDetailsModal
- **Fichier**: `src/components/BookDetailsModal.tsx`
- **Modifications**:
  - Ajout du bouton "✨ Améliorer le résumé"
  - Cache client (Map) pour éviter appels répétés
  - États de loading et gestion d'erreurs
  - Affiche `description_clean` si disponible, sinon `description` raw

### 4. Requêtes Supabase mises à jour
- **Library.tsx**: Ajout de `description_clean` dans le select `book:books`
- **UserLibraryView.tsx**: Ajout de `description_clean` dans le select
- **BookDetailsWithManagement.tsx**: Ajout de `description_clean` dans le select

## 🔧 Configuration requise

### Variables d'environnement Supabase
Dans votre projet Supabase Dashboard → Settings → Edge Functions → Secrets :

1. `OPENAI_API_KEY`: Votre clé API OpenAI
2. `SUPABASE_SERVICE_ROLE_KEY`: La clé service_role (Settings → API)
3. `SUPABASE_URL`: Généralement déjà configurée automatiquement

### Déploiement Edge Function

```bash
# Installer Supabase CLI
npm install -g supabase

# Se connecter
supabase login

# Lier le projet
supabase link --project-ref YOUR_PROJECT_REF

# Déployer
supabase functions deploy clean-description
```

## 📝 Utilisation

### Dans le code
Le bouton "✨ Améliorer le résumé" apparaît automatiquement dans `BookDetailsModal` si :
- `book.description` existe et n'est pas "Aucune description disponible."
- `book.description_clean` n'existe pas encore

### Flux utilisateur
1. Utilisateur ouvre la modal d'un livre
2. Si description raw existe mais pas de `description_clean` → bouton visible
3. Clic sur "✨ Améliorer le résumé"
4. Loading pendant l'appel Edge Function
5. Résultat affiché (ou erreur avec message)
6. Cache client évite les appels répétés dans la même session

## 🔒 Sécurité

- Edge Function vérifie l'authentification via header `Authorization`
- Utilise service_role uniquement pour updates DB (pas exposée au client)
- Gestion d'erreurs sans exposer d'infos sensibles

## 💡 Notes importantes

- **bookId**: Pour les livres OpenLibrary, l'`id` peut être un identifiant composite (ex: `ol:/works/OL123W`). L'Edge Function gère ça gracieusement.
- **Cache**: Le cache client est en mémoire (Map), donc perdu au refresh. La DB cache persiste.
- **Coûts OpenAI**: Utilise `gpt-4o-mini` (modèle économique) avec `max_tokens: 200` pour limiter les coûts.

## 🐛 Dépannage

### Le bouton n'apparaît pas
- Vérifier que `book.description` existe et n'est pas vide
- Vérifier que `book.description_clean` est null/undefined

### Erreur "AI service not configured"
- Vérifier que `OPENAI_API_KEY` est bien configurée dans Supabase Secrets

### Description non sauvegardée en DB
- Vérifier que `SUPABASE_SERVICE_ROLE_KEY` est configurée
- Vérifier que `bookId` est fourni dans l'appel Edge Function
- Vérifier les logs Edge Function dans Supabase Dashboard

