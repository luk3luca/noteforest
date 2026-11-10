/**
 * The 30 px window title row (V0 visual): native macOS traffic lights plus the
 * app name. It holds no document controls: tabs, view controls, and the palette
 * live in the Toolbar inside the main column. Empty areas stay the window drag
 * region. There is no sidebar reveal here; the collapsed sidebar is a rail.
 */
export function TitleBar(): JSX.Element {
  return (
    <header className="nf-titlebar" data-titlebar="true">
      <span className="nf-app-name">NoteForest</span>
    </header>
  );
}
