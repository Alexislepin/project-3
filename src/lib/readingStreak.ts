/**
 * Reading streak calculation utilities
 * All calculations use LOCAL timezone (device timezone), not UTC
 */

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Computes the reading streak from activities
 * 
 * Rules:
 * - A "active day" = at least one activity with:
 *   - pages_read > 0 OR duration_minutes > 0
 * - Grace day: if you read yesterday but not yet today, streak is preserved until midnight
 * - Streak = number of consecutive active days counting backwards from anchor (today or yesterday)
 * 
 * @param activities Array of activities with created_at, pages_read, duration_minutes
 * @returns The current streak (0 if no activity today or yesterday)
 */
export function computeStreakFromActivities(activities: any[]) {
  // 1) set des jours actifs (local time)
  const activeDays = new Set<string>();

  for (const a of activities || []) {
    if (!a?.created_at) continue;
    const mins = Number(a.duration_minutes) || 0;
    const pages = Number(a.pages_read) || 0;
    // on ignore les logs "vides"
    if (mins <= 0 && pages <= 0) continue;

    const dayKey = toLocalDateKey(new Date(a.created_at));
    activeDays.add(dayKey);
  }

  const today = startOfLocalDay(new Date());
  const todayKey = toLocalDateKey(today);
  const yesterdayKey = toLocalDateKey(addDays(today, -1));

  const hasToday = activeDays.has(todayKey);
  const hasYesterday = activeDays.has(yesterdayKey);

  // 2) anchor = today si lu aujourd'hui, sinon yesterday si lu hier, sinon streak cassée
  let anchor = today;
  let grace = false;

  if (hasToday) {
    anchor = today;
    grace = false;
  } else if (hasYesterday) {
    anchor = addDays(today, -1);
    grace = true; // ✅ jour de grâce (warning jusqu'à minuit)
  } else {
    return 0; // pas de streak
  }

  // 3) calcul streak en remontant depuis anchor
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const key = toLocalDateKey(addDays(anchor, -i));
    if (activeDays.has(key)) streak++;
    else break;
  }

  return streak;
}

/**
 * Computes streak info with "grace day" support
 * 
 * Grace day: if you read yesterday but not yet today, streak is preserved but marked as "atRisk"
 * 
 * @param activities Array of activities with created_at, pages_read, duration_minutes
 * @param now Current date (defaults to new Date())
 * @returns Object with streak, atRisk, hasReadToday, and msLeft (milliseconds until midnight if atRisk)
 */
export function computeStreakInfoFromActivities(activities: any[], now = new Date()) {
  // jours "actifs" = au moins pages>0 ou duration>0 ou photos>0
  const activeKeys = new Set<string>();

  for (const a of activities || []) {
    if (!a?.created_at) continue;
    const pages = Number(a.pages_read) || 0;
    const mins = Number(a.duration_minutes) || 0;
    const photos = a?.photos;
    const hasPhotos = Array.isArray(photos) && photos.length > 0;
    
    // Count as active if pages > 0 OR duration > 0 OR photos > 0
    if (pages <= 0 && mins <= 0 && !hasPhotos) continue;

    const d = new Date(a.created_at);
    activeKeys.add(toLocalDateKey(d));
  }

  const today = startOfLocalDay(now);
  const todayKey = toLocalDateKey(today);
  const yesterdayKey = toLocalDateKey(addDays(today, -1));

  const hasReadToday = activeKeys.has(todayKey);

  // ✅ "grace day": si tu as lu hier mais pas encore aujourd'hui → streak conservé + warning
  let anchorKey: string | null = null;
  let atRisk = false;

  if (hasReadToday) {
    anchorKey = todayKey;
  } else if (activeKeys.has(yesterdayKey)) {
    anchorKey = yesterdayKey;
    atRisk = true;
  } else {
    return { streak: 0, atRisk: false, hasReadToday: false, msLeft: 0 };
  }

  // calc streak: on part de anchorDay et on remonte tant que les jours sont actifs
  let streak = 0;
  let cursor = new Date(anchorKey + 'T00:00:00'); // local-ish
  // (petite astuce: on reconstruit depuis year/month/day)
  const [yy, mm, dd] = anchorKey.split('-').map(Number);
  cursor = new Date(yy, (mm - 1), dd);

  while (true) {
    const key = toLocalDateKey(cursor);
    if (!activeKeys.has(key)) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const endOfToday = addDays(today, 1); // demain 00:00
  const msLeft = atRisk ? Math.max(0, endOfToday.getTime() - now.getTime()) : 0;

  return { streak, atRisk, hasReadToday, msLeft };
}

