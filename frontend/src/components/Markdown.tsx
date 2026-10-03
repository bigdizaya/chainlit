import { cn } from '@/lib/utils';
import { omit } from 'lodash';
import { useContext, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { PluggableList } from 'react-markdown/lib';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';

import { ChainlitContext, type IMessageElement } from '@chainlit/react-client';

import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

import BlinkingCursor from './BlinkingCursor';
import CodeSnippet from './CodeSnippet';
import { ElementRef } from './Elements/ElementRef';
import {
  type AlertProps,
  MarkdownAlert,
  alertComponents,
  normalizeAlertType
} from './MarkdownAlert';
import {
  dominantScript,
  hastText,
  isBibliographyTitle,
  isCitationMarker,
  isLibraryHref,
  isSourceListItem,
  isTranslationLead,
  noticeKind,
  parseSourceEntry,
  remarkAttributionCategory,
  splitHeadingNumber,
  stripLeadingEmoji,
  textOf
} from './bayyanMarkdown';

interface Props {
  allowHtml?: boolean;
  latex?: boolean;
  renderMarkdown?: boolean;
  refElements?: IMessageElement[];
  children: string;
  className?: string;
}

const cursorPlugin = () => {
  return (tree: any) => {
    visit(tree, 'text', (node: any, index, parent) => {
      const placeholderPattern = /\u200B/g;
      const matches = [...(node.value?.matchAll(placeholderPattern) || [])];

      if (matches.length > 0) {
        const newNodes: any[] = [];
        let lastIndex = 0;

        matches.forEach((match) => {
          const [fullMatch] = match;
          const startIndex = match.index!;
          const endIndex = startIndex + fullMatch.length;

          if (startIndex > lastIndex) {
            newNodes.push({
              type: 'text',
              value: node.value!.slice(lastIndex, startIndex)
            });
          }

          newNodes.push({
            type: 'blinkingCursor',
            data: {
              hName: 'blinkingCursor',
              hProperties: { text: 'Blinking Cursor' }
            }
          });

          lastIndex = endIndex;
        });

        if (lastIndex < node.value!.length) {
          newNodes.push({
            type: 'text',
            value: node.value!.slice(lastIndex)
          });
        }

        parent!.children.splice(index, 1, ...newNodes);
      }
    });
  };
};

const Markdown = ({
  allowHtml,
  latex,
  renderMarkdown,
  refElements,
  className,
  children
}: Props) => {
  const apiClient = useContext(ChainlitContext);

  if (renderMarkdown === false) {
    return (
      <pre
        className={cn('whitespace-pre-wrap break-words', className)}
        style={{ fontFamily: 'inherit' }}
      >
        {children}
      </pre>
    );
  }

  const rehypePlugins = useMemo(() => {
    let rehypePlugins: PluggableList = [];
    if (allowHtml) {
      rehypePlugins = [rehypeRaw as any, ...rehypePlugins];
    }
    if (latex) {
      rehypePlugins = [rehypeKatex as any, ...rehypePlugins];
    }
    return rehypePlugins;
  }, [allowHtml, latex]);

  const remarkPlugins = useMemo(() => {
    let remarkPlugins: PluggableList = [
      cursorPlugin,
      remarkGfm as any,
      remarkDirective as any,
      MarkdownAlert,
      remarkAttributionCategory
    ];

    if (latex) {
      remarkPlugins = [...remarkPlugins, remarkMath as any];
    }
    return remarkPlugins;
  }, [latex]);

  return (
    <ReactMarkdown
      className={cn('prose lg:prose-xl', className)}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={{
        ...alertComponents, // add alert components
        code(props) {
          return (
            <code
              {...omit(props, ['node'])}
              className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold"
            />
          );
        },
        pre({ children, ...props }: any) {
          return <CodeSnippet {...props} />;
        },
        a({ children, ...props }) {
          const name = children as string;
          const element = refElements?.find((e) => e.name === name);
          if (element) {
            return <ElementRef element={element} />;
          }
          const linkProps = omit(props, ['node']);
          if (isLibraryHref(props.href)) {
            const label = textOf(children).trim();
            if (isCitationMarker(label)) {
              return (
                <a
                  {...linkProps}
                  className="bayyan-cite"
                  data-cite={label.replace(/[[\]\s]/g, '')}
                  target="_blank"
                >
                  {children}
                </a>
              );
            }
            const entry = parseSourceEntry(label);
            if (entry) {
              return (
                <a
                  {...linkProps}
                  className="bayyan-source-entry"
                  data-cite={entry.markers}
                  target="_blank"
                >
                  <span className="bayyan-source-entry__marker">
                    {entry.markers.replace(/\//g, ' · ')}
                  </span>
                  <span className="bayyan-source-entry__body">
                    {entry.title ? (
                      <bdi
                        className="bayyan-source-entry__title"
                        dir="auto"
                        lang={
                          dominantScript(entry.title) === 'ar'
                            ? 'ar'
                            : undefined
                        }
                      >
                        {entry.title}
                      </bdi>
                    ) : null}
                    {entry.author ? (
                      <bdi
                        className="bayyan-source-entry__author"
                        dir="auto"
                        lang={
                          dominantScript(entry.author) === 'ar'
                            ? 'ar'
                            : undefined
                        }
                      >
                        {entry.author}
                      </bdi>
                    ) : null}
                    {entry.reference ? (
                      <span className="bayyan-source-entry__ref" dir="ltr">
                        {entry.reference}
                      </span>
                    ) : null}
                  </span>
                </a>
              );
            }
            return (
              <a {...linkProps} className="bayyan-library-ref" target="_blank">
                {children}
              </a>
            );
          }
          return (
            <a
              {...linkProps}
              className="text-primary hover:underline"
              target="_blank"
            >
              {children}
            </a>
          );
        },
        img: (image: any) => {
          // Check if the image source is actually a video file
          const src = image.src.startsWith('/public')
            ? apiClient.buildEndpoint(image.src)
            : image.src;

          const videoExtensions = [
            '.mp4',
            '.webm',
            '.mov',
            '.avi',
            '.ogv',
            '.m4v'
          ];
          const isVideo = videoExtensions.some((ext) =>
            src.toLowerCase().split(/[?#]/)[0].endsWith(ext)
          );

          if (isVideo) {
            return (
              <div className="sm:max-w-sm md:max-w-md">
                <video
                  src={src}
                  controls
                  className="w-full h-auto rounded-md"
                  style={{ maxWidth: '100%' }}
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            );
          }

          return (
            <div className="sm:max-w-sm md:max-w-md">
              <AspectRatio
                ratio={16 / 9}
                className="bg-muted rounded-md overflow-hidden"
              >
                <img
                  src={src}
                  alt={image.alt}
                  className="h-full w-full object-contain"
                />
              </AspectRatio>
            </div>
          );
        },
        blockquote(props) {
          const text = hastText(props.node);
          const evidence =
            dominantScript(text.split('\n')[0] || text) === 'ar' ||
            /[\u0600-\u06FF]/.test((text.match(/«[^»]*»/) || [''])[0]);
          return (
            <blockquote
              {...omit(props, ['node'])}
              className={cn(
                'mt-6 border-s-2 ps-6 italic bayyan-quote',
                evidence ? 'bayyan-quote--evidence' : 'bayyan-quote--note'
              )}
            />
          );
        },
        em(props) {
          const translation = isTranslationLead(hastText(props.node));
          return (
            <span
              {...omit(props, ['node'])}
              className={cn('italic', translation && 'bayyan-translation')}
            />
          );
        },
        strong(props) {
          return <span {...omit(props, ['node'])} className="font-bold" />;
        },
        hr() {
          return <Separator className="bayyan-rule" />;
        },
        ul(props) {
          const sources = (props.node?.children || []).some((child: any) =>
            isSourceListItem(child)
          );
          return (
            <ul
              {...omit(props, ['node'])}
              className={cn(
                'my-3 ms-3 list-disc ps-2 [&>li]:mt-1',
                sources && 'bayyan-source-list'
              )}
            />
          );
        },
        ol(props) {
          return (
            <ol
              {...omit(props, ['node'])}
              className="my-3 ms-3 list-decimal ps-2 [&>li]:mt-1"
            />
          );
        },
        li(props) {
          const source = isSourceListItem(props.node);
          return (
            <li
              {...omit(props, ['node'])}
              dir="auto"
              className={cn(props.className, source && 'bayyan-source-item')}
            />
          );
        },
        summary(props) {
          const { children } = stripLeadingEmoji(props.children);
          return (
            <summary
              {...omit(props, ['node', 'children'])}
              className={cn(props.className, 'bayyan-details-summary')}
            >
              {children}
            </summary>
          );
        },
        h1(props) {
          const { children, stripped } = stripLeadingEmoji(props.children);
          const bibliography =
            stripped && isBibliographyTitle(textOf(children));
          return (
            <h1
              {...omit(props, ['node', 'children'])}
              dir="auto"
              className={cn(
                'scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl mt-8 first:mt-0',
                bibliography && 'bayyan-bibliography-heading'
              )}
            >
              {splitHeadingNumber(children)}
            </h1>
          );
        },
        h2(props) {
          const { children } = stripLeadingEmoji(props.children);
          const bibliography = isBibliographyTitle(textOf(children));
          return (
            <h2
              {...omit(props, ['node', 'children'])}
              dir="auto"
              className={cn(
                'scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight mt-8 first:mt-0',
                bibliography && 'bayyan-bibliography-heading'
              )}
            >
              {splitHeadingNumber(children)}
            </h2>
          );
        },
        h3(props) {
          const { children, stripped } = stripLeadingEmoji(props.children);
          const bibliography =
            stripped && isBibliographyTitle(textOf(children));
          return (
            <h3
              {...omit(props, ['node', 'children'])}
              dir="auto"
              className={cn(
                'scroll-m-20 text-2xl font-semibold tracking-tight mt-6 first:mt-0',
                bibliography && 'bayyan-bibliography-heading'
              )}
            >
              {splitHeadingNumber(children)}
            </h3>
          );
        },
        h4(props) {
          const { children, stripped } = stripLeadingEmoji(props.children);
          const bibliography =
            stripped && isBibliographyTitle(textOf(children));
          return (
            <h4
              {...omit(props, ['node', 'children'])}
              dir="auto"
              className={cn(
                'scroll-m-20 text-xl font-semibold tracking-tight mt-6 first:mt-0',
                bibliography && 'bayyan-bibliography-heading'
              )}
            >
              {splitHeadingNumber(children)}
            </h4>
          );
        },
        p(props) {
          const text = hastText(props.node);
          const kind = noticeKind(text);
          const ayah = /^\s*\uFD3F/.test(text);
          const script = dominantScript(text);
          // decorative leading emoji (notices, the follow-up suggestions title)
          const { children } = stripLeadingEmoji(props.children);
          return (
            <div
              {...omit(props, ['node', 'children'])}
              className={cn(
                'leading-7 [&:not(:first-child)]:mt-4 whitespace-pre-wrap break-words',
                props.className,
                kind && 'bayyan-notice',
                ayah && 'bayyan-ayah'
              )}
              data-notice={kind}
              data-script={script === 'ar' ? 'ar' : undefined}
              lang={script === 'ar' ? 'ar' : undefined}
              dir={ayah ? 'rtl' : 'auto'}
              role="article"
            >
              {children}
            </div>
          );
        },
        table({ children, ...props }) {
          return (
            <Card className="[&:not(:first-child)]:mt-2 [&:not(:last-child)]:mb-2">
              <Table {...(props as any)}>{children}</Table>
            </Card>
          );
        },
        thead({ children, ...props }) {
          return <TableHeader {...(props as any)}>{children}</TableHeader>;
        },
        tr({ children, ...props }) {
          return <TableRow {...(props as any)}>{children}</TableRow>;
        },
        th({ children, ...props }) {
          return <TableHead {...(props as any)}>{children}</TableHead>;
        },
        td({ children, ...props }) {
          return <TableCell {...(props as any)}>{children}</TableCell>;
        },
        tbody({ children, ...props }) {
          return <TableBody {...(props as any)}>{children}</TableBody>;
        },
        // @ts-expect-error custom plugin
        blinkingCursor: () => <BlinkingCursor whitespace />,
        alert: ({
          type,
          children,
          ...props
        }: AlertProps & { type?: string }) => {
          const alertType = normalizeAlertType(type || props.variant || 'info');
          return alertComponents.Alert({ variant: alertType, children });
        }
      }}
    >
      {children}
    </ReactMarkdown>
  );
};

export { Markdown };
