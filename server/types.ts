export type ProgressState = "todo" | "learning" | "revised";

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
  progress: ProgressState;
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
  summary: string;
  intuition: string;
  notes: string[];
  videoSummary: string;
  cppCode: string;
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
  revised: number;
  learning: number;
  todo: number;
  percentage: number;
}
