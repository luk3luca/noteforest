/**
 * Small clipboard helper for editor chrome (code copy, table "Copy as
 * Markdown"). `navigator.clipboard` is used when available; the textarea
 * fallback keeps the action working in a non-secure renderer context.
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const element = document.createElement('textarea');
    element.value = text;
    element.setAttribute('readonly', 'true');
    element.style.position = 'fixed';
    element.style.left = '-9999px';
    document.body.appendChild(element);
    element.select();
    const copied = document.execCommand('copy');
    element.remove();
    return copied;
  } catch {
    return false;
  }
}
