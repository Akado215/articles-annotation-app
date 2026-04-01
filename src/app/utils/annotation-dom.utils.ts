import { TextAnnotation } from '../models/article.models';

export interface TextSelectionSnapshot {
  start: number;
  end: number;
  quote: string;
}

export function renderAnnotatedContent(
  container: HTMLElement,
  content: string,
  annotations: TextAnnotation[],
  activeAnnotationId: string | null = null
): void {
  container.textContent = content;

  if (!annotations.length) {
    return;
  }

  const sortedAnnotations = [...annotations].sort((left, right) => right.start - left.start);

  for (const annotation of sortedAnnotations) {
    wrapRange(container, annotation, activeAnnotationId);
  }
}

export function getSelectionSnapshot(
  container: HTMLElement,
  selection: Selection | null
): TextSelectionSnapshot | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }

  const start = resolveOffset(container, range.startContainer, range.startOffset);
  const end = resolveOffset(container, range.endContainer, range.endOffset);
  const quote = selection.toString().replace(/\s+/g, ' ').trim();

  if (start === end || !quote) {
    return null;
  }

  return { start, end, quote };
}

export function hasOverlappingAnnotation(
  annotations: TextAnnotation[],
  start: number,
  end: number,
  ignoredAnnotationId?: string
): boolean {
  return annotations.some(
    (annotation) => annotation.id !== ignoredAnnotationId && start < annotation.end && end > annotation.start
  );
}

function wrapRange(container: HTMLElement, annotation: TextAnnotation, activeAnnotationId: string | null): void {
  const startPosition = locateTextPosition(container, annotation.start);
  const endPosition = locateTextPosition(container, annotation.end);

  if (!startPosition || !endPosition) {
    return;
  }

  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);

  const fragment = range.extractContents();
  const marker = document.createElement('mark');
  marker.className =
    annotation.id === activeAnnotationId ? 'article-annotation article-annotation--active' : 'article-annotation';
  marker.style.setProperty('--annotation-color', annotation.color);
  marker.setAttribute('data-note', annotation.note);
  marker.setAttribute('data-color', annotation.color);
  marker.setAttribute('data-annotation-id', annotation.id);
  marker.appendChild(fragment);

  range.insertNode(marker);
}

function locateTextPosition(container: HTMLElement, targetOffset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let accumulated = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const nextLength = accumulated + node.data.length;

    if (targetOffset <= nextLength) {
      return {
        node,
        offset: targetOffset - accumulated
      };
    }

    accumulated = nextLength;
  }

  return null;
}

function resolveOffset(container: HTMLElement, targetNode: Node, targetOffset: number): number {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(targetNode, targetOffset);
  return range.toString().length;
}
