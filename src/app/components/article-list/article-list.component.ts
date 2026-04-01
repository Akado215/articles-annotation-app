import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Article } from '../../models/article.models';
import { annotationCountLabel, formatDate } from '../../utils/article-ui.utils';

@Component({
  selector: 'app-article-list',
  imports: [CommonModule],
  templateUrl: './article-list.component.html',
  styleUrl: './article-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticleListComponent {
  readonly articles = input.required<Article[]>();
  readonly selectedArticleId = input<string | null>(null);
  readonly creating = input(false);

  readonly createArticle = output<void>();
  readonly selectArticle = output<string>();

  protected readonly annotationCountLabel = annotationCountLabel;
  protected readonly formatDate = formatDate;

  protected trackByArticleId(_: number, article: Article): string {
    return article.id;
  }
}
