/**
 * Local text-control keys inside the editor surface.
 *
 * Chromium routes caret-motion keys of a text control nested in the document
 * surface to the outer editing host: the control keeps focus and accepts typed
 * characters, but Home/arrows (and Backspace/Delete) do nothing. The code
 * language input and the formula source editor therefore handle those keys
 * themselves. Selection semantics follow a plain textarea (Home/End are line
 * aware when the control is multiline).
 *
 * Returns a cleanup function.
 */
export function installLocalTextKeys(
  control: HTMLInputElement | HTMLTextAreaElement,
): () => void {
  const handler = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const value = control.value;
    const multiline = control instanceof HTMLTextAreaElement;
    const start = control.selectionStart ?? 0;
    const end = control.selectionEnd ?? 0;
    const extend = event.shiftKey;
    const setCaret = (from: number, to: number): void => {
      const clamp = (position: number): number => Math.max(0, Math.min(value.length, position));
      control.setSelectionRange(clamp(from), clamp(to));
    };
    switch (event.key) {
      case 'ArrowLeft': {
        event.preventDefault();
        if (extend) {
          setCaret(start, Math.max(0, end - 1));
        } else {
          const position = start === end ? start - 1 : start;
          setCaret(position, position);
        }
        return;
      }
      case 'ArrowRight': {
        event.preventDefault();
        if (extend) {
          setCaret(start, Math.min(value.length, end + 1));
        } else {
          const position = start === end ? end + 1 : end;
          setCaret(position, position);
        }
        return;
      }
      case 'Home': {
        event.preventDefault();
        const lineStart = multiline
          ? value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
          : 0;
        if (extend) setCaret(start, lineStart);
        else setCaret(lineStart, lineStart);
        return;
      }
      case 'End': {
        event.preventDefault();
        const lineEnd = multiline ? value.indexOf('\n', start) : -1;
        const target = lineEnd < 0 ? value.length : lineEnd;
        if (extend) setCaret(start, target);
        else setCaret(target, target);
        return;
      }
      case 'Backspace': {
        event.preventDefault();
        if (start !== end) control.setRangeText('', start, end, 'end');
        else if (start > 0) control.setRangeText('', start - 1, start, 'end');
        control.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      case 'Delete': {
        event.preventDefault();
        if (start !== end) control.setRangeText('', start, end, 'end');
        else if (start < value.length) control.setRangeText('', start, start + 1, 'end');
        control.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      default:
        return;
    }
  };
  control.addEventListener('keydown', handler);
  return () => control.removeEventListener('keydown', handler);
}
