# Instructions pour configurer le fichier .env

## Problème actuel
Votre clé commence par `sb_publishable_` ce qui est une clé Bolt, pas Supabase.

## Solution

### 1. Obtenez votre vraie clé Supabase

1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet : `fnljdmvkkeplhnvdepsc`
3. Allez dans **Settings** → **API**
4. Dans la section **Project API keys**, copiez la clé **"anon public"**
   - Cette clé commence par `eyJ...` (c'est un JWT)
   - Elle fait environ 200-300 caractères

### 2. Mettez à jour le fichier .env

Ouvrez le fichier `.env` à la racine du projet et remplacez :

```env
VITE_SUPABASE_URL=https://fnljdmvkkeplhnvdepsc.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ... (votre vraie clé ici)
VITE_GOOGLE_BOOKS_API_KEY=AIzaSyDnCFEzkqSVK2CRopJxEYN6qoHoBsm6jIo
```

### 3. Redémarrez l'application

```bash
npm run dev
```

### 4. Vérifiez dans la console du navigateur

Ouvrez la console (F12) et vous devriez voir :
```
🔍 Configuration Supabase:
URL: https://fnljdmvkkeplhnvdepsc.supabase.co
```

## Important

- La clé Supabase commence toujours par `eyJ...`
- Ne partagez jamais votre clé publiquement
- Le fichier `.env` ne doit pas être commité dans git










