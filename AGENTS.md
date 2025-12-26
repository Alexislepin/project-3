# AI Agent Rulebook - Lexu / LUXUS Project

**⚠️ CRITICAL: This document defines how ANY AI agent must work on this project.**

**Last Updated:** 2025-01-XX

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Repository Structure](#repository-structure)
4. [Supabase Rules (CRITICAL)](#supabase-rules-critical)
5. [How Supabase is Used in Code](#how-supabase-is-used-in-code)
6. [Common Failure Cases to Avoid](#common-failure-cases-to-avoid)
7. [Safe Workflow for Changes](#safe-workflow-for-changes)
8. [DO NOT Section](#do-not-section)

---

## Project Overview

### What is Lexu/LUXUS?

Lexu (formerly LUXUS) is a modern, mobile-first Progressive Web App (PWA) for tracking reading progress, activities, and social engagement around books.

### Core Features

1. **Reading Tracking**
   - Personal library with reading status (reading, completed, want_to_read, abandoned)
   - Page progress tracking
   - Reading sessions with timer
   - Book ratings

2. **Activity Feed (Stitch Feed)**
   - Social feed showing activities from users you follow
   - Activities include: reading sessions, workouts, learning, habits
   - Reactions (likes) and comments on activities
   - Filter by: All, Following, Me

3. **Social Features**
   - Follow/unfollow users
   - View other users' libraries
   - Like and comment on books
   - Notifications for follows, reactions, comments

4. **Insights & Analytics**
   - Weekly statistics (pages read, activities, hours)
   - Streak tracking (consecutive days with activities)
   - Goal tracking (daily/weekly targets)
   - Calendar view of activity days

5. **Profile Management**
   - User profiles with stats, streaks, interests
   - Follower/following counts
   - Avatar and bio

6. **Book Discovery**
   - Explore tab with book grid
   - Search functionality
   - Barcode scanner (ISBN)
   - OpenLibrary integration

---

## Tech Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **React Router DOM** - Routing

### Backend & Database
- **Supabase** - Backend-as-a-Service
  - **Auth** - User authentication (email/password)
  - **PostgreSQL** - Database
  - **Row Level Security (RLS)** - Data access control
  - **Edge Functions** - Serverless functions (for book summaries, etc.)

### Mobile
- **Capacitor** - Native mobile wrapper
  - **iOS** - Native iOS app
  - **Camera** - Barcode scanning
  - **Haptics** - Tactile feedback
  - **Local Notifications** - Push notifications

### External APIs
- **OpenLibrary API** - Book metadata and covers
- **Google Books API** - Book metadata (optional)

---

## Repository Structure

### Active Code (DO NOT MODIFY UNLESS EXPLICITLY ASKED)

```
src/
├── components/          # React components
│   ├── auth/           # Login, Signup, Onboarding
│   ├── layout/         # AppLayout, BottomNav
│   └── *.tsx           # Feature components
├── contexts/            # React contexts (AuthContext)
├── lib/                 # Utilities and helpers
│   ├── supabase.ts     # Supabase client initialization
│   └── *.ts            # Other utilities
├── pages/               # Page components (Home, Library, Profile, etc.)
├── services/            # External service integrations
├── utils/               # Utility functions
├── App.tsx              # Main app component
└── main.tsx             # Entry point
```

### iOS Native Code (READ-ONLY)

```
ios/
├── App/                 # Capacitor iOS project
└── capacitor-cordova-ios-plugins/
```

**⚠️ NEVER manually edit files in `ios/` unless explicitly asked.**
**Use `npx cap sync ios` to sync web changes to iOS.**

### Documentation (READ-ONLY)

```
docs/
├── db/                  # Database documentation
│   ├── SUPABASE_SCHEMA.md  # ⚠️ AUTHORITATIVE schema reference
│   └── *.sql            # SQL scripts (reference only)
├── features/           # Feature documentation
├── fixes/              # Bug fix documentation
├── setup/              # Setup instructions
└── archive/             # Deprecated code (read-only)
```

### Configuration Files

```
├── package.json        # Dependencies and scripts
├── vite.config.ts      # Vite configuration
├── capacitor.config.ts # Capacitor configuration
├── tsconfig.json       # TypeScript configuration
└── tailwind.config.js   # Tailwind configuration
```

---

## Supabase Rules (CRITICAL)

### ⚠️ MANDATORY WORKFLOW BEFORE ANY SUPABASE QUERY

**Before writing ANY Supabase query, you MUST:**

1. **Read `docs/db/SUPABASE_SCHEMA.md`**
   - This is the AUTHORITATIVE source of truth
   - It lists ALL tables, ALL columns, ALL types, ALL constraints
   - It lists ALL RLS policies

2. **Verify table name EXACTLY**
   - Table names are lowercase with underscores: `user_profiles`, `user_books`, `book_likes`
   - NOT `userProfiles`, NOT `UserBooks`, NOT `bookLikes`

3. **Verify column names EXACTLY**
   - Column names are lowercase with underscores: `user_id`, `book_id`, `created_at`
   - NOT `userId`, NOT `bookId`, NOT `createdAt`
   - Check nullable status (can it be `NULL`?)
   - Check default values

4. **Verify RLS implications**
   - Who can SELECT? (read)
   - Who can INSERT? (create)
   - Who can UPDATE? (modify)
   - Who can DELETE? (remove)
   - Check the policy conditions (e.g., `auth.uid() = user_id`)

5. **Verify foreign key relationships**
   - What table does `user_id` reference? (`user_profiles`)
   - What table does `book_id` reference? (`books`)
   - What happens on DELETE? (CASCADE, SET NULL, etc.)

### ⚠️ IF A COLUMN DOES NOT EXIST

**STOP. DO NOT PROCEED.**

1. Check `docs/db/SUPABASE_SCHEMA.md` again
2. Check the "⚠️ Potential Mismatches" section
3. If it's listed as non-existent, **DO NOT USE IT**
4. Find the correct column name or propose a schema change (with migration)

### ⚠️ NEVER ASSUME NAMING

- **DO NOT** assume camelCase (it's snake_case)
- **DO NOT** assume plural table names (check the schema)
- **DO NOT** assume column names match TypeScript interfaces
- **DO NOT** invent columns that "should exist"

### ⚠️ COMMON MISTAKES TO AVOID

1. **`books.book_key`** - Does NOT exist. Use `books.id` or `books.isbn`.
2. **`books_cache.google_books_id`** - Does NOT exist in `books_cache`.
3. **`books_cache.cover_i`** - Does NOT exist in `books_cache`.
4. **`user_books.custom_*`** - Custom columns do NOT exist.
5. **`books.description_clean`** - Does NOT exist. Use `books.description`.

---

## How Supabase is Used in Code

### Client Initialization

**Location:** `src/lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

**Environment Variables:**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (public, safe for client)

### Common Query Patterns

#### 1. Simple SELECT

```typescript
const { data, error } = await supabase
  .from('user_profiles')
  .select('id, username, display_name')
  .eq('id', userId)
  .maybeSingle();
```

#### 2. SELECT with Join

```typescript
const { data, error } = await supabase
  .from('user_books')
  .select(`
    id,
    status,
    current_page,
    book:books (
      id,
      title,
      author,
      cover_url
    )
  `)
  .eq('user_id', userId);
```

#### 3. INSERT

```typescript
const { error } = await supabase
  .from('activities')
  .insert({
    user_id: user.id,
    type: 'reading',
    title: 'Read ' + bookTitle,
    book_id: bookId,
    pages_read: pages,
    duration_minutes: minutes
  });
```

#### 4. UPDATE

```typescript
const { error } = await supabase
  .from('user_books')
  .update({ current_page: newPage })
  .eq('user_id', user.id)
  .eq('book_id', bookId);
```

#### 5. DELETE

```typescript
const { error } = await supabase
  .from('book_likes')
  .delete()
  .eq('user_id', user.id)
  .eq('book_key', bookKey);
```

#### 6. COUNT

```typescript
const { count } = await supabase
  .from('notifications')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .eq('read', false);
```

### Authentication

**Location:** `src/contexts/AuthContext.tsx`

```typescript
const { data: { user } } = await supabase.auth.getUser();
const { data: { session } } = await supabase.auth.getSession();
```

**User ID:** `user.id` (UUID from `auth.users`)

**Profile Lookup:** `user.id` matches `user_profiles.id`

---

## Common Failure Cases to Avoid

### 1. UUID vs Text Mismatches

**Problem:** Using text where UUID is expected, or vice versa.

**Example:**
```typescript
// ❌ WRONG - user.id is UUID, not text
.eq('user_id', user.id.toString())

// ✅ CORRECT
.eq('user_id', user.id)
```

### 2. user_id vs profile_id Confusion

**Problem:** There is NO `profile_id`. Use `user_id` which references `user_profiles.id`.

**Example:**
```typescript
// ❌ WRONG - profile_id does not exist
.eq('profile_id', user.id)

// ✅ CORRECT
.eq('user_id', user.id)
```

### 3. Joins on user_books / books

**Problem:** Incorrect join syntax or missing foreign key.

**Example:**
```typescript
// ✅ CORRECT - Use explicit foreign key name
.select(`
  *,
  book:books (
    id,
    title,
    author
  )
`)
```

### 4. Inserting Fields Blocked by RLS

**Problem:** Trying to insert fields that RLS doesn't allow.

**Example:**
```typescript
// ❌ WRONG - RLS policy requires auth.uid() = user_id
await supabase
  .from('activities')
  .insert({
    user_id: otherUserId,  // Not allowed by RLS
    type: 'reading'
  });

// ✅ CORRECT - Use current user's ID
await supabase
  .from('activities')
  .insert({
    user_id: user.id,  // Matches auth.uid()
    type: 'reading'
  });
```

### 5. Querying Non-Existent Columns

**Problem:** Code queries columns that don't exist in the schema.

**Example:**
```typescript
// ❌ WRONG - book_key does not exist in books table
.select('id, title, book_key')

// ✅ CORRECT - Use id or isbn
.select('id, title, isbn')
```

### 6. book_key vs book_id Confusion

**Problem:** Social features use `book_key` (text), not `book_id` (UUID).

**Example:**
```typescript
// ✅ CORRECT - book_likes uses book_key
await supabase
  .from('book_likes')
  .insert({
    book_key: 'ol:/works/OL123W',  // OpenLibrary key
    user_id: user.id
  });

// ❌ WRONG - book_likes.book_id is legacy and may be NULL
await supabase
  .from('book_likes')
  .insert({
    book_id: bookId,  // May not work for OpenLibrary books
    user_id: user.id
  });
```

---

## Safe Workflow for Changes

### Schema Changes

**⚠️ NEVER modify the database schema directly in Supabase dashboard.**

**Correct Workflow:**

1. **Create a migration file**
   ```
   supabase/migrations/YYYYMMDDHHMMSS_description.sql
   ```

2. **Write the SQL migration**
   ```sql
   -- Add column
   ALTER TABLE books
   ADD COLUMN new_column text;
   ```

3. **Update `docs/db/SUPABASE_SCHEMA.md`**
   - Add the new column to the table documentation
   - Update RLS policies if needed
   - Update indexes if needed

4. **Test the migration**
   - Run in Supabase SQL Editor (test environment)
   - Verify the change works

5. **Update code that uses the new column**
   - Add TypeScript types if needed
   - Update queries to use the new column

### Code Changes

1. **Check `docs/db/SUPABASE_SCHEMA.md`** before writing queries
2. **Verify column names and types**
3. **Test with real data** (if possible)
4. **Handle errors gracefully**

---

## DO NOT Section

### ⚠️ DO NOT Rename Tables or Columns

- Table and column names are fixed
- Renaming requires migrations and code updates
- Only do this if explicitly asked

### ⚠️ DO NOT Invent Relations

- Do not assume relationships exist
- Check `docs/db/SUPABASE_SCHEMA.md` for foreign keys
- Do not create joins on non-existent foreign keys

### ⚠️ DO NOT Touch `ios/` Manually

- `ios/` is generated by Capacitor
- Use `npx cap sync ios` to sync changes
- Only edit if explicitly asked (e.g., Info.plist)

### ⚠️ DO NOT Bypass RLS Logic

- RLS policies are intentional security measures
- Do not suggest using service role key in client code
- Do not suggest disabling RLS

### ⚠️ DO NOT Modify `docs/archive/`

- Archive is read-only historical reference
- Do not move files from archive to active code
- Do not delete archive files

### ⚠️ DO NOT Create Code for Hypothetical Fields

- Only use columns that exist in `docs/db/SUPABASE_SCHEMA.md`
- If a column doesn't exist, propose a migration first
- Do not write code assuming a column "should exist"

### ⚠️ DO NOT Change Application Features Without Explicit Request

- This is a documentation-only task
- Do not refactor business logic
- Do not change UI/UX
- Do not modify Supabase schema

---

## Quick Reference

### Most Used Tables

- `user_profiles` - User information
- `books` - Book catalog
- `user_books` - User's library (junction table)
- `activities` - User activities (reading, workouts, etc.)
- `book_likes` - Likes on books
- `books_cache` - Fast book metadata cache
- `activity_events` - Social feed events
- `follows` - Follow relationships
- `notifications` - User notifications

### Most Used Columns

- `user_id` - References `user_profiles.id` (UUID)
- `book_id` - References `books.id` (UUID)
- `book_key` - Text identifier (OpenLibrary key, ISBN, or UUID)
- `created_at` - Timestamp (timestamptz)
- `id` - Primary key (UUID, except `books_cache.book_key` which is text)

### Common RLS Patterns

- **Own data:** `auth.uid() = user_id`
- **Public read:** `USING (true)` for SELECT
- **Authenticated only:** `TO authenticated`

---

## Summary

**Before writing ANY Supabase code:**

1. ✅ Read `docs/db/SUPABASE_SCHEMA.md`
2. ✅ Verify table name
3. ✅ Verify column names
4. ✅ Verify RLS policies
5. ✅ Verify foreign keys
6. ✅ Test the query

**If something doesn't exist:**

1. ✅ Check the schema again
2. ✅ Check "⚠️ Potential Mismatches" section
3. ✅ Propose a migration if needed
4. ✅ DO NOT invent columns

**This rulebook exists to prevent Supabase-related mistakes forever.**

---

**End of Agent Rulebook**

