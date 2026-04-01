import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnnotationDraft, AnnotationUpdate, ArticleDraft } from './models/article.models';
import { ArticlesStorageService } from './services/articles-storage.service';
import { ANNOTATION_PALETTE } from './constants/annotation-palette';
import { ArticleEditorComponent } from './components/article-editor/article-editor.component';
import { ArticleListComponent } from './components/article-list/article-list.component';
import { ArticleReaderComponent } from './components/article-reader/article-reader.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, ArticleListComponent, ArticleEditorComponent, ArticleReaderComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly storage = inject(ArticlesStorageService);
  private readonly destroyRef = inject(DestroyRef);
  private feedbackFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private feedbackClearTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly palette = ANNOTATION_PALETTE;
  protected readonly articles = this.storage.articles;
  protected readonly selectedArticleId = signal<string | null>(this.articles()[0]?.id ?? null);
  protected readonly isCreating = signal(false);
  protected readonly isEditingArticle = signal(false);
  protected readonly feedback = signal('');
  protected readonly feedbackFading = signal(false);
  protected readonly editingAnnotationId = signal<string | null>(null);
  protected readonly isEditorMode = computed(() => this.isCreating() || this.isEditingArticle());

  protected readonly selectedArticle = computed(
    () => this.articles().find((article) => article.id === this.selectedArticleId()) ?? null
  );
  protected readonly editingAnnotation = computed(
    () =>
      this.selectedArticle()?.annotations.find((annotation) => annotation.id === this.editingAnnotationId()) ?? null
  );

  constructor() {
    effect(() => {
      const creating = this.isCreating();
      const articles = this.articles();
      const selectedArticle = this.selectedArticle();
      const editingAnnotationId = this.editingAnnotationId();

      if (!selectedArticle && !creating && articles.length > 0) {
        this.selectedArticleId.set(articles[0].id);
        return;
      }

      if (!selectedArticle) {
        this.editingAnnotationId.set(null);
        return;
      }

      if (editingAnnotationId && !selectedArticle.annotations.some((annotation) => annotation.id === editingAnnotationId)) {
        this.editingAnnotationId.set(null);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.clearFeedbackTimers();
    });
  }

  protected selectArticle(articleId: string): void {
    this.isCreating.set(false);
    this.isEditingArticle.set(false);
    this.selectedArticleId.set(articleId);
    this.editingAnnotationId.set(null);
    this.clearFeedback();
  }

  protected startArticleCreation(): void {
    this.isCreating.set(true);
    this.isEditingArticle.set(false);
    this.selectedArticleId.set(null);
    this.editingAnnotationId.set(null);
    this.clearFeedback();
  }

  protected startArticleEditing(): void {
    if (!this.selectedArticle()) {
      return;
    }

    this.isCreating.set(false);
    this.isEditingArticle.set(true);
    this.editingAnnotationId.set(null);
    this.clearFeedback();
  }

  protected cancelArticleEditor(): void {
    const wasCreating = this.isCreating();

    this.isCreating.set(false);
    this.isEditingArticle.set(false);
    this.editingAnnotationId.set(null);

    if (wasCreating) {
      const fallbackArticle = this.articles()[0] ?? null;
      this.selectedArticleId.set(fallbackArticle?.id ?? null);
      this.showFeedback('Создание статьи отменено.');
      return;
    }

    this.showFeedback('Редактирование статьи отменено.');
  }

  protected saveArticle(draft: ArticleDraft): void {
    const normalizedDraft: ArticleDraft = {
      title: draft.title.trim(),
      content: draft.content.trim()
    };

    if (!normalizedDraft.title || !normalizedDraft.content) {
      this.showFeedback('Заполните заголовок и текст статьи перед сохранением.');
      return;
    }

    if (this.isCreating()) {
      const createdArticle = this.storage.createArticle(normalizedDraft);
      this.selectedArticleId.set(createdArticle.id);
      this.isCreating.set(false);
      this.isEditingArticle.set(false);
      this.showFeedback('Статья создана и сохранена в localStorage.');
      return;
    }

    const article = this.selectedArticle();

    if (!article) {
      return;
    }

    const contentChanged = article.content !== normalizedDraft.content;
    const hasAnnotations = article.annotations.length > 0;

    if (contentChanged && hasAnnotations && !this.confirmBrowserAction(
      'Текст статьи изменился. Существующие аннотации будут удалены, потому что их позиции могут стать неверными. Продолжить?'
    )) {
      this.showFeedback('Сохранение отменено, чтобы не потерять аннотации.');
      return;
    }

    this.storage.updateArticle(article.id, normalizedDraft, {
      resetAnnotations: contentChanged
    });

    this.isEditingArticle.set(false);

    if (contentChanged) {
      this.editingAnnotationId.set(null);
    }

    this.showFeedback(
      contentChanged
        ? hasAnnotations
          ? 'Статья обновлена. Очистка аннотаций выполнена после подтверждения.'
          : 'Текст статьи обновлён.'
        : 'Изменения статьи сохранены.'
    );
  }

  protected deleteCurrentArticle(): void {
    const article = this.selectedArticle();

    if (!article) {
      return;
    }

    if (!this.confirmBrowserAction(`Удалить статью "${article.title}" вместе со всеми аннотациями?`)) {
      return;
    }

    this.storage.deleteArticle(article.id);
    this.isCreating.set(false);
    this.isEditingArticle.set(false);
    this.editingAnnotationId.set(null);

    const nextArticle = this.articles()[0] ?? null;
    this.selectedArticleId.set(nextArticle?.id ?? null);
    this.showFeedback('Статья удалена.');
  }

  protected createAnnotation(draft: AnnotationDraft): void {
    const article = this.selectedArticle();

    if (!article) {
      return;
    }

    this.storage.addAnnotation(article.id, draft);
    this.showFeedback('Аннотация сохранена.');
  }

  protected updateAnnotation(payload: { annotationId: string; changes: AnnotationUpdate }): void {
    const article = this.selectedArticle();

    if (!article) {
      return;
    }

    this.storage.updateAnnotation(article.id, payload.annotationId, payload.changes);
    this.editingAnnotationId.set(null);
    this.showFeedback('Аннотация обновлена.');
  }

  protected requestAnnotationEdit(annotationId: string): void {
    this.editingAnnotationId.set(annotationId);
    this.clearFeedback();
  }

  protected clearAnnotationDraft(): void {
    this.editingAnnotationId.set(null);
    this.clearFeedback();
  }

  protected removeAnnotation(annotationId: string): void {
    const article = this.selectedArticle();

    if (!article) {
      return;
    }

    if (!this.confirmBrowserAction('Удалить выбранную аннотацию?')) {
      return;
    }

    this.storage.removeAnnotation(article.id, annotationId);

    if (this.editingAnnotationId() === annotationId) {
      this.editingAnnotationId.set(null);
    }

    this.showFeedback('Аннотация удалена.');
  }

  private confirmBrowserAction(message: string): boolean {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.confirm(message);
  }

  private showFeedback(message: string): void {
    this.clearFeedbackTimers();
    this.feedback.set(message);
    this.feedbackFading.set(false);

    this.feedbackFadeTimer = setTimeout(() => {
      this.feedbackFadeTimer = null;
      this.feedbackFading.set(true);

      this.feedbackClearTimer = setTimeout(() => {
        this.feedbackClearTimer = null;
        this.feedback.set('');
        this.feedbackFading.set(false);
      }, 2000);
    }, 10000);
  }

  private clearFeedback(): void {
    this.clearFeedbackTimers();
    this.feedback.set('');
    this.feedbackFading.set(false);
  }

  private clearFeedbackTimers(): void {
    if (this.feedbackFadeTimer) {
      clearTimeout(this.feedbackFadeTimer);
      this.feedbackFadeTimer = null;
    }

    if (this.feedbackClearTimer) {
      clearTimeout(this.feedbackClearTimer);
      this.feedbackClearTimer = null;
    }
  }
}
