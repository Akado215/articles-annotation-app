import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Article, ArticleDraft } from '../../models/article.models';
import { annotationCountLabel } from '../../utils/article-ui.utils';

@Component({
  selector: 'app-article-editor',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './article-editor.component.html',
  styleUrl: './article-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticleEditorComponent {
  private readonly fb = inject(FormBuilder);

  readonly article = input<Article | null>(null);
  readonly creating = input(false);
  readonly annotationCount = input(0);
  readonly feedback = input('');
  readonly feedbackFading = input(false);

  readonly saveArticle = output<ArticleDraft>();
  readonly cancelEditor = output<void>();

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    content: ['', [Validators.required]]
  });

  protected readonly titleControl = this.form.controls.title;
  protected readonly contentControl = this.form.controls.content;
  protected readonly hasEditableArticle = computed(() => this.creating() || !!this.article());
  protected readonly annotationCountLabel = annotationCountLabel;

  constructor() {
    effect(() => {
      const article = this.article();
      const canEdit = this.creating() || !!article;

      if (canEdit) {
        this.form.enable({ emitEvent: false });
      } else {
        this.form.disable({ emitEvent: false });
      }

      this.form.reset(
        {
          title: article?.title ?? '',
          content: article?.content ?? ''
        },
        { emitEvent: false }
      );
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saveArticle.emit(this.form.getRawValue());
  }
}
