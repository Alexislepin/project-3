# Cleanup Report - Root Folder Analysis

## Date: 2025-01-XX

## Investigated Folders

### 1. `app/` folder

**Location:** `/app/`

**Contents:**
- `api/waitlist/route.ts` (Next.js API route)
- `globals.css`
- `layout.tsx` (Next.js layout)
- `page.tsx` (Next.js page using `@/components/Landing/`)

**Analysis:**
- **A) Referenced by package.json scripts?** ❌ No
- **A) Referenced by vite.config.ts?** ❌ No
- **A) Referenced by capacitor.config.ts?** ❌ No
- **A) Referenced by imports in src/?** ❌ No (all imports use `../components/` which resolves to `src/components/`)
- **B) Duplicated with src/?** ❌ No, this is a Next.js app structure (different framework)
- **C) Proposed action:** **ARCHIVE** - This appears to be a separate Next.js landing page project. Not used by the main Vite/React app. Move to `docs/archive/app/` for potential future use.

**Risk Level:** 🟢 Low - Not referenced anywhere in the active codebase.

---

### 2. `components/` folder (root)

**Location:** `/components/`

**Contents:**
- `Landing/` (Hero, Features, Footer, Marquee, PhoneMockup, Testimonials)
- `ui/` (Button, Input)

**Analysis:**
- **A) Referenced by package.json scripts?** ❌ No
- **A) Referenced by vite.config.ts?** ❌ No
- **A) Referenced by capacitor.config.ts?** ❌ No
- **A) Referenced by imports in src/?** ❌ No (all imports use `../components/` which resolves to `src/components/`)
- **A) Referenced by app/?** ✅ Yes - `app/page.tsx` imports from `@/components/Landing/`
- **B) Duplicated with src/?** ❌ No, different components (Landing page components vs app components)
- **C) Proposed action:** **ARCHIVE** - These components are only used by the Next.js `app/` folder. Since `app/` is being archived, archive `components/` alongside it. Move to `docs/archive/components/`.

**Risk Level:** 🟢 Low - Only used by `app/` which is not part of the active Vite app.

---

### 3. `ios_BACKUP_now/` folder

**Location:** `/ios_BACKUP_now/`

**Contents:**
- iOS project backup (App/, App.xcodeproj/, CapApp-SPM/, capacitor-cordova-ios-plugins/, debug.xcconfig)

**Analysis:**
- **A) Referenced by package.json scripts?** ❌ No
- **A) Referenced by vite.config.ts?** ❌ No
- **A) Referenced by capacitor.config.ts?** ❌ No
- **A) Referenced by imports?** ❌ No
- **B) Duplicated with ios/?** ✅ Yes - This is clearly a backup of the `ios/` folder
- **C) Proposed action:** **IGNORE/DELETE** - Add to `.gitignore` and optionally delete. This is a backup folder and should not be in version control.

**Risk Level:** 🟢 Low - Clearly a backup, not referenced anywhere.

---

### 4. `.bolt/` folder

**Location:** `/.bolt/`

**Analysis:**
- **Status:** Not found in root directory listing (may not exist or be gitignored)
- **C) Proposed action:** **NO ACTION** - If it exists and is gitignored, leave it as is.

**Risk Level:** 🟢 N/A - Not present or already handled.

---

## Summary

| Folder | Status | Action | Risk |
|--------|--------|--------|------|
| `app/` | Next.js landing page (unused) | Archive to `docs/archive/app/` | 🟢 Low |
| `components/` | Landing page components (unused) | Archive to `docs/archive/components/` | 🟢 Low |
| `ios_BACKUP_now/` | iOS backup | Add to `.gitignore`, optionally delete | 🟢 Low |
| `.bolt/` | Not found | No action | 🟢 N/A |

## Recommendations

1. **Archive `app/` and `components/`** together since they form a complete Next.js landing page project that is not part of the active Vite app.
2. **Remove `ios_BACKUP_now/`** from version control (add to `.gitignore`).
3. **Keep `src/` and `ios/`** as they are the active project folders.

## Notes

- All active code uses `src/components/` (verified via grep)
- The Next.js `app/` folder uses `@/components/` which would need Next.js-specific TypeScript config (not present in current tsconfig.json)
- No build scripts reference `app/` or root `components/`
- The main app entry point is `src/main.tsx` (Vite/React), not `app/page.tsx` (Next.js)

