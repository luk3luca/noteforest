import { ImageOff } from 'lucide-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  normalizeAnchorIds,
  validateAnchorSelector,
} from '@noteforest/core';
import type { Anchor, ImageAnchorSelector } from '@noteforest/core';
import { getEditorBindings } from '../bindings';
import { useRuntimeVersion } from '../useRuntimeVersion';
import {
  clearEditorImageAuthoring,
  useEditorUi,
} from '../editor-ui';
import {
  displayRectForAnchor,
  imageAnchorBinding,
  imageAnchorKindLabel,
  imageAnchorLabel,
  imageAnchorSelector,
  cropFromImageAttrs,
  normalizedPointFromClient,
  normalizedRegionFromClient,
  type ClientBox,
  type ClientPoint,
  type ImageAuthoringMode,
  type NormalizedRect,
} from '../../lib/image-anchor';
import { beginImageAnchorAuthoring } from '../../lib/image-authoring';
import { openImageMenu } from '../../actions';
import type { ImageSelectionAnchor } from '../../lib/anchor-selection';
import { assetUrlFor } from '../../lib/asset-url';

function stringAttr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dimensionAttr(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

interface ImageLocation {
  blockId: string;
  path: number[];
}

/** Locate the canonical block and image node path for a ProseMirror node view. */
function imageLocation(editor: Editor, position: number | undefined): ImageLocation | null {
  if (position === undefined) return null;
  try {
    const $position = editor.state.doc.resolve(position);
    let bodyDepth = -1;
    for (let depth = $position.depth; depth > 0; depth -= 1) {
      if ($position.node(depth).type.name === 'blockBody') {
        bodyDepth = depth;
        break;
      }
    }
    if (bodyDepth < 1) return null;
    const blockNode = $position.node(bodyDepth - 1);
    const blockId = blockNode.attrs['blockId'];
    if (blockNode.type.name !== 'branchBlock' || typeof blockId !== 'string') return null;
    const path: number[] = [];
    for (let depth = bodyDepth; depth <= $position.depth; depth += 1) {
      path.push($position.index(depth));
    }
    return { blockId, path };
  } catch {
    return null;
  }
}

interface DisplayDraft {
  display: NormalizedRect;
  point: boolean;
}

interface PendingImageAnchor extends DisplayDraft {
  rect: NormalizedRect;
}

interface ImageRegionMarker {
  anchorId: string;
  number: number;
  point: boolean;
  display: NormalizedRect;
  label: string;
  branchCount: number;
  selected: boolean;
}

function imageAnchorSelectorOf(value: unknown): ImageAnchorSelector | null {
  const validation = validateAnchorSelector(value, 'image');
  if (validation.selector === null || validation.selector.kind !== 'image') return null;
  if (validation.issues.length > 0) return null;
  return validation.selector as ImageAnchorSelector;
}

function clientBox(element: HTMLElement | null): ClientBox | null {
  if (element === null) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * Canonical image node view and region/point authoring surface.
 *
 * A present asset renders at the block width with its intrinsic aspect ratio.
 * Resolved image anchors draw a numbered, keyboard-reachable marker over their
 * normalized region; the rectangle is recomputed from percentages, so display
 * resize never rewrites the anchor. A missing canonical asset record, a missing
 * file, or an image node without an `assetId` renders the M3c3b1 placeholder:
 * content, branches, anchors, and alt text are never deleted.
 */
export function ImageNodeView({ node, editor, getPos }: NodeViewProps): JSX.Element {
  const assetId = stringAttr(node.attrs['assetId']);
  // Editor-only while a cross-document paste is being repaired; never written
  // to canonical content.
  const clipboardAssetId = stringAttr(node.attrs['clipboardAssetId']);
  const unavailable = stringAttr(node.attrs['unavailable']);
  const alt = stringAttr(node.attrs['alt']);
  // The canonical projection may carry a display-only `src`, but an image node
  // only ever renders the package protocol URL derived from its asset id. A
  // legacy `file:`/`data:`/remote `src` never reaches `<img>`.
  const src = assetId.length > 0 ? assetUrlFor(assetId) : '';
  const width = dimensionAttr(node.attrs['width']);
  const height = dimensionAttr(node.attrs['height']);
  const bindings = getEditorBindings(editor);
  const runtime = bindings?.runtime ?? null;
  const version = useRuntimeVersion(runtime);
  const ui = useEditorUi(editor);
  const readOnly = ui.interactionMode === 'read';
  const [failed, setFailed] = useState(false);
  const [drawing, setDrawing] = useState<{ start: ClientPoint; point: boolean } | null>(null);
  const [draft, setDraft] = useState<DisplayDraft | null>(null);
  const [pending, setPending] = useState<PendingImageAnchor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const branchButtonRef = useRef<HTMLButtonElement | null>(null);

  const location = useMemo(
    () => imageLocation(editor, typeof getPos === 'function' ? getPos() : undefined),
    // The node identity changes when the image path/content changes. `version`
    // covers a rebuild that remounts the view with a new position.
    [editor, node, version],
  );
  const blockId = location?.blockId ?? '';
  const nodePath = location?.path ?? [];
  const crop = cropFromImageAttrs(node.attrs as Record<string, unknown>);

  useEffect(() => {
    setFailed(false);
  }, [assetId]);

  const record = useMemo(() => {
    if (assetId.length === 0 || runtime === null) return undefined;
    // `version` is the subscription dependency: an `asset.add` command or a
    // reload changes this view from missing to present without a node change.
    void version;
    return runtime.document.assets[assetId];
  }, [assetId, runtime, version]);

  const integrity =
    assetId.length > 0 && runtime !== null ? runtime.assetAvailability[assetId] : undefined;
  const missing =
    failed ||
    node.attrs['missing'] === true ||
    assetId.length === 0 ||
    integrity !== undefined ||
    (runtime !== null && record === undefined);
  const label =
    alt.length > 0
      ? alt
      : assetId.length > 0
        ? `asset ${assetId.slice(0, 8)}…`
        : clipboardAssetId.length > 0
          ? `asset ${clipboardAssetId.slice(0, 8)}…`
          : 'no asset';
  const reason = failed
    ? 'Image file is missing'
    : clipboardAssetId.length > 0
      ? 'Copying image…'
      : assetId.length === 0
        ? unavailable === 'cross-document-copy'
          ? 'Image not copied'
          : 'Unsupported image source'
        : integrity === 'asset-changed'
          ? 'Image asset changed'
          : 'Image not found';
  const hint = clipboardAssetId.length > 0
    ? 'The image bytes are being copied into this document.'
    : assetId.length === 0
      ? unavailable === 'cross-document-copy'
        ? 'The source document is not open. Copy the image again from the source document; the alt text is kept.'
        : 'Legacy image sources are not loaded; the alt text is kept.'
      : 'The asset stays referenced so the branch, anchor, and alt text are kept.';

  const request = ui.imageAuthoring;
  const authoring =
    request !== null && request.blockId === blockId && samePath(request.path, nodePath)
      ? request
      : null;
  const authoringMode: ImageAuthoringMode | null = authoring?.mode ?? null;
  const requestKey =
    authoring === null ? '' : `${authoring.blockId}:${authoring.path.join('.')}:${authoring.mode}`;

  // A new authoring request starts clean; the old draft never leaks across
  // images or modes. Opening/cancelling remains a pure view-state change.
  useEffect(() => {
    setDrawing(null);
    setDraft(null);
    setPending(null);
    setNotice(null);
  }, [requestKey]);

  useEffect(() => {
    if (pending !== null) branchButtonRef.current?.focus();
  }, [pending]);

  const cancelAuthoring = (): void => {
    setDrawing(null);
    setDraft(null);
    setPending(null);
    setNotice(null);
    clearEditorImageAuthoring(editor);
  };

  useEffect(() => {
    if (authoring === null) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelAuthoring();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [authoring, pending, editor]);

  const imageAnchors = useMemo<ImageRegionMarker[]>(() => {
    if (runtime === null) return [];
    const document = runtime.document;
    const ids = normalizeAnchorIds(
      Array.isArray(node.attrs['anchorIds'])
        ? (node.attrs['anchorIds'] as unknown[]).filter(
            (value): value is string => typeof value === 'string' && value.length > 0,
          )
        : [],
    );
    const selectedId = ui.selectedAnchor?.anchorId ?? null;
    const ordered: Array<{ anchorId: string; anchor: Anchor }> = [];
    for (const anchorId of ids) {
      const anchor = document.anchors[anchorId];
      if (anchor === undefined || anchor.kind !== 'image' || anchor.blockId !== blockId) continue;
      ordered.push({ anchorId, anchor });
    }
    // Number regions in creation order; anchor IDs are sorted alphabetically
    // in the binding, which is deterministic but not the order a user drew.
    ordered.sort((left, right) => {
      const timeOrder = (left.anchor.createdAt ?? '').localeCompare(
        right.anchor.createdAt ?? '',
      );
      return timeOrder !== 0 ? timeOrder : left.anchorId.localeCompare(right.anchorId);
    });
    const markers: ImageRegionMarker[] = [];
    for (const { anchorId, anchor } of ordered) {
      const branchCount = Object.values(document.branches).filter(
        (branch) =>
          branch.source.anchorId === anchorId &&
          document.blocks[branch.targetBlockId] !== undefined,
      ).length;
      // OD-2: an anchor with no live branch is idle; its marker is hidden.
      if (branchCount === 0) continue;
      const resolution = runtime.anchorIndex.entry(anchorId);
      if (resolution?.state !== 'resolved' || resolution.resolved === null) continue;
      const range = resolution.resolved.range;
      if (range.kind !== 'image') continue;
      const display = displayRectForAnchor(range.rect, range.crop ?? crop);
      if (display === null) continue;
      const selector = imageAnchorSelectorOf(anchor.selector);
      const selectorLabel =
        selector !== null && typeof selector.label === 'string' ? selector.label : '';
      markers.push({
        anchorId,
        // Visible markers are a user-facing sequence. Hidden idle or broken
        // anchors must not punch holes in it: numbering follows the visible
        // spatial/creation order, so it is always 1..N.
        number: markers.length + 1,
        point: range.point,
        display,
        label: (anchor.quote ?? '').trim() || selectorLabel.trim() || 'Image',
        branchCount,
        selected: selectedId === anchorId,
      });
    }
    return markers.sort((left, right) => left.number - right.number);
  }, [runtime, version, node, crop, ui.selectedAnchor, blockId]);

  const startAuthoring = (mode: ImageAuthoringMode): void => {
    if (runtime === null || location === null) return;
    beginImageAnchorAuthoring(runtime, blockId, nodePath, mode);
  };

  /**
   * Clicking an image selects the image node, so ⌘C/⌘X and the per-image menu
   * act on this node even when the block has several images. Authoring keeps
   * its own click semantics (the draw layer owns the pointer).
   */
  const selectImageNode = (): void => {
    if (authoring !== null) return;
    const position = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof position !== 'number') return;
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)),
    );
    editor.view.focus();
  };

  const draftFromPointer = (
    point: ClientPoint,
    start: ClientPoint | null,
    asPoint: boolean,
  ): PendingImageAnchor | null => {
    const box = clientBox(frameRef.current);
    if (box === null) return null;
    if (asPoint) {
      const rect = normalizedPointFromClient(box, point, crop);
      const display = rect === null ? null : displayRectForAnchor(rect, crop);
      return rect === null || display === null ? null : { rect, display, point: true };
    }
    if (start === null) return null;
    const rect = normalizedRegionFromClient(box, start, point, crop);
    const display = rect === null ? null : displayRectForAnchor(rect, crop);
    return rect === null || display === null ? null : { rect, display, point: false };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (authoring === null || pending !== null || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const box = clientBox(frameRef.current);
    if (box === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = authoringMode === 'point' || event.altKey;
    setDrawing({ start: { x: event.clientX, y: event.clientY }, point });
    setNotice(null);
    const next = draftFromPointer(
      { x: event.clientX, y: event.clientY },
      { x: event.clientX, y: event.clientY },
      point,
    );
    setDraft(next === null ? null : { display: next.display, point: next.point });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drawing === null || pending !== null) return;
    event.preventDefault();
    const next = draftFromPointer(
      { x: event.clientX, y: event.clientY },
      drawing.start,
      drawing.point,
    );
    setDraft(next === null ? null : { display: next.display, point: next.point });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drawing === null || pending !== null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const next = draftFromPointer(
      { x: event.clientX, y: event.clientY },
      drawing.start,
      drawing.point,
    );
    setDrawing(null);
    setDraft(null);
    if (next === null) {
      setNotice(
        drawing.point
          ? 'Place the point inside the image.'
          : 'Drag a rectangle at least 3 pixels wide and tall.',
      );
      return;
    }
    setPending(next);
  };

  const onPointerCancel = (): void => {
    setDrawing(null);
    setDraft(null);
  };

  const commitPending = (): void => {
    if (pending === null || runtime === null || location === null) return;
    const draft = {
      blockId,
      nodePath,
      assetId,
      rect: pending.rect,
      crop,
      point: pending.point,
      label: imageAnchorLabel(alt),
    };
    const selection: ImageSelectionAnchor = {
      kind: 'image',
      blockId,
      binding: imageAnchorBinding(draft),
      selector: imageAnchorSelector(draft),
    };
    void runtime.branchFromSelection(selection).then((outcome) => {
      if (!outcome.ok) {
        setNotice(outcome.message ?? 'Could not branch from the image region.');
        return;
      }
      cancelAuthoring();
    });
  };

  if (missing) {
    return (
      <NodeViewWrapper
        className="nf-image-node nf-image-node-missing"
        data-image-node={assetId || clipboardAssetId || 'no-asset'}
        data-image-asset={assetId || undefined}
        data-image-missing="true"
        data-image-integrity={integrity ?? (assetId.length === 0 ? 'unsupported' : undefined)}
        data-image-unavailable={unavailable || undefined}
        data-image-copy={clipboardAssetId || undefined}
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
          <span className="nf-image-missing-hint">{hint}</span>
        </div>
        {runtime !== null && runtime.editable && !readOnly ? (
          // A broken image has no draw layer, but the per-image menu stays the
          // repair surface: Replace/alt are safe, and Add region/point render
          // disabled with the availability reason.
          <div
            className="nf-image-actions"
            contentEditable={false}
            role="group"
            aria-label="Image actions"
          >
            <button
              type="button"
              className="nf-image-action"
              data-image-action="menu"
              data-image-action-path={nodePath.join('.') || '0'}
              aria-label="Image actions"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openImageMenu(blockId, nodePath, {
                  x: rect.left,
                  y: rect.bottom + 4,
                });
              }}
            >
              Image actions…
            </button>
          </div>
        ) : null}
      </NodeViewWrapper>
    );
  }

  const pendingLabel =
    pending === null ? '' : pending.point ? 'point' : 'region';
  const instruction =
    authoringMode === 'point'
      ? 'Click the image to place a point, or press Esc to cancel.'
      : 'Drag a rectangle over the image. Hold ⌥ to place a point instead.';
  const showToolbar = !missing && !readOnly && (ui.selectedBlockId === blockId || authoring !== null);

  return (
    <NodeViewWrapper
      className="nf-image-node"
      data-image-node={assetId}
      data-image-asset={assetId}
      data-image-integrity={integrity}
      data-image-alt={alt}
      contentEditable={false}
    >
      <div className="nf-image-frame" ref={frameRef} data-image-frame={assetId}>
        <img
          className="nf-image-el"
          src={src}
          alt={alt}
          {...(assetId.length === 0 ? {} : { 'data-asset-id': assetId })}
          {...(width === undefined ? {} : { width })}
          {...(height === undefined ? {} : { height })}
          draggable={false}
          onError={() => setFailed(true)}
          onClick={selectImageNode}
        />
        {imageAnchors.length > 0 ? (
          <div className="nf-image-regions" data-image-region-layer={assetId}>
            {imageAnchors.map((marker) => (
              <div
                key={marker.anchorId}
                className={`nf-image-region${marker.point ? ' nf-image-region-point' : ''}`}
                data-image-region-anchor={marker.anchorId}
                data-image-anchor-kind={marker.point ? 'point' : 'region'}
                data-image-anchor-number={marker.number}
                data-anchor-ids={marker.anchorId}
                data-anchor-selected={marker.selected ? 'true' : undefined}
                style={{
                  left: `${marker.display.x * 100}%`,
                  top: `${marker.display.y * 100}%`,
                  width: `${marker.display.width * 100}%`,
                  height: `${marker.display.height * 100}%`,
                }}
              >
                {marker.point ? null : (
                  <span
                    className="nf-image-region-outline"
                    data-image-region-outline={marker.anchorId}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      runtime?.activateAnchor(blockId, marker.anchorId);
                    }}
                  />
                )}
                <button
                  type="button"
                  className="nf-image-region-marker"
                  data-image-region-marker={marker.anchorId}
                  data-image-anchor-kind={marker.point ? 'point' : 'region'}
                  aria-label={`Image ${imageAnchorKindLabel(marker.point)} ${marker.number}: “${marker.label}”, ${marker.branchCount} ${
                    marker.branchCount === 1 ? 'branch' : 'branches'
                  }`}
                  title={`Image ${imageAnchorKindLabel(marker.point)} ${marker.number}: “${marker.label}” · ${marker.branchCount} ${
                    marker.branchCount === 1 ? 'branch' : 'branches'
                  }`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    runtime?.activateAnchor(blockId, marker.anchorId);
                  }}
                >
                  <span className="nf-image-region-number" aria-hidden="true">
                    {marker.number}
                  </span>
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {authoring === null || readOnly ? null : (
          <div
            className="nf-image-draw-layer"
            data-image-draw-layer={assetId}
            data-image-authoring-mode={authoringMode ?? 'region'}
            aria-label={
              authoringMode === 'point'
                ? 'Image point authoring: click the image'
                : 'Image region authoring: drag a rectangle'
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                cancelAuthoring();
              }
            }}
          >
            <span className="nf-image-draw-hint" aria-hidden="true">
              {authoringMode === 'point' ? 'Click to place a point' : 'Drag a region'}
            </span>
          </div>
        )}
        {draft === null ? null : (
          <div
            className={`nf-image-draft${draft.point ? ' nf-image-draft-point' : ''}`}
            data-image-draft={draft.point ? 'point' : 'region'}
            style={{
              left: `${draft.display.x * 100}%`,
              top: `${draft.display.y * 100}%`,
              width: `${draft.display.width * 100}%`,
              height: `${draft.display.height * 100}%`,
            }}
          />
        )}
        {pending === null ? null : (
          <div
            className={`nf-image-draft nf-image-draft-pending${pending.point ? ' nf-image-draft-point' : ''}`}
            data-image-pending={pendingLabel}
            style={{
              left: `${pending.display.x * 100}%`,
              top: `${pending.display.y * 100}%`,
              width: `${pending.display.width * 100}%`,
              height: `${pending.display.height * 100}%`,
            }}
          />
        )}
      </div>
      {showToolbar ? (
        <div className="nf-image-actions" contentEditable={false} role="group" aria-label="Image anchors">
          {authoring === null ? (
            <>
              <button
                type="button"
                className="nf-image-action"
                data-image-action="menu"
                data-image-action-path={nodePath.join('.') || '0'}
                aria-label="Image actions"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  openImageMenu(blockId, nodePath, {
                    x: rect.left,
                    y: rect.bottom + 4,
                  });
                }}
              >
                Image actions…
              </button>
              <button
                type="button"
                className="nf-image-action"
                data-image-action="add-region"
                onClick={() => startAuthoring('region')}
              >
                Add region
              </button>
              <button
                type="button"
                className="nf-image-action"
                data-image-action="add-point"
                onClick={() => startAuthoring('point')}
              >
                Add point
              </button>
            </>
          ) : pending === null ? (
            <>
              <span className="nf-image-action-note" role="status" data-image-authoring-note="true">
                {instruction}
              </span>
              <button
                type="button"
                className="nf-image-action"
                data-image-authoring-action="cancel"
                onClick={cancelAuthoring}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                ref={branchButtonRef}
                className="nf-image-action nf-image-action-primary"
                data-image-authoring-action="branch"
                data-image-authoring-kind={pendingLabel}
                onClick={commitPending}
              >
                {pending.point ? 'Branch from point' : 'Branch from region'}
              </button>
              <button
                type="button"
                className="nf-image-action"
                data-image-authoring-action="cancel"
                onClick={cancelAuthoring}
              >
                Cancel
              </button>
              <span className="nf-image-action-note" role="status">
                A region only becomes part of the document when you branch from it.
              </span>
            </>
          )}
          {notice === null ? null : (
            <span className="nf-image-action-error" role="alert" data-image-authoring-error="true">
              {notice}
            </span>
          )}
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
