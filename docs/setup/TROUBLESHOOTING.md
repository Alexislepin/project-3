# Dépannage - Landing Page Lexu

## Problème : "next: command not found"

**Solution :** Les dépendances Next.js ne sont pas installées.

### Étape 1 : Installer les dépendances

```bash
npm install
```

Si vous avez une erreur de permissions npm, essayez :

```bash
sudo chown -R $(whoami) ~/.npm
npm install
```

### Étape 2 : Vérifier l'installation

```bash
npx next --version
```

Vous devriez voir une version (ex: 14.2.0)

### Étape 3 : Lancer le serveur

```bash
npm run dev
```

## Problème : Erreurs de compilation TypeScript

Vérifiez que tous les fichiers sont bien créés :

- ✅ `app/layout.tsx`
- ✅ `app/page.tsx`
- ✅ `app/globals.css`
- ✅ `components/Landing/*.tsx`
- ✅ `components/ui/*.tsx`
- ✅ `app/api/waitlist/route.ts`

## Problème : Erreurs d'imports (@/)

Vérifiez que `tsconfig.json` contient :

```json
"paths": {
  "@/*": ["./*"]
}
```

## Problème : Tailwind ne fonctionne pas

Vérifiez que `tailwind.config.js` contient bien les chemins :

```js
content: [
  './pages/**/*.{js,ts,jsx,tsx,mdx}',
  './components/**/*.{js,ts,jsx,tsx,mdx}',
  './app/**/*.{js,ts,jsx,tsx,mdx}',
],
```

## Problème : Port déjà utilisé

Si le port 3000 est déjà utilisé :

```bash
PORT=3001 npm run dev
```

## Vérification rapide

1. ✅ `package.json` contient `"next": "^14.2.0"`
2. ✅ `node_modules` existe (après `npm install`)
3. ✅ `next.config.js` existe
4. ✅ `tsconfig.json` existe avec les paths configurés
5. ✅ `tailwind.config.js` existe avec les couleurs Lexu
6. ✅ `postcss.config.js` utilise `module.exports`

## Commandes utiles

```bash
# Nettoyer et réinstaller
rm -rf node_modules package-lock.json
npm install

# Vérifier les types
npm run typecheck

# Build de test
npm run build
```










