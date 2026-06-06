export type TopicTier = "very_easy" | "easy" | "medium" | "hard" | "tricky";
export type TierFilter = TopicTier | "unassigned";

export interface SheetProblem {
  id: string;
  name: string;
  article?: string;
  youtube?: string;
  leetcode?: string;
  plus?: string;
  editorial?: string;
  link?: string;
  difficulty?: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  done: boolean;
  tier?: TopicTier;
  mistakeNote: string;
}

export interface SheetSubcategory {
  id: string;
  name: string;
  problemCount: number;
}

export interface SheetSection {
  id: string;
  name: string;
  problemCount: number;
  subcategories: SheetSubcategory[];
}

export interface TopicResources {
  problemId: string;
  articleText: string;
  codeBlocks: string[];
  transcript: string;
  sources: {
    article?: string;
    youtube?: string;
    transcriptAvailable: boolean;
    articleAvailable: boolean;
  };
  fetchedAt: string;
}

export interface StudyBundle {
  problem: string;
  intuition: string;
  solution: string[];
  pythonCode: string;
  complexity: string;
  mistakes: string[];
  sourceNotes: string[];
}

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface ProgressSummary {
  total: number;
  done: number;
  remaining: number;
  percentage: number;
}

export interface RevisionItem {
  id: number;
  topicId: string;
  topicName: string;
  categoryName: string;
  subcategoryName: string;
  tier: TopicTier;
  stage: number;
  dueDateUtc: string;
  completedAtUtc?: string;
  createdAtUtc: string;
  mistakeNote: string;
}

export interface DailyGoal {
  id: number;
  dateUtc: string;
  topicId?: string;
  topicName?: string;
  title: string;
  completedAtUtc?: string;
  position: number;
  createdAtUtc: string;
}

export interface TodaySchedule {
  todayUtc: string;
  revisions: RevisionItem[];
  goals: DailyGoal[];
}
