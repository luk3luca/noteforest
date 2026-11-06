import { ImageOff } from 'lucide-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useState } from 'react';
import { getEditorBindings } from '../bindings';
import { useRuntimeVersion } from '../useRuntimeVersion';

function stringAttr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dimensionAttr(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Canonical image node view.
 *
 * A present asset renders at the block width with its intrinsic aspect ratio.
 * A missing canonical asset record, a missing file (the `<img>` fires `error`),
 * or an image node without an `assetId` renders a labeled placeholder: content
 * and anchors are never deleted, and the editor never crashes on a 404.
 */
export function ImageNodeView({ node, editor }: NodeViewProps): JSX.Element {
  const assetId = stringAttr(node.attrs['assetId']);
  const alt = stringAttr(node.attrs['alt']);
  const src = stringAttr(node.attrs['src']);
  const width = dimensionAttr(node.attrs['width']);
  const height = dimensionAttr(node.attrs['height']);
  const bindings = getEditorBindings(editor);
  const runtime = bindings?.runtime ?? null;
  const version = useRuntimeVersion(runtime);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [assetId, src]);

  const record = useMemo(() => {
    if (assetId.length === 0 || runtime === null) return undefined;
    // `version` is the subscription dependency: an `asset.add` command or a
    // reload changes this view from missing to present without a node change.
    void version;
    return runtime.document.assets[assetId];
  }, [assetId, runtime, version]);

  const missing =
    failed ||
    node.attrs['missing'] === true ||
    (assetId.length === 0 && src.length === 0) ||
    (assetId.length > 0 && runtime !== null && record === undefined);
  const label =
    alt.length > 0
      ? alt
      : assetId.length > 0
        ? `asset ${assetId.slice(0, 8)}…`
        : 'no asset';
  const reason = failed
    ? 'Image file is missing'
    : assetId.length === 0
      ? 'Image has no asset'
      : 'Image not found';

  if (missing) {
    return (
      <NodeViewWrapper
        className="nf-image-node nf-image-node-missing"
        data-image-node={assetId || 'no-asset'}
        data-image-asset={assetId || undefined}
        data-image-missing="true"
        data-image-alt={alt}
        contentEditable={false}
      >
        <div
          className="nf-image-missing"
          role="img"
          aria-label={`${reason}: ${label}`}
        >
          <ImageOff size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="nf-image-missing-title">{reason}</span>
          <span className="nf-image-missing-name">{label}</span>
          <span className="nf-image-missing-hint">
            The asset stays referenced so the branch and alt text are kept.
          </span>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className="nf-image-node"
      data-image-node={assetId}
      data-image-asset={assetId}
      data-image-alt={alt}
      contentEditable={false}
    >
      <img
        className="nf-image-el"
        src={src}
        alt={alt}
        {...(assetId.length === 0 ? {} : { 'data-asset-id': assetId })}
        {...(width === undefined ? {} : { width })}
        {...(height === undefined ? {} : { height })}
        draggable={false}
        onError={() => setFailed(true)}
      />
    </NodeViewWrapper>
  );
}
