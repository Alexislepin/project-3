# Configuration de l'environnement

## Problème résolu

Vous avez remplacé un fichier database de Bolt par une configuration locale, ce qui a cassé la connexion.

## Solution : Créer le fichier .env

1. **Créez un fichier `.env` à la racine du projet** avec ce contenu :

```env
VITE_SUPABASE_URL=https://iwrhdzsglclvdztqwlys.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-anon-de-supabase
```

2. **Pour trouver votre clé anon :**
   - Allez sur https://app.supabase.com
   - Sélectionnez votre projet (iwrhdzsglclvdztqwlys)
   - Allez dans Settings > API
   - Copiez la "anon public" key dans la section "Project API keys"

3. **Redémarrez l'application :**
   ```bash
   npm run dev
   ```

4. **Vérifiez dans la console du navigateur :**
   - Ouvrez la console (F12)
   - Vous devriez voir : "🔍 Configuration Supabase:"
   - L'URL devrait être : `https://iwrhdzsglclvdztqwlys.supabase.co`

## Important

- Le fichier `.env` ne doit PAS être commité dans git (il est dans .gitignore)
- Ne partagez jamais votre clé anon publiquement
- Si vous changez de projet Supabase, mettez à jour l'URL et la clé










