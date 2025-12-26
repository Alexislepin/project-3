import { supabase } from '../lib/supabase';

export interface DailyGoalStatus {
  goalId: string;
  goalType: string;
  targetValue: number;
  currentValue: number;
  isComplete: boolean;
  label: string;
  unit: string;
}

export async function checkDailyGoals(userId: string): Promise<DailyGoalStatus[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: goals } = await supabase
    .from('user_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('period', 'daily');

  if (!goals) return [];

  const { data: todayActivities } = await supabase
    .from('activities')
    .select('pages_read, duration_minutes')
    .eq('user_id', userId)
    .gte('created_at', today.toISOString());

  const totalPagesToday = todayActivities?.reduce((sum, a) => sum + (a.pages_read || 0), 0) || 0;
  const totalMinutesToday = todayActivities?.reduce((sum, a) => sum + (a.duration_minutes || 0), 0) || 0;

  return goals.map((goal) => {
    let currentValue = 0;
    let unit = '';
    let label = '';

    if (goal.type === 'daily_15min') {
      currentValue = totalMinutesToday;
      unit = 'min';
      label = 'Lire 15 minutes par jour';
    } else if (goal.type === 'daily_30min') {
      currentValue = totalMinutesToday;
      unit = 'min';
      label = 'Lire 30 minutes par jour';
    } else if (goal.type === 'daily_60min') {
      currentValue = totalMinutesToday;
      unit = 'min';
      label = 'Lire 60 minutes par jour';
    } else if (goal.type === 'daily_pages') {
      currentValue = totalPagesToday;
      unit = 'pages';
      label = 'Pages quotidiennes';
    } else if (goal.type === 'daily_time') {
      currentValue = totalMinutesToday;
      unit = 'min';
      label = 'Temps quotidien';
    }

    return {
      goalId: goal.id,
      goalType: goal.type,
      targetValue: goal.target_value,
      currentValue,
      isComplete: currentValue >= goal.target_value,
      label,
      unit,
    };
  });
}

export async function checkWeeklyGoals(userId: string): Promise<DailyGoalStatus[]> {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const { data: goals } = await supabase
    .from('user_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('period', 'weekly');

  if (!goals) return [];

  const { data: weekActivities } = await supabase
    .from('activities')
    .select('pages_read, duration_minutes')
    .eq('user_id', userId)
    .gte('created_at', startOfWeek.toISOString());

  const totalPagesWeek = weekActivities?.reduce((sum, a) => sum + (a.pages_read || 0), 0) || 0;
  const totalMinutesWeek = weekActivities?.reduce((sum, a) => sum + (a.duration_minutes || 0), 0) || 0;

  return goals.map((goal) => {
    let currentValue = 0;
    let unit = '';
    let label = '';

    if (goal.type === 'weekly_pages') {
      currentValue = totalPagesWeek;
      unit = 'pages';
      label = 'Pages hebdomadaires';
    } else if (goal.type === 'weekly_workouts') {
      currentValue = weekActivities?.length || 0;
      unit = 'sessions';
      label = 'Entraînements hebdomadaires';
    } else if (goal.type === 'weekly_books') {
      currentValue = 0;
      unit = 'livres';
      label = 'Livres hebdomadaires';
    }

    return {
      goalId: goal.id,
      goalType: goal.type,
      targetValue: goal.target_value,
      currentValue,
      isComplete: currentValue >= goal.target_value,
      label,
      unit,
    };
  });
}

export function sendGoalReminder(goals: DailyGoalStatus[]) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const incompleteGoals = goals.filter((g) => !g.isComplete);

  if (incompleteGoals.length === 0) {
    return;
  }

  const goalText = incompleteGoals.length === 1
    ? `Vous n'avez pas encore complété votre objectif : ${incompleteGoals[0].label}`
    : `Vous avez ${incompleteGoals.length} objectifs à compléter aujourd'hui`;

  new Notification('Rappel de lecture', {
    body: goalText,
    icon: '/image.png',
    badge: '/image.png',
    tag: 'daily-goal-reminder',
    requireInteraction: false,
  });
}

export async function scheduleGoalCheck(userId: string) {
  const { data: settings } = await supabase
    .from('user_profiles')
    .select('notifications_enabled, goal_reminder_enabled, notification_time')
    .eq('id', userId)
    .maybeSingle();

  if (!settings?.notifications_enabled || !settings?.goal_reminder_enabled) {
    return;
  }

  const now = new Date();
  const [hours, minutes] = settings.notification_time.split(':');
  const notificationTime = new Date();
  notificationTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  if (now > notificationTime) {
    notificationTime.setDate(notificationTime.getDate() + 1);
  }

  const timeUntilNotification = notificationTime.getTime() - now.getTime();

  setTimeout(async () => {
    const dailyGoals = await checkDailyGoals(userId);
    sendGoalReminder(dailyGoals);

    scheduleGoalCheck(userId);
  }, timeUntilNotification);
}
