# Désactiver l'email de confirmation dans Supabase

## Étapes à suivre :

1. **Allez sur https://app.supabase.com**
2. **Sélectionnez votre projet** : `fnljdmvkkeplhnvdepsc`
3. **Allez dans Authentication → Settings**
4. **Trouvez la section "Email Auth"**
5. **Désactivez "Enable email confirmations"**
   - Décochez la case "Enable email confirmations"
6. **Sauvegardez les changements**

## Alternative : Désactiver via SQL

Si vous préférez, vous pouvez aussi exécuter ce script SQL dans SQL Editor :

```sql
-- Désactiver la confirmation email pour tous les nouveaux utilisateurs
UPDATE auth.config 
SET enable_signup = true,
    enable_email_confirmations = false;
```

**Note :** Cette méthode peut ne pas fonctionner selon votre version de Supabase. La méthode via l'interface est plus fiable.

## Après avoir désactivé :

- Les nouveaux utilisateurs pourront se connecter immédiatement après l'inscription
- Pas besoin de cliquer sur un lien dans un email
- Le compte sera actif dès la création










