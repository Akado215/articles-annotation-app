import { Injectable, signal } from '@angular/core';
import { AnnotationDraft, AnnotationUpdate, Article, ArticleDraft, TextAnnotation } from '../models/article.models';

const STORAGE_KEY = 'articles-annotation-app-state';

@Injectable({
  providedIn: 'root'
})
export class ArticlesStorageService {
  private readonly articlesState = signal<Article[]>(this.loadArticles());

  readonly articles = this.articlesState.asReadonly();

  createArticle(draftOrTitle: ArticleDraft | string, content?: string): Article {
    const draft = typeof draftOrTitle === 'string' ? { title: draftOrTitle, content: content ?? '' } : draftOrTitle;
    const now = new Date().toISOString();
    const article: Article = {
      id: crypto.randomUUID(),
      title: draft.title.trim(),
      content: draft.content,
      annotations: [],
      createdAt: now,
      updatedAt: now
    };

    this.updateState((articles) => {
      const next = [article, ...articles];
      return next;
    });

    return article;
  }

  updateArticle(articleId: string, changes: ArticleDraft, options?: { resetAnnotations?: boolean }): void {
    this.updateState((articles) =>
      articles.map((article) => {
        if (article.id !== articleId) {
          return article;
        }

        return {
          ...article,
          title: changes.title.trim(),
          content: changes.content,
          annotations: options?.resetAnnotations ? [] : article.annotations,
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  deleteArticle(articleId: string): void {
    this.updateState((articles) => articles.filter((article) => article.id !== articleId));
  }

  addAnnotation(articleId: string, annotation: AnnotationDraft): void {
    this.updateState((articles) =>
      articles.map((article) => {
        if (article.id !== articleId) {
          return article;
        }

        const nextAnnotation: TextAnnotation = {
          ...annotation,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString()
        };

        return {
          ...article,
          annotations: [...article.annotations, nextAnnotation].sort((left, right) => left.start - right.start),
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  updateAnnotation(articleId: string, annotationId: string, changes: AnnotationUpdate): void {
    this.updateState((articles) =>
      articles.map((article) => {
        if (article.id !== articleId) {
          return article;
        }

        return {
          ...article,
          annotations: article.annotations.map((annotation) =>
            annotation.id === annotationId
              ? {
                  ...annotation,
                  color: changes.color,
                  note: changes.note
                }
              : annotation
          ),
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  removeAnnotation(articleId: string, annotationId: string): void {
    this.updateState((articles) =>
      articles.map((article) => {
        if (article.id !== articleId) {
          return article;
        }

        return {
          ...article,
          annotations: article.annotations.filter((annotation) => annotation.id !== annotationId),
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  private loadArticles(): Article[] {
    if (typeof localStorage === 'undefined') {
      return this.createSeedArticles();
    }

    const rawState = localStorage.getItem(STORAGE_KEY);

    if (!rawState) {
      const seed = this.createSeedArticles();
      this.persist(seed);
      return seed;
    }

    try {
      const parsed = JSON.parse(rawState) as Article[];
      return Array.isArray(parsed) ? parsed : this.createSeedArticles();
    } catch {
      const seed = this.createSeedArticles();
      this.persist(seed);
      return seed;
    }
  }

  private persist(articles: Article[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
  }

  private updateState(transform: (articles: Article[]) => Article[]): void {
    this.articlesState.update((articles) => {
      const next = transform(articles);
      this.persist(next);
      return next;
    });
  }

  private createSeedArticles(): Article[] {
    const now = new Date().toISOString();

    return [
      {
        id: 'seed-article',
        title: 'Демо-статья',
        content:
          'Это простая статья для проверки механики аннотаций. Выделите любой фрагмент текста в области просмотра, выберите цвет подчёркивания и добавьте примечание. После перезагрузки страницы статья и аннотации восстановятся из localStorage.',
        annotations: [],
        createdAt: now,
        updatedAt: now
      }
    ];
  }
}
