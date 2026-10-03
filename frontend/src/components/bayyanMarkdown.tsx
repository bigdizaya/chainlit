import {
  Children,
  type ReactElement,
  type ReactNode,
  cloneElement,
  isValidElement
} from 'react';
import { visit } from 'unist-util-visit';

/*
 * BAYYAN answer semantics.
 *
 * Answers are persisted as one Markdown string and re-rendered on resume, so
 * these helpers derive stable CSS hooks from the text itself. They work for
 * new answers and for every stored answer, without any backend change.
 */

export const LIBRARY_PATH = '/public/library.html';

const MARKER_ONLY = /^\[?S\d+(?:\s*[/,·]\s*S?\d+)*\]?$/i;
const SOURCE_ENTRY = /^(S\d+(?:\s*\/\s*S?\d+)*)\s*[-–—]\s*([\s\S]+)$/;
const TRAILING_REFERENCE = /\s*\(([^()]*)\)\s*$/;
const CATEGORY_TOKEN = /^[A-Z][A-Z_]{2,}$/;
const ARABIC_LETTER =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/g;
const LATIN_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;
const LEADING_EMOJI =
  /^\s*(?:(?:\p{Extended_Pictographic}|[\u2600-\u27BF])(?:\uFE0F|\u200D(?:\p{Extended_Pictographic}|[\u2600-\u27BF]))*\uFE0F?\s*)+/u;
const LEADING_KEYCAP = /^\s*([0-9])\uFE0F?\u20E3\s*/;
const TRANSLATION_LEAD = /^\s*(Traduction|Translation|Traducción|ترجمة)/i;
// Server labels (APP src/source_verification.py: "bibliography" and "sources"
// per locale). The end check is Unicode-aware: \b only knows ASCII word
// characters, so it never matched after an Arabic word.
const BIBLIOGRAPHY_TITLE =
  /^[\s\u200E\u200F\u061C]*(Bibliographie|Bibliography|Bibliografía|قائمة المراجع|المراجع|المصادر|Sources|Fuentes|Références|Referencias)(?![\p{L}\p{M}\p{N}])/iu;

const NOTICE_KINDS: Array<[RegExp, string]> = [
  [/^\s*⚠/u, 'warning'],
  [/^\s*⏹/u, 'stopped'],
  [/^\s*❌/u, 'error'],
  [/^\s*⏳/u, 'wait'],
  [/^\s*⛔/u, 'quota'],
  [/^\s*ℹ/u, 'info'],
  [/^\s*💡/u, 'tip']
];

export interface SourceEntry {
  markers: string;
  title: string;
  author: string;
  reference: string;
}

export function isLibraryHref(href?: string | null): boolean {
  if (!href) return false;
  try {
    return new URL(href, 'https://bayyan.local').pathname === LIBRARY_PATH;
  } catch {
    return href.includes(LIBRARY_PATH);
  }
}

export function isCitationMarker(text: string): boolean {
  return MARKER_ONLY.test(text.trim());
}

/** Split "S1 - title - author (p. 21)" into its parts (null if not an entry). */
export function parseSourceEntry(text: string): SourceEntry | null {
  const match = text.replace(/\s+/g, ' ').trim().match(SOURCE_ENTRY);
  if (!match) return null;

  const markers = match[1].replace(/\s+/g, '');
  let rest = match[2].trim();
  let reference = '';
  const ref = rest.match(TRAILING_REFERENCE);
  if (ref && ref.index !== undefined) {
    reference = ref[1].trim();
    rest = rest.slice(0, ref.index);
  }
  rest = rest.replace(/^[\s\-–—]+|[\s\-–—]+$/g, '');

  const parts = rest
    .split(/\s+[-–—]\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !CATEGORY_TOKEN.test(part));

  let title = '';
  let author = '';
  if (parts.length === 1) {
    title = parts[0];
  } else if (parts.length > 1) {
    author = parts[parts.length - 1];
    title = parts.slice(0, -1).join(' - ');
  }
  if (!title && !reference) return null;
  return { markers, title, author, reference };
}

/** Plain text of a React subtree (strings and nested element children). */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean')
    return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) {
    return textOf(
      (node as ReactElement<{ children?: ReactNode }>).props.children
    );
  }
  return '';
}

/** Plain text of a hast node (react-markdown passes it as props.node). */
export function hastText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  return (node.children || []).map(hastText).join('');
}

/** "ar" when Arabic letters dominate the text, "latin" otherwise. */
export function dominantScript(text: string): 'ar' | 'latin' | 'none' {
  const arabic = (text.match(ARABIC_LETTER) || []).length;
  const latin = (text.match(LATIN_LETTER) || []).length;
  if (!arabic && !latin) return 'none';
  return arabic > latin ? 'ar' : 'latin';
}

export function noticeKind(text: string): string | undefined {
  return NOTICE_KINDS.find(([pattern]) => pattern.test(text))?.[1];
}

export function isTranslationLead(text: string): boolean {
  return TRANSLATION_LEAD.test(text);
}

export function isBibliographyTitle(text: string): boolean {
  return BIBLIOGRAPHY_TITLE.test(text);
}

/** Drop decorative emoji (and turn a keycap digit into "1.") at the start. */
export function stripLeadingText(value: string): string {
  return value.replace(LEADING_KEYCAP, '$1. ').replace(LEADING_EMOJI, '');
}

/* Internal pole tags the model copies from its context into attributions:
   "— [FATAWA] title - author, vol. 4" → "— title - author, vol. 4". */
const ATTRIBUTION_CATEGORY =
  /(^|\n)([^\S\n]*[—–-][^\S\n]*)\[[A-Z][A-Z_]{2,}\][^\S\n]*/g;

export function stripAttributionCategory(value: string): string {
  return value.replace(ATTRIBUTION_CATEGORY, '$1$2');
}

/** Remark plugin: removes the pole tags at the start of attribution lines. */
export function remarkAttributionCategory() {
  return (tree: any) => {
    visit(tree, 'text', (node: any) => {
      if (typeof node.value === 'string' && node.value.includes('[')) {
        node.value = stripAttributionCategory(node.value);
      }
    });
  };
}

/**
 * Remove decorative emoji (📚, 🔍, ⚠️, 1️⃣…) at the very start of a rendered
 * subtree. Only the first text run is touched; the rest is returned as-is.
 */
export function stripLeadingEmoji(children: ReactNode): {
  children: ReactNode;
  stripped: boolean;
} {
  const list = Children.toArray(children);
  if (!list.length) return { children, stripped: false };

  const [first, ...rest] = list;
  if (typeof first === 'string') {
    const next = stripLeadingText(first);
    if (next === first) return { children, stripped: false };
    return { children: next ? [next, ...rest] : rest, stripped: true };
  }
  if (isValidElement(first)) {
    const element = first as ReactElement<{ children?: ReactNode }>;
    const inner = stripLeadingEmoji(element.props.children);
    if (!inner.stripped) return { children, stripped: false };
    return {
      children: [cloneElement(element, undefined, inner.children), ...rest],
      stripped: true
    };
  }
  return { children, stripped: false };
}

/** True when a list item holds a single bibliography entry link. */
export function isSourceListItem(node: any): boolean {
  const elements = (node?.children || []).filter(
    (child: any) => child.type === 'element'
  );
  const loose = (node?.children || []).filter(
    (child: any) => child.type === 'text' && child.value.trim()
  );
  const target =
    elements.length === 1 && elements[0].tagName === 'p'
      ? (elements[0].children || []).filter((c: any) => c.type === 'element')
      : elements;
  if (loose.length || target.length !== 1 || target[0].tagName !== 'a') {
    return false;
  }
  return (
    isLibraryHref(target[0].properties?.href) &&
    parseSourceEntry(hastText(target[0])) !== null
  );
}

const HEADING_NUMBER = /^(\s*)(\d{1,2}[.)])\s+/;

/** Split a leading "1." of a heading into its own span (rubricated numeral). */
export function splitHeadingNumber(children: ReactNode): ReactNode {
  const list = Children.toArray(children);
  const [first, ...rest] = list;
  if (typeof first !== 'string') return children;
  const match = first.match(HEADING_NUMBER);
  if (!match) return children;
  return [
    <span key="bayyan-heading-num" className="bayyan-heading-num">
      {match[2]}
    </span>,
    ' ',
    first.slice(match[0].length),
    ...rest
  ];
}
