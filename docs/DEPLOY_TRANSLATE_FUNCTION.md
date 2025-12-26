# Déploiement de la Edge Function `translate`

## Commandes de déploiement

### Option 1 : Via Supabase CLI (recommandé)

```bash
# 1. S'assurer d'être dans le répertoire du projet
cd "/Users/alexislepin/Downloads/project 3"

# 2. Vérifier que Supabase CLI est installé
supabase --version

# 3. Se connecter à Supabase (si pas déjà fait)
supabase login

# 4. Lier le projet (si pas déjà fait)
# supabase link --project-ref YOUR_PROJECT_REF

# 5. Déployer la function
supabase functions deploy translate

# 6. Vérifier le déploiement
supabase functions list
```

### Option 2 : Via Dashboard Supabase

1. Aller sur https://supabase.com/dashboard
2. Sélectionner votre projet
3. Aller dans **Edge Functions** > **translate**
4. Cliquer sur **Deploy** ou **Update**
5. Copier le contenu de `supabase/functions/translate/index.ts` dans l'éditeur
6. Cliquer sur **Deploy**

### Vérification des variables d'environnement

Assurez-vous que les secrets suivants sont configurés dans Supabase :

```bash
# Vérifier les secrets
supabase secrets list

# Si DEEPL_API_KEY manquant, l'ajouter :
supabase secrets set DEEPL_API_KEY=your_deepl_api_key_here
```

**Secrets requis :**
- `DEEPL_API_KEY` - Clé API DeepL (obligatoire pour traduire)
- `SUPABASE_SERVICE_ROLE_KEY` - Généré automatiquement
- `SUPABASE_URL` - Généré automatiquement

## Checklist de validation (2 minutes)

### 1. Vérifier le déploiement
- [ ] La function `translate` apparaît dans `supabase functions list`
- [ ] Aucune erreur lors du déploiement

### 2. Tester dans l'app (Network tab)

**Ouvrir DevTools > Network :**

1. **Ouvrir un livre** dans l'app (FR)
2. **Filtrer par "translate"** dans Network
3. **Cliquer sur la requête** vers `/functions/v1/translate`
4. **Vérifier la Response JSON** :

```json
{
  "translatedText": "...",
  "meta": {
    "didTranslate": true,  // ✅ Doit être true si traduit
    "provider": "deepl",   // ✅ Doit être "deepl" si traduit
    "targetUsed": "FR"     // ✅ Doit être "FR" pour français
  }
}
```

**Indicateurs de succès :**
- ✅ `translatedText` ≠ texte original (longueur différente ou contenu différent)
- ✅ `meta.didTranslate === true`
- ✅ `meta.provider === "deepl"`
- ✅ `meta.targetUsed === "FR"` (si app en FR)

**Indicateurs d'échec :**
- ❌ `translatedText === texte original` ET `didTranslate === false`
- ❌ `meta.provider === "fallback"`
- ❌ `meta.reason` indique une erreur (ex: "deepl_api_key_missing", "deepl_api_error")

### 3. Vérifier les logs (Supabase Dashboard)

1. Aller dans **Edge Functions** > **translate** > **Logs**
2. Chercher les logs récents :
   - `[translate] Request received:` - doit montrer `target: 'fr'`, `deeplTarget: 'FR'`
   - `[translate] Calling DeepL API` - doit apparaître
   - `[translate] DeepL response:` - doit montrer `didTranslate: true`

### 4. Test rapide manuel

**En FR :**
- Ouvrir un livre avec résumé en anglais
- Le résumé doit être traduit en français
- Vérifier dans Network que `meta.didTranslate === true`

**En EN :**
- Changer la langue vers EN
- Ouvrir le même livre
- Le résumé doit être en anglais (ou traduit depuis FR)
- Vérifier dans Network que `meta.didTranslate === true` ou `false` (si déjà en EN)

## Dépannage

### Si `didTranslate === false` et `provider === "fallback"`

**Vérifier `meta.reason` :**

1. **`"deepl_api_key_missing"`** :
   ```bash
   supabase secrets set DEEPL_API_KEY=your_key
   ```

2. **`"deepl_api_error"`** :
   - Vérifier que la clé DeepL est valide
   - Vérifier les quotas DeepL
   - Regarder les logs Supabase pour l'erreur exacte

3. **`"text_already_in_target_language"`** :
   - Normal si le texte est déjà dans la bonne langue
   - Vérifier que l'heuristique n'est pas trop stricte

### Si la traduction ne fonctionne toujours pas

1. Vérifier les logs Supabase Edge Functions
2. Vérifier que `DEEPL_API_KEY` est bien configuré
3. Tester directement l'API DeepL avec curl :
   ```bash
   curl -X POST "https://api-free.deepl.com/v2/translate" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "auth_key=YOUR_KEY&text=Hello&target_lang=FR"
   ```

## Notes

- La function renvoie toujours **200** (même en cas d'erreur)
- Le cache est mis à jour uniquement si `didTranslate === true`
- Les logs ne contiennent pas de clés API (sécurité)

