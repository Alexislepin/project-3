export type ActivityFocus = {
  ownerUserId: string;         // user.id (moi)
  activityId: string;
  commentId?: string | null;
  openComments?: boolean;      // true si notif comment
  openMyActivities?: boolean;  // true pour ouvrir le modal "Mes activités"
  source?: 'notification';
};

