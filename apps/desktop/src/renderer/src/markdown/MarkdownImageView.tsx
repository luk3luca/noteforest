import { Image } from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { ImageOff } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { MarkdownImageResolution } from '../../../shared/api';
import { classifyMarkdownImageSource } from '../../../shared/markdown';
import { MarkdownImage } from './flat-schema';

/**
 * The Markdown file path is editor chrome, not node data: the canonical flat
 * document keeps the original relative `src`, and each mounted editor provides
 * its file path so images resolve through the confined file protocol.
 */
export const MarkdownFilePathContext = createContext<string | null>(null);

function stringAttr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function MarkdownImageNodeView({ node }: NodeViewProps): JSX.Element {
  const filePath = useContext(MarkdownFilePathContext);
  const src = stringAttr(node.attrs['src']);
  const alt = stringAttr(node.attrs['alt']);
  const title = stringAttr(node.attrs['title']);
  const classification = useMemo(() => classifyMarkdownImageSource(src), [src]);
  const [resolution, setResolution] = useState<MarkdownImageResolution | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (filePath === null || classification.kind !== 'local') {
      setResolution(null);
      return undefined;
    }
    let cancelled = false;
    setResolution(null);
    void window.noteforest
      .resolveMarkdownImage(filePath, src)
      .then((result) => {
        if (!cancelled) setResolution(result);
      })
      .catch(() => {
        if (!cancelled) setResolution({ ok: false, reason: 'Image file not found.' });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, src, classification.kind]);

  const reason =
    failed
      ? 'Image file is missing.'
      : classification.kind !== 'local'
        ? classification.reason
        : resolution === null
          ? null
          : resolution.ok
            ? null
            : resolution.reason ?? 'Image file not found.';

  if (reason !== null) {
    return (
      <NodeViewWrapper
        as="span"
        className="nf-markdown-image"
        data-markdown-image="true"
        data-image-src={src}
        data-image-state="placeholder"
        contentEditable={false}
      >
        <span className="nf-image-missing nf-markdown-image-placeholder" role="img" aria-label={`${reason} ${alt}`}>
          <ImageOff size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="nf-image-missing-title">{reason}</span>
          <span className="nf-image-missing-name">{alt.length > 0 ? alt : src}</span>
        </span>
      </NodeViewWrapper>
    );
  }

  if (resolution === null) {
    return (
      <NodeViewWrapper
        as="span"
        className="nf-markdown-image"
        data-markdown-image="true"
        data-image-src={src}
        data-image-state="loading"
        contentEditable={false}
      >
        <span className="nf-markdown-image-loading">{alt.length > 0 ? alt : 'Image'}</span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      className="nf-markdown-image"
      data-markdown-image="true"
      data-image-src={src}
      data-image-state="ready"
      contentEditable={false}
    >
      <img
        className="nf-markdown-image-el"
        src={resolution.url}
        alt={alt}
        {...(title.length > 0 ? { title } : {})}
        draggable={false}
        onError={() => setFailed(true)}
      />
    </NodeViewWrapper>
  );
}

/** Renderer image node: same node name/attrs, confined-file node view. */
export const MarkdownImageView = MarkdownImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MarkdownImageNodeView);
  },
  /**
   * The guest-file HTML serialization is not a network surface: an image is
   * represented as a labelled placeholder with its original source in a data
   * attribute. The node view owns the real (confined) `noteforest-md:` image;
   * a raw `src` here would make any HTML serialization fetch a remote URL.
   */
  renderHTML({ node }) {
    const src = stringAttr(node.attrs['src']);
    const alt = stringAttr(node.attrs['alt']);
    return [
      'span',
      {
        'data-markdown-image': 'true',
        'data-src': src,
        'data-alt': alt,
        class: 'nf-markdown-image-raw',
      },
      alt.length > 0 ? alt : src,
    ];
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-markdown-image]',
        getAttrs: (element) => ({
          src: (element as HTMLElement).getAttribute('data-src') ?? '',
          alt: (element as HTMLElement).getAttribute('data-alt') ?? '',
        }),
      },
      ...(this.parent?.() ?? []),
    ];
  },
}).configure({ allowBase64: false, inline: true });
