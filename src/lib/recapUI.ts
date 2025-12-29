export type RecapUIState = {
  tab: 'personnages' | 'takeaways' | 'detaille' | 'defi';
  recapLoading: boolean;
  recapError: null | { message: string; requestId?: string };
  recapData: any | null;

  // challenge
  userAnswerDraft: string;
  submittedAnswer?: string;
  frozenQuestion?: string | null;

  challengeSubmitting: boolean;
  hasSubmittedChallenge: boolean;
  challengeResult: null | {
    verdict: 'correct' | 'partial' | 'incorrect';
    points: number;
    feedback?: string;
    answer?: string;
    explanation?: string;
  };
};

export const DEFAULT_RECAP_UI: RecapUIState = {
  tab: 'personnages',
  recapLoading: false,
  recapError: null,
  recapData: null,

  userAnswerDraft: '',
  submittedAnswer: '',
  frozenQuestion: null,

  challengeSubmitting: false,
  hasSubmittedChallenge: false,
  challengeResult: null,
};

