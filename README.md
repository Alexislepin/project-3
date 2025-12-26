# LUXUS - Activity Tracking & Social Platform

A modern, mobile-first PWA for tracking reading, workouts, learning sessions, and habits. Built with React, TypeScript, Tailwind CSS, and Supabase.

## Features

### Core Functionality

- **Stitch Feed**: A personalized activity feed showing your progress and updates from people you follow
- **Activity Tracking**: Log reading sessions, workouts, learning time, and habits
- **Social Features**: Follow users, react to activities, and comment on posts
- **Personal Library**: Track books you're reading, completed books, and your reading list
- **Insights & Analytics**: View weekly stats, track goals, and monitor your streaks
- **Profile Management**: Showcase your stats, streaks, and interests

### Key Screens

1. **Home (Stitch Feed)**: Activity feed with filters (All, Following, Me)
2. **Library**: Book tracking with progress indicators and status management
3. **Insights**: Weekly statistics, goal tracking, and motivational insights
4. **Profile**: Personal stats, streaks, interests, and follower/following counts
5. **Log Activity**: Quick modal for logging various activities

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Database & Auth**: Supabase
- **Build Tool**: Vite
- **Icons**: Lucide React

## Database Schema

### Tables

- `user_profiles`: Extended user information
- `books`: Book catalog
- `user_books`: Personal library with reading progress
- `activities`: All user activities (reading, workouts, learning, habits)
- `follows`: Social connections between users
- `activity_reactions`: Likes on activities
- `activity_comments`: Comments on activities
- `user_goals`: User-defined goals (daily/weekly targets)

## Getting Started

### Prerequisites

1. Node.js 18+ installed
2. Supabase account and project

### Setup

1. **Configure Environment Variables**

Create a `.env` file with your Supabase credentials:

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

2. **Install Dependencies**

```bash
npm install
```

3. **Database Setup**

The database migrations have been applied automatically. Your Supabase project includes:
- All necessary tables with Row Level Security (RLS) enabled
- Sample book data for testing
- Proper indexes for performance

4. **Run Development Server**

```bash
npm run dev
```

5. **Build for Production**

```bash
npm run build
```

## Usage

### First Time Users

1. **Sign Up**: Create an account with email/password
2. **Onboarding**: Select your interests and set goals
3. **Add Books**: Navigate to Library and add books you're reading
4. **Log Activities**: Use the + button to log your first activity
5. **Explore Feed**: View activities in the Stitch feed

### Logging Activities

Click the yellow + button (bottom right) to log:
- **Reading**: Link to a book, track pages and time
- **Workout**: Record duration and workout type
- **Learning**: Track study or practice sessions
- **Habit**: Log completion of daily habits

### Social Features

- Activities are visible to users who follow you
- React to activities with a heart
- Comment on posts to engage with the community

## Design Philosophy

- **Minimalist**: Clean, distraction-free interface
- **Mobile-First**: Optimized for phone and tablet use
- **Calm & Premium**: Neutral stone colors with lime accent
- **Typography-Focused**: Clear hierarchy and readable fonts
- **Signal > Noise**: Focus on meaningful content, not viral metrics

## Project Structure

```
src/
├── components/
│   ├── auth/          # Login, Signup, Onboarding
│   ├── layout/        # AppLayout, BottomNav
│   └── ActivityCard.tsx
├── contexts/
│   └── AuthContext.tsx
├── lib/
│   └── supabase.ts
├── pages/
│   ├── Home.tsx       # Stitch feed
│   ├── Library.tsx    # Book tracking
│   ├── Insights.tsx   # Analytics
│   ├── Profile.tsx    # User profile
│   └── LogActivity.tsx
├── utils/
│   └── dateUtils.ts
├── App.tsx
└── main.tsx
```

## Key Features Explained

### Stitch Feed Algorithm

The feed shows:
1. Your own activities (when "Me" filter is active)
2. Activities from users you follow (when "Following" filter is active)
3. All activities (when "All" filter is active)

### Streak Tracking

- Streaks are calculated based on consecutive days with logged activities
- Current streak is displayed on the home screen with a flame icon
- Longest streak is shown in your profile stats

### Goal System

Users can set goals like:
- Daily page reading targets
- Weekly workout frequency
- Daily learning time
- Progress is tracked automatically based on logged activities

### Book Progress

- Automatically updates when you log reading activities
- Visual progress bar shows percentage complete
- Track current page and total pages
- Supports multiple reading statuses: Reading, Completed, Want to Read

## Security

- Row Level Security (RLS) enabled on all tables
- Users can only modify their own data
- Activities are only visible to followers or the user themselves
- Secure authentication via Supabase Auth

## Future Enhancements

Potential features to add:
- Book search API integration
- Activity comments functionality
- Push notifications for reactions/comments
- Advanced analytics charts
- Achievement badges
- Weekly/monthly challenges
- Export data functionality
- Dark mode

## License

This project is built as a demonstration/MVP.
