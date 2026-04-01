export interface TextAnnotation {
  id: string;
  start: number;
  end: number;
  color: string;
  note: string;
  quote: string;
  createdAt: string;
}

export interface Article {
  id: string;
  title: string;
  content: string;
  annotations: TextAnnotation[];
  createdAt: string;
  updatedAt: string;
}

export interface ArticleDraft {
  title: string;
  content: string;
}

export interface AnnotationDraft {
  start: number;
  end: number;
  color: string;
  note: string;
  quote: string;
}

export interface AnnotationUpdate {
  color: string;
  note: string;
}
