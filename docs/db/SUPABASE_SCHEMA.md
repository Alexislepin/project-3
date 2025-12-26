# Supabase Database Schema - Source of Truth

**⚠️ CRITICAL: This document is the AUTHORITATIVE source for all Supabase tables, columns, and RLS policies.**
**Before writing ANY Supabase query, check this document first.**

**Last Updated:** 2025-01-XX  
**Source Files:**
- `docs/db/setup_complete_database.sql`
- `docs/db/check_and_create_tables.sql`
- `supabase/migrations/*.sql`
- Code analysis from `src/**/*.tsx`

---

## Table of Contents

1. [Core Tables](#core-tables)
2. [Social Tables](#social-tables)
3. [Cache & Utility Tables](#cache--utility-tables)
4. [Relationships](#relationships)
5. [RLS Policies Summary](#rls-policies-summary)
6. [Indexes](#indexes)
7. [Functions & Triggers](#functions--triggers)
8. [⚠️ Potential Mismatches](#-potential-mismatches)

---

## Core Tables

### 1. `user_profiles`

**Purpose:** Extended user profile information linked to Supabase Auth.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | - | PRIMARY KEY, REFERENCES `auth.users(id)` ON DELETE CASCADE |
| `username` | `text` | ❌ NO | - | UNIQUE constraint |
| `display_name` | `text` | ❌ NO | - | User's display name |
| `bio` | `text` | ✅ YES | `NULL` | User biography |
| `avatar_url` | `text` | ✅ YES | `NULL` | URL to user avatar image |
| `current_streak` | `integer` | ✅ YES | `0` | Current consecutive days with activities |
| `longest_streak` | `integer` | ✅ YES | `0` | Longest streak ever achieved |
| `total_pages_read` | `integer` | ✅ YES | `0` | Total pages read across all books |
| `total_books_completed` | `integer` | ✅ YES | `0` | Total books completed |
| `total_hours_logged` | `integer` | ✅ YES | `0` | Total hours logged in activities |
| `interests` | `text[]` | ✅ YES | `'{}'` | Array of interest tags |
| `notifications_enabled` | `boolean` | ✅ YES | `false` | Master switch for notifications |
| `notification_time` | `time` | ✅ YES | `'20:00:00'` | Preferred time for daily reminders |
| `goal_reminder_enabled` | `boolean` | ✅ YES | `true` | Enable/disable goal reminders |
| `created_at` | `timestamptz` | ✅ YES | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | ✅ YES | `now()` | Last update timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `username`  
**Foreign Keys:** `id` → `auth.users(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

---

### 2. `books`

**Purpose:** Catalog of all books in the system.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `title` | `text` | ❌ NO | - | Book title |
| `author` | `text` | ✅ YES | `NULL` | Author name(s) |
| `isbn` | `text` | ✅ YES | `NULL` | ISBN (unique when not null) |
| `cover_url` | `text` | ✅ YES | `NULL` | URL to book cover image |
| `description` | `text` | ✅ YES | `NULL` | Book description |
| `total_pages` | `integer` | ✅ YES | `NULL` | Total number of pages |
| `edition` | `text` | ✅ YES | `NULL` | Edition information |
| `google_books_id` | `text` | ✅ YES | `NULL` | Google Books API ID |
| `openlibrary_cover_id` | `integer` | ✅ YES | `NULL` | OpenLibrary cover ID (from migration) |
| `created_at` | `timestamptz` | ✅ YES | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `isbn` (unique index where `isbn IS NOT NULL`)  
**Foreign Keys:** None  
**RLS Enabled:** ✅ YES

**Note:** The code sometimes queries for columns that don't exist in this table:
- `book_key` - Does NOT exist (use `id` or `isbn`)
- `openlibrary_key` - Does NOT exist
- `description_clean` - Does NOT exist (use `description`)
- `source` - Does NOT exist
- `source_id` - Does NOT exist

---

### 3. `user_books`

**Purpose:** Junction table linking users to books with reading status and progress.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `book_id` | `uuid` | ❌ NO | - | REFERENCES `books(id)` ON DELETE CASCADE |
| `status` | `text` | ❌ NO | - | CHECK: `'reading'`, `'completed'`, `'want_to_read'`, `'abandoned'` |
| `current_page` | `integer` | ✅ YES | `0` | Current reading progress (page number) |
| `started_at` | `timestamptz` | ✅ YES | `NULL` | When user started reading |
| `completed_at` | `timestamptz` | ✅ YES | `NULL` | When user completed the book |
| `rating` | `integer` | ✅ YES | `NULL` | CHECK: `1 <= rating <= 5` |
| `created_at` | `timestamptz` | ✅ YES | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | ✅ YES | `now()` | Last update timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `(user_id, book_id)` - One entry per user per book  
**Foreign Keys:**
- `user_id` → `user_profiles(id)` ON DELETE CASCADE
- `book_id` → `books(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

**Note:** The code sometimes queries for columns that don't exist:
- `custom_title` - Does NOT exist
- `custom_author` - Does NOT exist
- `custom_total_pages` - Does NOT exist
- `custom_description` - Does NOT exist
- `custom_cover_url` - Does NOT exist

---

### 4. `activities`

**Purpose:** User activities (reading sessions, workouts, learning, habits) for the social feed.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `type` | `text` | ❌ NO | - | CHECK: `'reading'`, `'workout'`, `'learning'`, `'habit'` |
| `title` | `text` | ❌ NO | - | Activity title |
| `description` | `text` | ✅ YES | `NULL` | Activity description/notes |
| `book_id` | `uuid` | ✅ YES | `NULL` | REFERENCES `books(id)` ON DELETE SET NULL (for reading activities) |
| `pages_read` | `integer` | ✅ YES | `0` | Pages read (for reading activities) |
| `duration_minutes` | `integer` | ✅ YES | `0` | Duration in minutes |
| `visibility` | `text` | ✅ YES | `'public'` | CHECK: `'public'`, `'followers'`, `'private'` |
| `photos` | `text[]` | ✅ YES | `'{}'` | Array of photo URLs |
| `quotes` | `jsonb` | ✅ YES | `'[]'` | Array of quotes with page numbers |
| `created_at` | `timestamptz` | ✅ YES | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Unique Constraints:** None  
**Foreign Keys:**
- `user_id` → `user_profiles(id)` ON DELETE CASCADE
- `book_id` → `books(id)` ON DELETE SET NULL  
**RLS Enabled:** ✅ YES

---

### 5. `follows`

**Purpose:** Social relationships - who follows whom.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `follower_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `following_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | ✅ YES | `now()` | Creation timestamp |

**Primary Key:** `(follower_id, following_id)` - Composite primary key  
**Unique Constraints:** Implicit via PRIMARY KEY  
**Check Constraints:** `follower_id != following_id` - Users cannot follow themselves  
**Foreign Keys:**
- `follower_id` → `user_profiles(id)` ON DELETE CASCADE
- `following_id` → `user_profiles(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

---

### 6. `notifications`

**Purpose:** User notifications (follows, activity reactions, comments).

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE (notification recipient) |
| `type` | `text` | ❌ NO | - | CHECK: `'follow'`, `'activity'`, `'reaction'`, `'comment'` |
| `actor_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE (who triggered the notification) |
| `read` | `boolean` | ✅ YES | `false` | Whether notification has been read |
| `created_at` | `timestamptz` | ✅ YES | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Unique Constraints:** None  
**Foreign Keys:**
- `user_id` → `user_profiles(id)` ON DELETE CASCADE
- `actor_id` → `user_profiles(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

---

### 7. `activity_reactions`

**Purpose:** Likes/reactions on activities.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `activity_id` | `uuid` | ❌ NO | - | REFERENCES `activities(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | ✅ YES | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `(activity_id, user_id)` - One reaction per user per activity  
**Foreign Keys:**
- `activity_id` → `activities(id)` ON DELETE CASCADE
- `user_id` → `user_profiles(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

---

### 8. `activity_comments`

**Purpose:** Comments on activities.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `activity_id` | `uuid` | ❌ NO | - | REFERENCES `activities(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `content` | `text` | ❌ NO | - | Comment text |
| `created_at` | `timestamptz` | ✅ YES | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Unique Constraints:** None  
**Foreign Keys:**
- `activity_id` → `activities(id)` ON DELETE CASCADE
- `user_id` → `user_profiles(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

---

### 9. `user_goals`

**Purpose:** User-defined goals (daily/weekly targets).

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `type` | `text` | ❌ NO | - | CHECK: `'daily_pages'`, `'weekly_workouts'`, `'daily_time'`, `'weekly_books'`, `'daily_15min'`, `'daily_30min'`, `'daily_60min'`, `'weekly_pages'` |
| `target_value` | `integer` | ❌ NO | - | Target value (pages, minutes, etc.) |
| `period` | `text` | ❌ NO | - | CHECK: `'daily'`, `'weekly'` |
| `active` | `boolean` | ✅ YES | `true` | Whether goal is active |
| `created_at` | `timestamptz` | ✅ YES | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Unique Constraints:** None  
**Foreign Keys:** `user_id` → `user_profiles(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

---

### 10. `clubs`

**Purpose:** Reading clubs/groups.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `name` | `text` | ❌ NO | - | Club name |
| `description` | `text` | ✅ YES | `NULL` | Club description |
| `category` | `text` | ✅ YES | `NULL` | Club category |
| `is_private` | `boolean` | ✅ YES | `false` | Whether club is private |
| `creator_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `member_count` | `integer` | ✅ YES | `0` | Number of members |
| `created_at` | `timestamptz` | ✅ YES | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | ✅ YES | `now()` | Last update timestamp |

**Primary Key:** `id`  
**Unique Constraints:** None  
**Foreign Keys:** `creator_id` → `user_profiles(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

---

### 11. `club_members`

**Purpose:** Junction table for club memberships.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `club_id` | `uuid` | ❌ NO | - | REFERENCES `clubs(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `role` | `text` | ✅ YES | `'member'` | CHECK: `'admin'`, `'moderator'`, `'member'` |
| `joined_at` | `timestamptz` | ✅ YES | `now()` | When user joined |

**Primary Key:** `id`  
**Unique Constraints:** `(club_id, user_id)` - One membership per user per club  
**Foreign Keys:**
- `club_id` → `clubs(id)` ON DELETE CASCADE
- `user_id` → `user_profiles(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

---

## Social Tables

### 12. `book_likes`

**Purpose:** Likes on books (separate from activity reactions).

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `book_id` | `uuid` | ✅ YES | `NULL` | REFERENCES `books(id)` ON DELETE CASCADE (legacy, may be null) |
| `book_key` | `text` | ❌ NO | - | Book key (OpenLibrary key, ISBN, or UUID) |
| `user_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | ❌ NO | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `(user_id, book_key)` - One like per user per book key  
**Foreign Keys:**
- `book_id` → `books(id)` ON DELETE CASCADE (nullable, legacy)
- `user_id` → `user_profiles(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

**Note:** `book_key` is the primary identifier. `book_id` is legacy and may be NULL.

---

### 13. `book_comments`

**Purpose:** Comments on books (separate from activity comments).

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `book_id` | `uuid` | ✅ YES | `NULL` | REFERENCES `books(id)` ON DELETE CASCADE (legacy, may be null) |
| `book_key` | `text` | ❌ NO | - | Book key (OpenLibrary key, ISBN, or UUID) |
| `user_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE |
| `content` | `text` | ❌ NO | - | Comment text (CHECK: `1 <= length <= 1000`) |
| `created_at` | `timestamptz` | ❌ NO | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | ❌ NO | `now()` | Last update timestamp (auto-updated by trigger) |

**Primary Key:** `id`  
**Unique Constraints:** None  
**Foreign Keys:**
- `book_id` → `books(id)` ON DELETE CASCADE (nullable, legacy)
- `user_id` → `user_profiles(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

**Note:** `book_key` is the primary identifier. `book_id` is legacy and may be NULL.

---

## Cache & Utility Tables

### 14. `books_cache`

**Purpose:** Cache for book metadata (title, author, cover) for fast rendering without joining `books` table.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `book_key` | `text` | ❌ NO | - | PRIMARY KEY (OpenLibrary key, ISBN, or UUID) |
| `title` | `text` | ❌ NO | - | Book title |
| `author` | `text` | ✅ YES | `NULL` | Author name(s) |
| `cover_url` | `text` | ✅ YES | `NULL` | URL to book cover image |
| `isbn` | `text` | ✅ YES | `NULL` | ISBN |
| `source` | `text` | ✅ YES | `NULL` | Source of the book data |
| `updated_at` | `timestamptz` | ❌ NO | `now()` | Last update timestamp |

**Primary Key:** `book_key`  
**Unique Constraints:** Implicit via PRIMARY KEY  
**Foreign Keys:** None  
**RLS Enabled:** ✅ YES

**Note:** This table is used for fast lookups by `book_key` (e.g., `ol:/works/OL123W`). It does NOT have `google_books_id` or `cover_i` columns.

---

### 15. `activity_events`

**Purpose:** Events for the social feed (book likes, book comments) - separate from `activities` table.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `actor_id` | `uuid` | ❌ NO | - | REFERENCES `user_profiles(id)` ON DELETE CASCADE (who performed the action) |
| `event_type` | `text` | ❌ NO | - | CHECK: `'like'`, `'comment'` (or `'book_like'`, `'book_comment'` in code) |
| `book_key` | `text` | ❌ NO | - | Book key (OpenLibrary key, ISBN, or UUID) |
| `comment_id` | `uuid` | ✅ YES | `NULL` | ID of the comment (null for likes) |
| `created_at` | `timestamptz` | ❌ NO | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `(actor_id, event_type, book_key)` WHERE `event_type = 'like'` - One like per user per book  
**Foreign Keys:** `actor_id` → `user_profiles(id)` ON DELETE CASCADE  
**RLS Enabled:** ✅ YES

**Note:** The column was renamed from `actor_user_id` to `actor_id` in migration `20250124000000_fix_activity_events_actor_id.sql`.

---

### 16. `book_summaries`

**Purpose:** Cache for AI-generated book summaries by language.

**Columns:**

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `id` | `uuid` | ❌ NO | `gen_random_uuid()` | PRIMARY KEY |
| `source` | `text` | ❌ NO | - | Source of the book (`'google'`, `'openlibrary'`, etc.) |
| `source_id` | `text` | ❌ NO | - | Book ID from source system (e.g., Google Books ID, OpenLibrary key) |
| `lang` | `text` | ❌ NO | `'fr'` | Language code (`'fr'`, `'en'`, etc.) |
| `summary` | `text` | ❌ NO | - | Generated summary text (2-4 sentences) |
| `created_at` | `timestamptz` | ❌ NO | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | ❌ NO | `now()` | Last update timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `(source, source_id, lang)` - One summary per source/source_id/lang combination  
**Foreign Keys:** None  
**RLS Enabled:** ✅ YES

---

## Relationships

### One-to-Many

- `user_profiles` → `user_books` (one user has many books)
- `user_profiles` → `activities` (one user has many activities)
- `user_profiles` → `follows` (as `follower_id` or `following_id`)
- `user_profiles` → `notifications` (as `user_id` or `actor_id`)
- `user_profiles` → `user_goals` (one user has many goals)
- `user_profiles` → `clubs` (as `creator_id`)
- `user_profiles` → `club_members` (one user can be in many clubs)
- `books` → `user_books` (one book can be in many users' libraries)
- `books` → `activities` (one book can have many reading activities)
- `activities` → `activity_reactions` (one activity has many reactions)
- `activities` → `activity_comments` (one activity has many comments)
- `clubs` → `club_members` (one club has many members)

### Many-to-Many

- `user_profiles` ↔ `user_profiles` via `follows` (users follow each other)
- `user_profiles` ↔ `books` via `user_books` (users have many books, books belong to many users)
- `user_profiles` ↔ `clubs` via `club_members` (users join many clubs, clubs have many users)

### Junction Tables

- `user_books`: Links users to books with status and progress
- `follows`: Links users to users (who follows whom)
- `club_members`: Links users to clubs with roles
- `activity_reactions`: Links users to activities (likes)
- `activity_comments`: Links users to activities (comments)
- `book_likes`: Links users to books (likes on books)
- `book_comments`: Links users to books (comments on books)

---

## RLS Policies Summary

### `user_profiles`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Public profiles are viewable by everyone` | SELECT | `true` | Anyone can read profiles |
| `Users can insert own profile` | INSERT | `auth.uid() = id` | Users can create their own profile |
| `Users can update own profile` | UPDATE | `auth.uid() = id` | Users can only update their own profile |

### `books`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Books are viewable by everyone` | SELECT | `true` | Anyone can read books |
| `Anyone can insert books` | INSERT | `true` | Anyone can add books |

### `user_books`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `authenticated_users_can_read_all_user_books` | SELECT | `true` | Authenticated users can read all user_books |
| `users_can_insert_own_books` | INSERT | `auth.uid() = user_id` | Users can only add books to their own library |
| `users_can_update_own_books` | UPDATE | `auth.uid() = user_id` | Users can only update their own books |
| `users_can_delete_own_books` | DELETE | `auth.uid() = user_id` | Users can only delete their own books |

### `activities`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Activities are viewable by everyone` | SELECT | `true` | Anyone can read activities |
| `Users can manage own activities` | ALL | `auth.uid() = user_id` | Users can only manage their own activities |

### `follows`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Follows are viewable by everyone` | SELECT | `true` | Anyone can read follow relationships |
| `Users can manage own follows` | ALL | `auth.uid() = follower_id` | Users can only manage follows where they are the follower |

### `notifications`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Users can read own notifications` | SELECT | `auth.uid() = user_id` | Users can only read their own notifications |
| `Users can update own notifications` | UPDATE | `auth.uid() = user_id` | Users can only update their own notifications |
| `Allow notification inserts` | INSERT | `true` | Anyone can insert notifications (for triggers) |

### `activity_reactions`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Reactions are viewable by everyone` | SELECT | `true` | Anyone can read reactions |
| `Users can manage own reactions` | ALL | `auth.uid() = user_id` | Users can only manage their own reactions |

### `activity_comments`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Comments are viewable by everyone` | SELECT | `true` | Anyone can read comments |
| `Users can manage own comments` | ALL | `auth.uid() = user_id` | Users can only manage their own comments |

### `user_goals`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Users can read own goals` | SELECT | `auth.uid() = user_id` | Users can only read their own goals |
| `Users can manage own goals` | ALL | `auth.uid() = user_id` | Users can only manage their own goals |

### `clubs`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Clubs are viewable by everyone` | SELECT | `true` | Anyone can read clubs |
| `Users can create clubs` | INSERT | `auth.uid() = creator_id` | Users can create clubs where they are the creator |
| `Creators can update own clubs` | UPDATE | `auth.uid() = creator_id` | Only creators can update their clubs |

### `club_members`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Club members are viewable by everyone` | SELECT | `true` | Anyone can read club memberships |
| `Users can manage own memberships` | ALL | `auth.uid() = user_id` | Users can only manage their own memberships |

### `book_likes`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Anyone can read book likes` | SELECT | `true` | Authenticated users can read likes |
| `Users can insert their own likes` | INSERT | `auth.uid() = user_id` | Users can only like as themselves |
| `Users can delete their own likes` | DELETE | `auth.uid() = user_id` | Users can only unlike their own likes |

### `book_comments`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Anyone can read book comments` | SELECT | `true` | Authenticated users can read comments |
| `Users can insert their own comments` | INSERT | `auth.uid() = user_id` | Users can only comment as themselves |
| `Users can update their own comments` | UPDATE | `auth.uid() = user_id` | Users can only update their own comments |
| `Users can delete their own comments` | DELETE | `auth.uid() = user_id` | Users can only delete their own comments |

### `books_cache`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `books_cache_read_all` | SELECT | `true` | Authenticated users can read cache |
| `books_cache_upsert_authenticated` | ALL | `true` | Authenticated users can insert/update cache |

### `activity_events`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `activity_events_read_all_authenticated` | SELECT | `true` | Authenticated users can read events |
| `activity_events_insert_own` | INSERT | `actor_id = auth.uid()` | Users can only insert events where they are the actor |
| `activity_events_delete_own` | DELETE | `actor_id = auth.uid()` | Users can only delete their own events |

### `book_summaries`

| Policy Name | Operation | Condition | Explanation |
|------------|-----------|-----------|-------------|
| `Allow authenticated users to read summaries` | SELECT | `true` | Authenticated users can read summaries |
| `Allow authenticated users to insert summaries` | INSERT | `true` | Authenticated users can insert summaries |
| `Allow authenticated users to update summaries` | UPDATE | `true` | Authenticated users can update summaries |

---

## Indexes

### Performance Indexes

- `idx_activities_user_id` ON `activities(user_id)`
- `idx_activities_created_at` ON `activities(created_at DESC)`
- `idx_activities_visibility` ON `activities(visibility)`
- `idx_user_books_user_id` ON `user_books(user_id)`
- `idx_follows_follower` ON `follows(follower_id)`
- `idx_follows_following` ON `follows(following_id)`
- `idx_notifications_user_id` ON `notifications(user_id)`
- `idx_notifications_created_at` ON `notifications(created_at DESC)`
- `idx_notifications_user_read` ON `notifications(user_id, read, created_at DESC)`
- `idx_user_goals_user_id` ON `user_goals(user_id)`
- `idx_user_goals_active` ON `user_goals(user_id, active)` WHERE `active = true`
- `idx_book_likes_book_id` ON `book_likes(book_id)`
- `idx_book_likes_user_id` ON `book_likes(user_id)`
- `idx_book_likes_created_at` ON `book_likes(created_at DESC)`
- `idx_book_likes_book_key` ON `book_likes(book_key)`
- `idx_book_comments_book_id` ON `book_comments(book_id)`
- `idx_book_comments_user_id` ON `book_comments(user_id)`
- `idx_book_comments_created_at` ON `book_comments(created_at DESC)`
- `idx_book_comments_book_key` ON `book_comments(book_key)`
- `idx_books_cache_book_key` ON `books_cache(book_key)`
- `idx_books_cache_updated_at` ON `books_cache(updated_at DESC)`
- `idx_activity_events_created_at` ON `activity_events(created_at DESC)`
- `idx_activity_events_actor_created` ON `activity_events(actor_id, created_at DESC)`
- `idx_activity_events_book_key` ON `activity_events(book_key)`
- `activity_events_unique_like` ON `activity_events(actor_id, event_type, book_key)` WHERE `event_type = 'like'`
- `idx_book_summaries_lookup` ON `book_summaries(source, source_id, lang)`
- `idx_book_summaries_created_at` ON `book_summaries(created_at)`
- `books_isbn_unique` ON `books(isbn)` WHERE `isbn IS NOT NULL`

---

## Functions & Triggers

### Functions

1. **`handle_new_user()`**
   - **Purpose:** Automatically create a `user_profiles` entry when a new user signs up
   - **Trigger:** `on_auth_user_created` AFTER INSERT ON `auth.users`
   - **Logic:** Extracts `username` and `display_name` from `raw_user_meta_data`, falls back to defaults

2. **`create_follow_notification()`**
   - **Purpose:** Automatically create a notification when someone follows a user
   - **Trigger:** `on_follow_create_notification` AFTER INSERT ON `follows`
   - **Logic:** Inserts notification for the `following_id` user with type `'follow'`

3. **`update_book_comments_updated_at()`**
   - **Purpose:** Automatically update `updated_at` when a comment is modified
   - **Trigger:** `book_comments_updated_at` BEFORE UPDATE ON `book_comments`
   - **Logic:** Sets `updated_at = NOW()`

---

## ⚠️ Potential Mismatches

### Columns Queried in Code But NOT in Schema

#### `books` table:
- ❌ `book_key` - Does NOT exist (code sometimes queries this, but it's not in the schema)
- ❌ `openlibrary_key` - Does NOT exist
- ❌ `description_clean` - Does NOT exist (use `description`)
- ❌ `source` - Does NOT exist
- ❌ `source_id` - Does NOT exist
- ❌ `cover_i` - Does NOT exist (use `openlibrary_cover_id` or `cover_url`)

#### `user_books` table:
- ❌ `custom_title` - Does NOT exist
- ❌ `custom_author` - Does NOT exist
- ❌ `custom_total_pages` - Does NOT exist
- ❌ `custom_description` - Does NOT exist
- ❌ `custom_cover_url` - Does NOT exist

#### `books_cache` table:
- ❌ `google_books_id` - Does NOT exist
- ❌ `cover_i` - Does NOT exist
- ❌ `openlibrary_key` - Does NOT exist

**Action Required:** Review code that queries these non-existent columns and fix or remove those queries.

---

## Notes for AI Agents

1. **Always check this document before writing Supabase queries**
2. **Never assume a column exists** - verify in this document first
3. **Use exact column names** - case-sensitive, no typos
4. **Respect RLS policies** - understand who can read/write what
5. **Use `book_key` for social features** - not `book_id` (for `book_likes`, `book_comments`, `activity_events`)
6. **`books_cache` is a cache** - it may not have all columns that `books` has
7. **UUIDs are used for IDs** - not integers or text (except `book_key` which is text)

---

**End of Schema Documentation**

