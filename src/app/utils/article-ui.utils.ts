import { Article } from '../models/article.models';

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

export function formatDate(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function annotationCountLabel(articleOrCount: Article | number | null | undefined): string {
  const count = typeof articleOrCount === 'number' ? articleOrCount : articleOrCount?.annotations.length ?? 0;
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} аннотация`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} аннотации`;
  }

  return `${count} аннотаций`;
}
