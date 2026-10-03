import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  dominantScript,
  isCitationMarker,
  isLibraryHref,
  parseSourceEntry,
  stripLeadingText
} from 'components/bayyanMarkdown';
import { MessageContent } from 'components/chat/Messages/Message/Content';

const LIB = '/public/library.html?title=x&book_id=663&page=21';

describe('parseSourceEntry', () => {
  it('splits marker, title, author and reference', () => {
    expect(
      parseSourceEntry(
        'S4 - منهاج السنة النبوية - ابن تيمية (vol. 3, p. 78-81)'
      )
    ).toEqual({
      markers: 'S4',
      title: 'منهاج السنة النبوية',
      author: 'ابن تيمية',
      reference: 'vol. 3, p. 78-81'
    });
  });

  it('drops internal category tokens and keeps fatwa references', () => {
    expect(
      parseSourceEntry(
        'S2 - فتاوى الشيخ ربيع بن هادي المدخلي - AQIDA - الشيخ ربيع بن هادي المدخلي (Fatwa n°8018)'
      )
    ).toEqual({
      markers: 'S2',
      title: 'فتاوى الشيخ ربيع بن هادي المدخلي',
      author: 'الشيخ ربيع بن هادي المدخلي',
      reference: 'Fatwa n°8018'
    });
  });

  it('handles grouped markers and an empty author', () => {
    expect(parseSourceEntry('S1/S3 - القرآن الكريم -  (Coran 2:255)')).toEqual({
      markers: 'S1/S3',
      title: 'القرآن الكريم',
      author: '',
      reference: 'Coran 2:255'
    });
  });

  it('rejects plain markers and prose', () => {
    expect(parseSourceEntry('S1')).toBeNull();
    expect(parseSourceEntry('Voir la source')).toBeNull();
  });
});

describe('helpers', () => {
  it('recognises library links and markers', () => {
    expect(isLibraryHref(LIB)).toBe(true);
    expect(isLibraryHref('https://ketabonline.com/ar/books/663')).toBe(false);
    expect(isCitationMarker('S12')).toBe(true);
    expect(isCitationMarker('S1 - titre')).toBe(false);
  });

  it('detects the dominant script', () => {
    expect(dominantScript('« وطريقتهم: أنهم أثبتوا لله الأسماء »')).toBe('ar');
    expect(dominantScript('La prière (الصلاة) est obligatoire')).toBe('latin');
  });
});

describe('answer rendering hooks', () => {
  const answer = [
    "Les Ash'arites affirment sept attributs [S1](" + LIB + ').',
    '',
    '> « وطريقتهم: أنهم أثبتوا لله الأسماء »',
    '>',
    '> *Traduction : « Leur méthode consiste à affirmer les Noms »*',
    '',
    '﴿ ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ﴾',
    '',
    '⚠️ Source demandée non retrouvée : Tafsir.',
    '',
    '---',
    '',
    '## 📚 Bibliographie',
    '',
    '- [S1 - تقريب التدمرية - محمد بن صالح العثيمين (p. 21)](' + LIB + ')',
    '',
    '<details class="search-details">',
    '<summary>🔍 Voir les détails de la recherche</summary>',
    '<div class="details-content"><p class="details-note">Note</p></div>',
    '</details>'
  ].join('\n');

  const renderAnswer = () =>
    render(
      <MessageContent
        message={{
          threadId: 't',
          type: 'assistant_message',
          output: answer,
          id: 'bayyan-answer',
          name: 'BAYYAN',
          createdAt: 0
        }}
        elements={[]}
        allowHtml
      />
    );

  it('marks inline citations and structures bibliography entries', () => {
    const { container } = renderAnswer();
    const cite = container.querySelector('a.bayyan-cite');
    expect(cite?.textContent).toBe('S1');
    expect(cite?.getAttribute('href')).toContain('/public/library.html');

    const entry = container.querySelector('a.bayyan-source-entry');
    expect(entry?.getAttribute('data-cite')).toBe('S1');
    expect(
      entry?.querySelector('.bayyan-source-entry__title')?.textContent
    ).toBe('تقريب التدمرية');
    expect(entry?.querySelector('.bayyan-source-entry__ref')?.textContent).toBe(
      'p. 21'
    );
    expect(container.querySelector('ul.bayyan-source-list')).not.toBeNull();
    expect(container.querySelector('li.bayyan-source-item')).not.toBeNull();
  });

  it('removes decorative emoji and tags notices, verses and quotes', () => {
    const { container } = renderAnswer();
    const heading = container.querySelector('h2.bayyan-bibliography-heading');
    expect(heading?.textContent).toBe('Bibliographie');

    const summary = container.querySelector('summary.bayyan-details-summary');
    expect(summary?.textContent).toBe('Voir les détails de la recherche');

    const notice = container.querySelector('[data-notice="warning"]');
    expect(notice?.textContent?.startsWith('Source demandée')).toBe(true);

    expect(container.querySelector('.bayyan-ayah')?.getAttribute('dir')).toBe(
      'rtl'
    );
    expect(
      container.querySelector('blockquote.bayyan-quote--evidence')
    ).not.toBeNull();
    expect(container.querySelector('.bayyan-translation')).not.toBeNull();
    expect(container.querySelector('.details-note')).not.toBeNull();
  });
});

describe('heading numerals', () => {
  it('isolates the leading number of a section heading', () => {
    const { container } = render(
      <MessageContent
        message={{
          threadId: 't',
          type: 'assistant_message',
          output: '### 1. Origine et fondateur',
          id: 'heading',
          name: 'BAYYAN',
          createdAt: 0
        }}
        elements={[]}
      />
    );
    const heading = container.querySelector('h3');
    expect(heading?.querySelector('.bayyan-heading-num')?.textContent).toBe(
      '1.'
    );
    expect(heading?.textContent).toBe('1. Origine et fondateur');
  });
});

describe('bibliography headings in every locale', () => {
  const headingOf = (output: string) =>
    render(
      <MessageContent
        message={{
          threadId: 't',
          type: 'assistant_message',
          output,
          id: 'biblio-heading',
          name: 'BAYYAN',
          createdAt: 0
        }}
        elements={[]}
      />
    ).container.querySelector('h2');

  it.each([
    ['## 📚 قائمة المراجع', 'قائمة المراجع'],
    ['## 📚 المصادر', 'المصادر'],
    ['## 📚 Fuentes', 'Fuentes'],
    ['## 📚 Bibliografía', 'Bibliografía'],
    ['## 📚 Sources', 'Sources']
  ])('marks %s as the bibliography cartouche', (output, text) => {
    const heading = headingOf(output);
    expect(heading?.classList.contains('bayyan-bibliography-heading')).toBe(
      true
    );
    expect(heading?.textContent).toBe(text);
  });

  it('leaves ordinary Arabic and Latin headings alone', () => {
    expect(
      headingOf('## المصادرة على المطلوب')?.classList.contains(
        'bayyan-bibliography-heading'
      )
    ).toBe(false);
    expect(
      headingOf('## Bibliographies anciennes')?.classList.contains(
        'bayyan-bibliography-heading'
      )
    ).toBe(false);
  });
});

describe('attributions and follow-ups', () => {
  const renderOutput = (output: string, type = 'assistant_message') =>
    render(
      <MessageContent
        message={{
          threadId: 't',
          type: type as 'assistant_message',
          output,
          id: 'attribution',
          name: 'BAYYAN',
          createdAt: 0
        }}
        elements={[]}
      />
    );

  it('drops internal pole tags from attribution lines', () => {
    const { container } = renderOutput(
      [
        '> « لا يجوز إقامة عيد ميلاد »',
        '>',
        '> *Traduction : « Il n’est pas permis »*',
        '> — [FATAWA] مجموع فتاوى ابن باز - ابن باز, vol. 4, p. 286 [S1](' +
          LIB +
          ')',
        '',
        '> « نص آخر »',
        '>',
        '> — [AQIDA] تقريب التدمرية - العثيمين [S2](' + LIB + ')',
        '',
        'Le terme [AQIDA] reste intact hors attribution.'
      ].join('\n')
    );
    const text = container.textContent || '';
    expect(text).not.toContain('[FATAWA]');
    expect(text).not.toContain('[AQIDA] تقريب');
    expect(text).toContain('— مجموع فتاوى ابن باز');
    expect(text).toContain('— تقريب التدمرية');
    expect(text).toContain('Le terme [AQIDA] reste intact');
  });

  it('strips the decorative emoji of the follow-up title and labels', () => {
    const { container } = renderOutput(
      '\n---\n\n**🔍 Questions suggérées pour approfondir**',
      'system_message'
    );
    const title = [...container.querySelectorAll('[role="article"]')].pop();
    expect(title?.textContent).toBe('Questions suggérées pour approfondir');
    expect(stripLeadingText('💡 Quelle est la règle ?')).toBe(
      'Quelle est la règle ?'
    );
    expect(stripLeadingText('Quelle est la règle ?')).toBe(
      'Quelle est la règle ?'
    );
  });
});
