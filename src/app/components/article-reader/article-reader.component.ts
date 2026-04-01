import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AnnotationDraft, AnnotationUpdate, Article, TextAnnotation } from '../../models/article.models';
import { PaletteOption } from '../../constants/annotation-palette';
import { annotationCountLabel } from '../../utils/article-ui.utils';
import {
  TextSelectionSnapshot,
  getSelectionSnapshot,
  hasOverlappingAnnotation,
  renderAnnotatedContent
} from '../../utils/annotation-dom.utils';

const FALLBACK_ANNOTATION_COLOR = '#6366f1';

@Component({
  selector: 'app-article-reader',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './article-reader.component.html',
  styleUrl: './article-reader.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticleReaderComponent implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly articleViewerRef = viewChild<ElementRef<HTMLElement>>('articleViewer');
  private readonly viewReady = signal(false);
  private selectionSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private touchSelectionSessionTimer: ReturnType<typeof setTimeout> | null = null;
  private touchSelectionActive = false;

  readonly article = input<Article | null>(null);
  readonly palette = input.required<PaletteOption[]>();
  readonly editingAnnotation = input<TextAnnotation | null>(null);
  readonly feedback = input('');
  readonly feedbackFading = input(false);

  readonly createAnnotation = output<AnnotationDraft>();
  readonly updateAnnotation = output<{ annotationId: string; changes: AnnotationUpdate }>();
  readonly editAnnotation = output<string>();
  readonly removeAnnotation = output<string>();
  readonly editArticle = output<void>();
  readonly deleteArticle = output<void>();
  readonly cancelDraft = output<void>();

  protected readonly pendingSelection = signal<TextSelectionSnapshot | null>(null);
  protected readonly localMessage = signal('');
  protected readonly form = this.fb.nonNullable.group({
    color: [FALLBACK_ANNOTATION_COLOR, [Validators.required]],
    note: ['', [Validators.required, Validators.maxLength(500)]]
  });

  protected readonly noteControl = this.form.controls.note;
  protected readonly dialogMode = computed<'create' | 'edit' | null>(() => {
    if (this.editingAnnotation()) {
      return 'edit';
    }

    if (this.pendingSelection()) {
      return 'create';
    }

    return null;
  });
  protected readonly activeQuote = computed(
    () => this.editingAnnotation()?.quote ?? this.pendingSelection()?.quote ?? ''
  );
  protected readonly viewerMessage = computed(() =>
    this.dialogMode() ? this.feedback() : this.localMessage() || this.feedback()
  );
  protected readonly dialogMessage = computed(() => (this.dialogMode() ? this.localMessage() : ''));
  protected readonly viewerFeedbackFading = computed(() => {
    if (!this.feedbackFading() || !this.feedback()) {
      return false;
    }

    if (this.dialogMode()) {
      return true;
    }

    return !this.localMessage();
  });
  protected readonly dialogEyebrow = computed(() =>
    this.dialogMode() === 'edit' ? 'Редактирование аннотации' : 'Новая аннотация'
  );
  protected readonly dialogTitle = computed(() =>
    this.dialogMode() === 'edit' ? 'Измените примечание' : 'Добавьте примечание к выделению'
  );
  protected readonly dialogActionLabel = computed(() =>
    this.dialogMode() === 'edit' ? 'Сохранить изменения' : 'Сохранить аннотацию'
  );
  protected readonly annotationCountLabel = annotationCountLabel;

  constructor() {
    effect(() => {
      const article = this.article();
      const activeAnnotationId = this.editingAnnotation()?.id ?? null;
      this.viewReady();

      queueMicrotask(() => {
        const viewer = this.articleViewerRef()?.nativeElement;

        if (!viewer) {
          return;
        }

        renderAnnotatedContent(viewer, article?.content ?? '', article?.annotations ?? [], activeAnnotationId);
      });
    });

    effect(() => {
      this.article();
      this.pendingSelection.set(null);
      this.localMessage.set('');
      this.clearBrowserSelection();
    });

    effect(() => {
      const editingAnnotation = this.editingAnnotation();
      const palette = this.palette();

      if (editingAnnotation) {
        this.pendingSelection.set(null);
        this.form.reset(
          {
            color: editingAnnotation.color,
            note: editingAnnotation.note
          },
          { emitEvent: false }
        );
        this.localMessage.set('Редактируйте текст примечания и цвет. Позиция выделения останется прежней.');
        this.clearBrowserSelection();
        return;
      }

      if (this.pendingSelection()) {
        this.form.reset(
          {
            color: this.form.controls.color.value || palette[0]?.value || FALLBACK_ANNOTATION_COLOR,
            note: ''
          },
          { emitEvent: false }
        );
        return;
      }

      this.form.reset(
        {
          color: palette[0]?.value || FALLBACK_ANNOTATION_COLOR,
          note: ''
        },
        { emitEvent: false }
      );
    });

    this.destroyRef.onDestroy(() => {
      this.clearSelectionSyncTimer();
      this.clearTouchSelectionSession();
    });
  }

  ngAfterViewInit(): void {
    this.viewReady.set(true);
  }

  protected handleViewerSelection(): void {
    this.scheduleSelectionSync();
  }

  protected handleViewerTouchStart(): void {
    this.startTouchSelectionSession();
  }

  protected handleViewerTouchEnd(): void {
    this.startTouchSelectionSession();
    this.scheduleSelectionSync(160);
  }

  @HostListener('document:selectionchange')
  protected handleDocumentSelectionChange(): void {
    if (!this.touchSelectionActive) {
      return;
    }

    this.scheduleSelectionSync(160);
  }

  private syncViewerSelection(): void {
    if (this.editingAnnotation()) {
      return;
    }

    const viewer = this.articleViewerRef()?.nativeElement;
    const article = this.article();

    if (!viewer || !article) {
      return;
    }

    const selectionSnapshot = getSelectionSnapshot(viewer, window.getSelection());

    if (!selectionSnapshot) {
      if (!this.pendingSelection()) {
        this.pendingSelection.set(null);
      }

      return;
    }

    if (hasOverlappingAnnotation(article.annotations, selectionSnapshot.start, selectionSnapshot.end)) {
      this.pendingSelection.set(null);
      this.localMessage.set('Пересекающиеся аннотации не поддерживаются. Выберите свободный участок текста.');
      this.clearBrowserSelection();
      this.clearTouchSelectionSession();
      return;
    }

    this.pendingSelection.set(selectionSnapshot);
    this.localMessage.set('');
    this.clearTouchSelectionSession();
  }

  protected handleViewerClick(event: MouseEvent): void {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const marker = target.closest('.article-annotation');

    if (!(marker instanceof HTMLElement)) {
      return;
    }

    const annotationId = marker.getAttribute('data-annotation-id');

    if (annotationId) {
      this.editAnnotation.emit(annotationId);
    }
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { color, note } = this.form.getRawValue();
    const normalizedNote = note.trim();

    if (!normalizedNote) {
      this.localMessage.set('Добавьте текст примечания перед сохранением.');
      return;
    }

    const editingAnnotation = this.editingAnnotation();

    if (editingAnnotation) {
      this.updateAnnotation.emit({
        annotationId: editingAnnotation.id,
        changes: {
          color,
          note: normalizedNote
        }
      });
      this.localMessage.set('');
      return;
    }

    const selection = this.pendingSelection();

    if (!selection) {
      return;
    }

    this.createAnnotation.emit({
      start: selection.start,
      end: selection.end,
      color,
      note: normalizedNote,
      quote: selection.quote
    });
    this.pendingSelection.set(null);
    this.localMessage.set('');
    this.clearBrowserSelection();
    this.form.reset(
      {
        color,
        note: ''
      },
      { emitEvent: false }
    );
  }

  protected cancel(): void {
    this.pendingSelection.set(null);
    this.localMessage.set('');
    this.clearBrowserSelection();
    this.form.reset(
      {
        color: this.palette()[0]?.value || FALLBACK_ANNOTATION_COLOR,
        note: ''
      },
      { emitEvent: false }
    );
    this.cancelDraft.emit();
  }

  protected removeCurrentAnnotation(): void {
    const editingAnnotation = this.editingAnnotation();

    if (!editingAnnotation) {
      return;
    }

    this.localMessage.set('');
    this.removeAnnotation.emit(editingAnnotation.id);
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (this.dialogMode()) {
      this.cancel();
    }
  }

  private clearBrowserSelection(): void {
    window.getSelection()?.removeAllRanges();
  }

  private scheduleSelectionSync(delay = 0): void {
    this.clearSelectionSyncTimer();
    this.selectionSyncTimer = setTimeout(() => {
      this.selectionSyncTimer = null;
      this.syncViewerSelection();
    }, delay);
  }

  private clearSelectionSyncTimer(): void {
    if (!this.selectionSyncTimer) {
      return;
    }

    clearTimeout(this.selectionSyncTimer);
    this.selectionSyncTimer = null;
  }

  private startTouchSelectionSession(): void {
    this.touchSelectionActive = true;

    if (this.touchSelectionSessionTimer) {
      clearTimeout(this.touchSelectionSessionTimer);
    }

    this.touchSelectionSessionTimer = setTimeout(() => {
      this.touchSelectionSessionTimer = null;
      this.touchSelectionActive = false;
    }, 1500);
  }

  private clearTouchSelectionSession(): void {
    if (this.touchSelectionSessionTimer) {
      clearTimeout(this.touchSelectionSessionTimer);
      this.touchSelectionSessionTimer = null;
    }

    this.touchSelectionActive = false;
  }
}
