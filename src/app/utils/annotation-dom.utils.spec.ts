import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextAnnotation } from '../models/article.models';
import { getSelectionSnapshot, hasOverlappingAnnotation, renderAnnotatedContent } from './annotation-dom.utils';

const TEXT_NODE = 3;

type FakeChild = FakeElement | FakeTextNode;

class FakeStyle {
  private readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }
}

class FakeTextNode {
  readonly nodeType = TEXT_NODE;
  parentNode: FakeElement | null = null;

  constructor(public data: string) {}

  get textContent(): string {
    return this.data;
  }
}

class FakeDocumentFragment {
  readonly children: FakeTextNode[] = [];

  appendChild(node: FakeTextNode): void {
    this.children.push(node);
  }
}

class FakeElement {
  readonly nodeType = 1;
  readonly children: FakeChild[] = [];
  readonly style = new FakeStyle();
  readonly tagName: string;
  readonly attributes = new Map<string, string>();
  parentNode: FakeElement | null = null;
  className = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(node: FakeTextNode | FakeDocumentFragment): void {
    if (node instanceof FakeDocumentFragment) {
      for (const child of node.children) {
        child.parentNode = this;
        this.children.push(child);
      }

      return;
    }

    node.parentNode = this;
    this.children.push(node);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  get firstChild(): FakeChild | null {
    return this.children[0] ?? null;
  }

  get lastChild(): FakeChild | null {
    return this.children[this.children.length - 1] ?? null;
  }

  get textContent(): string {
    return this.children.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.children.length = 0;

    if (!value) {
      return;
    }

    const textNode = new FakeTextNode(value);
    textNode.parentNode = this;
    this.children.push(textNode);
  }

  contains(target: unknown): boolean {
    return this === target || collectDescendants(this).includes(target as FakeChild);
  }

  querySelectorAll(selector: string): FakeElement[] {
    const tagName = selector.toUpperCase();
    return collectElements(this).filter((element) => element.tagName === tagName);
  }
}

class FakeTreeWalker {
  private readonly nodes: FakeTextNode[];
  private index = -1;
  currentNode: FakeTextNode | null = null;

  constructor(root: FakeElement) {
    this.nodes = collectTextNodes(root);
  }

  nextNode(): FakeTextNode | null {
    this.index += 1;
    this.currentNode = this.nodes[this.index] ?? null;
    return this.currentNode;
  }
}

class FakeRange {
  private container: FakeElement | null = null;
  private startNode: FakeTextNode | null = null;
  private startOffset = 0;
  private endNode: FakeTextNode | null = null;
  private endOffset = 0;
  private insertionParent: FakeElement | null = null;
  private insertionIndex = 0;

  selectNodeContents(container: FakeElement): void {
    this.container = container;
  }

  setStart(node: FakeTextNode, offset: number): void {
    this.startNode = node;
    this.startOffset = offset;
  }

  setEnd(node: FakeTextNode, offset: number): void {
    this.endNode = node;
    this.endOffset = offset;
  }

  toString(): string {
    if (!this.container || !this.endNode) {
      return '';
    }

    let content = '';

    for (const node of collectTextNodes(this.container)) {
      if (node === this.endNode) {
        content += node.data.slice(0, this.endOffset);
        break;
      }

      content += node.data;
    }

    return content;
  }

  extractContents(): FakeDocumentFragment {
    if (!this.startNode || !this.endNode || this.startNode !== this.endNode || !this.startNode.parentNode) {
      throw new Error('FakeRange supports only single-node extraction in tests.');
    }

    const parent = this.startNode.parentNode;
    const nodeIndex = parent.children.indexOf(this.startNode);
    const prefix = this.startNode.data.slice(0, this.startOffset);
    const selected = this.startNode.data.slice(this.startOffset, this.endOffset);
    const suffix = this.startNode.data.slice(this.endOffset);
    const replacement: FakeChild[] = [];

    if (prefix) {
      const prefixNode = new FakeTextNode(prefix);
      prefixNode.parentNode = parent;
      replacement.push(prefixNode);
    }

    if (suffix) {
      const suffixNode = new FakeTextNode(suffix);
      suffixNode.parentNode = parent;
      replacement.push(suffixNode);
    }

    parent.children.splice(nodeIndex, 1, ...replacement);

    this.insertionParent = parent;
    this.insertionIndex = nodeIndex + (prefix ? 1 : 0);

    const fragment = new FakeDocumentFragment();
    fragment.appendChild(new FakeTextNode(selected));
    return fragment;
  }

  insertNode(node: FakeElement): void {
    if (!this.insertionParent) {
      throw new Error('Missing insertion context.');
    }

    node.parentNode = this.insertionParent;
    this.insertionParent.children.splice(this.insertionIndex, 0, node);
  }
}

function collectTextNodes(root: FakeElement): FakeTextNode[] {
  const result: FakeTextNode[] = [];

  for (const child of root.children) {
    if (child instanceof FakeTextNode) {
      result.push(child);
      continue;
    }

    result.push(...collectTextNodes(child));
  }

  return result;
}

function collectElements(root: FakeElement): FakeElement[] {
  const result: FakeElement[] = [];

  for (const child of root.children) {
    if (child instanceof FakeElement) {
      result.push(child);
      result.push(...collectElements(child));
    }
  }

  return result;
}

function collectDescendants(root: FakeElement): FakeChild[] {
  const result: FakeChild[] = [];

  for (const child of root.children) {
    result.push(child);

    if (child instanceof FakeElement) {
      result.push(...collectDescendants(child));
    }
  }

  return result;
}

function createDocumentStub() {
  return {
    createRange: () => new FakeRange(),
    createElement: (tagName: string) => new FakeElement(tagName),
    createTreeWalker: (root: FakeElement) => new FakeTreeWalker(root)
  };
}

describe('annotation-dom.utils', () => {
  beforeEach(() => {
    vi.stubGlobal('document', createDocumentStub());
    vi.stubGlobal('Node', {
      TEXT_NODE
    });
    vi.stubGlobal('NodeFilter', {
      SHOW_TEXT: 4
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts selection offsets and quote from the viewer', () => {
    const container = new FakeElement('div');
    container.textContent = 'Alpha Beta Gamma';

    const textNode = container.firstChild as FakeTextNode;
    const range = {
      commonAncestorContainer: textNode,
      startContainer: textNode,
      startOffset: 6,
      endContainer: textNode,
      endOffset: 10
    };
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => range,
      toString: () => 'Beta'
    } as unknown as Selection;

    expect(getSelectionSnapshot(container as unknown as HTMLElement, selection)).toEqual({
      start: 6,
      end: 10,
      quote: 'Beta'
    });
  });

  it('renders annotations as mark elements with custom color and active state', () => {
    const container = new FakeElement('div');
    const annotations: TextAnnotation[] = [
      {
        id: 'annotation-1',
        start: 0,
        end: 5,
        color: '#ef4444',
        note: 'Первый фрагмент',
        quote: 'Alpha',
        createdAt: '2026-03-31T10:00:00.000Z'
      }
    ];

    renderAnnotatedContent(container as unknown as HTMLElement, 'Alpha Beta Gamma', annotations, 'annotation-1');

    const marks = container.querySelectorAll('mark');

    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('Alpha');
    expect(marks[0].getAttribute('data-note')).toBe('Первый фрагмент');
    expect(marks[0].getAttribute('data-annotation-id')).toBe('annotation-1');
    expect(marks[0].style.getPropertyValue('--annotation-color')).toBe('#ef4444');
    expect(marks[0].className.includes('article-annotation--active')).toBe(true);
  });

  it('detects annotation overlap while allowing the same annotation id to be ignored', () => {
    const annotations: TextAnnotation[] = [
      {
        id: 'annotation-1',
        start: 0,
        end: 5,
        color: '#ef4444',
        note: 'Первый фрагмент',
        quote: 'Alpha',
        createdAt: '2026-03-31T10:00:00.000Z'
      },
      {
        id: 'annotation-2',
        start: 10,
        end: 15,
        color: '#0ea5e9',
        note: 'Второй фрагмент',
        quote: 'Gamma',
        createdAt: '2026-03-31T10:05:00.000Z'
      }
    ];

    expect(hasOverlappingAnnotation(annotations, 3, 7)).toBe(true);
    expect(hasOverlappingAnnotation(annotations, 3, 7, 'annotation-1')).toBe(false);
    expect(hasOverlappingAnnotation(annotations, 5, 10)).toBe(false);
  });
});
