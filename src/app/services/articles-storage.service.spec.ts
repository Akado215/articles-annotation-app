import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticlesStorageService } from './articles-storage.service';

const STORAGE_KEY = 'articles-annotation-app-state';

class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('ArticlesStorageService', () => {
  let uuidCounter = 0;

  beforeEach(() => {
    uuidCounter = 0;
    vi.stubGlobal('localStorage', new LocalStorageMock());
    vi.stubGlobal('crypto', {
      randomUUID: () => `00000000-0000-4000-8000-00000000000${++uuidCounter}`
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a seed article when storage is empty', () => {
    const service = new ArticlesStorageService();

    expect(service.articles()).toHaveLength(1);
    expect(service.articles()[0].title).toBe('Демо-статья');
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Демо-статья');
  });

  it('creates, updates and deletes articles while persisting state', () => {
    const service = new ArticlesStorageService();

    const article = service.createArticle({
      title: 'Новая статья',
      content: 'Текст для проверки'
    });

    expect(service.articles()[0].id).toBe(article.id);

    service.updateArticle(article.id, {
      title: 'Обновлённая статья',
      content: 'Обновлённый текст'
    });

    const updatedArticle = service.articles().find((item) => item.id === article.id);

    expect(updatedArticle).toMatchObject({
      title: 'Обновлённая статья',
      content: 'Обновлённый текст'
    });

    service.deleteArticle(article.id);

    expect(service.articles().some((item) => item.id === article.id)).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });

  it('supports annotation create, update and reset flows', () => {
    const service = new ArticlesStorageService();
    const article = service.createArticle({
      title: 'Статья с аннотациями',
      content: 'Alpha Beta Gamma'
    });

    service.addAnnotation(article.id, {
      start: 0,
      end: 5,
      color: '#ef4444',
      note: 'Важное начало',
      quote: 'Alpha'
    });

    const createdAnnotation = service.articles().find((item) => item.id === article.id)?.annotations[0];

    expect(createdAnnotation).toMatchObject({
      quote: 'Alpha',
      color: '#ef4444',
      note: 'Важное начало'
    });

    service.updateAnnotation(article.id, createdAnnotation!.id, {
      color: '#10b981',
      note: 'Обновлённое примечание'
    });

    const updatedAnnotation = service.articles().find((item) => item.id === article.id)?.annotations[0];

    expect(updatedAnnotation).toMatchObject({
      color: '#10b981',
      note: 'Обновлённое примечание'
    });

    service.updateArticle(
      article.id,
      {
        title: 'Статья с аннотациями',
        content: 'Новый текст статьи'
      },
      { resetAnnotations: true }
    );

    expect(service.articles().find((item) => item.id === article.id)?.annotations).toHaveLength(0);
  });
});
