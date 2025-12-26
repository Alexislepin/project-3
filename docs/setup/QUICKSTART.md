# Quick Start Guide - LUXUS

## 🚀 Get Up and Running in 5 Minutes

### Step 1: Environment Setup

Make sure your `.env` file has the Supabase credentials:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Step 2: Test the App

1. **Create an Account**
   - Use the signup form
   - Choose username: `testuser`
   - Display name: `Test User`
   - Email: `test@example.com`
   - Password: `password123`

2. **Complete Onboarding**
   - Select interests: Reading, Fitness, Learning
   - Choose goals: All three goals

3. **Add a Book to Your Library**

   Since we have sample books in the database, you can add them via SQL:

   ```sql
   INSERT INTO user_books (user_id, book_id, status, current_page)
   VALUES (
     'your-user-id',
     'b1a2c3d4-e5f6-7890-1234-567890abcdef', -- Atomic Habits
     'reading',
     42
   );
   ```

   Or use the Supabase dashboard to insert manually.

4. **Log Your First Activity**
   - Click the yellow + button
   - Select "Reading"
   - Choose "Atomic Habits" from dropdown
   - Enter 25 pages
   - Enter 30 minutes duration
   - Add notes: "Great insights on habit formation"
   - Click "Log activity"

5. **Explore the App**
   - View your activity in the feed
   - Check Library to see updated progress
   - Visit Insights to see weekly stats
   - Go to Profile to see your stats

### Step 3: Test Social Features

To test social features, you need multiple users:

1. Create a second account (use incognito/private window)
2. Get the user IDs from Supabase
3. Add a follow relationship:

```sql
INSERT INTO follows (follower_id, following_id)
VALUES ('user-1-id', 'user-2-id');
```

4. Now user 1 will see user 2's activities in their "Following" feed

### Available Sample Books

The database includes these books for testing:

1. **Atomic Habits** - James Clear
2. **Dune** - Frank Herbert
3. **The Midnight Library** - Matt Haig
4. **Deep Work** - Cal Newport
5. **Project Hail Mary** - Andy Weir
6. **1984** - George Orwell
7. **The Psychology of Money** - Morgan Housel
8. **Educated** - Tara Westover
9. **The Design of Everyday Things** - Don Norman
10. **The Lean Startup** - Eric Ries

### Quick SQL Commands for Testing

**Add a book to your library:**
```sql
INSERT INTO user_books (user_id, book_id, status, current_page)
SELECT 'YOUR_USER_ID', id, 'reading', 0
FROM books
WHERE title = 'Atomic Habits';
```

**Create sample activities:**
```sql
INSERT INTO activities (user_id, type, title, pages_read, duration_minutes)
VALUES
  ('YOUR_USER_ID', 'reading', 'Morning reading session', 20, 25),
  ('YOUR_USER_ID', 'workout', 'Morning run', 0, 30),
  ('YOUR_USER_ID', 'learning', 'React tutorial', 0, 45);
```

**Update your streak:**
```sql
UPDATE user_profiles
SET current_streak = 7, longest_streak = 12
WHERE id = 'YOUR_USER_ID';
```

### Troubleshooting

**Can't see activities in feed?**
- Make sure you've logged at least one activity
- Check the filter (All/Following/Me)
- Verify RLS policies are working

**Books not showing in library?**
- Ensure you've added books via `user_books` table
- Check the status filter (Reading/Completed/Want to Read)

**Authentication issues?**
- Verify environment variables are set correctly
- Check Supabase dashboard for auth logs
- Ensure email confirmation is disabled in Supabase Auth settings

### Next Steps

Once the app is working:

1. Customize the design (colors, fonts)
2. Add more features (comments, advanced search)
3. Integrate book API for automatic book data
4. Add PWA manifest for mobile installation
5. Implement push notifications
6. Add data export functionality

## 📱 Mobile Testing

To test on mobile:

1. Run dev server: `npm run dev`
2. Find your local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
3. Access from phone: `http://YOUR_IP:5173`
4. Test responsive design and touch interactions

## 🎨 Customization Tips

**Change accent color from lime to your brand:**
- Search for `lime-400`, `lime-500`, `lime-600` in the codebase
- Replace with your preferred Tailwind color

**Modify typography:**
- Update font in `tailwind.config.js`
- Adjust font sizes in component classes

**Add dark mode:**
- Use Tailwind's `dark:` prefix
- Store theme preference in localStorage
- Add toggle in Profile page

Happy building! 🚀
