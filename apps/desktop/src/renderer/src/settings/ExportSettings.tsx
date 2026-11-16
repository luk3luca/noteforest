/**
 * Export settings page (R4).
 *
 * One global export default: the destination folder for the Export sheet.
 * `null` means the OS Documents folder; a chosen folder is stored in
 * `settings.json` (`settingsVersion: 5`). The page is intentionally small:
 * filenames are always the document title with `.pdf`, and metadata, tagged
 * PDF, and page ranges are not implemented, so no placeholder controls exist.
 *
 * The native folder picker is the only native surface here too. The Export
 * sheet itself still starts at this default; choosing a folder there changes
 * only that export.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSettingsStore, flushPendingSettingsEdits } from '../state/settings';
import { useShell } from '../state/shell';
import { exportActiveDocument } from '../export/export-flow';
import { pdfFileNameForTitle } from '../../../shared/export';

export function ExportSettingsPage(): JSX.Element {
  const folder = useSettingsStore((state) => state.app.export.folder);
  const documentTitle = useShell((state) => {
    const tab = state.tabs.find((candidate) => candidate.packagePath === state.activeTab);
    return tab?.title ?? '';
  });
  const [documentsPath, setDocumentsPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.noteforest
      .getExportDefaults()
      .then((defaults) => {
        if (!cancelled) setDocumentsPath(defaults.folder);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (): Promise<void> => {
    try {
      const choice = await window.noteforest.chooseExportFolder({
        defaultPath: folder ?? documentsPath,
      });
      if (choice.canceled) return;
      useSettingsStore.getState().updateAppSettings({
        export: { folder: choice.folderPath },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Couldn’t choose an export folder.',
      );
    }
  };

  const useDocuments = (): void => {
    useSettingsStore.getState().updateAppSettings({ export: { folder: null } });
  };

  const exampleName = pdfFileNameForTitle(documentTitle);

  return (
    <>
      <h3 className="nf-settings-page-title">Export</h3>
      <p className="nf-settings-page-description" data-settings-export-description="true">
        Exports the Page layout with these page settings.
      </p>

      <section className="nf-settings-section" data-settings-export-folder-section="true">
        <h4 className="nf-settings-section-title">Default folder</h4>
        <div className="nf-settings-row">
          <span className="nf-settings-row-label">Folder</span>
          <div className="nf-settings-control nf-settings-export-folder-control">
            <code
              className="nf-settings-export-path"
              data-settings-export-folder="true"
              title={folder ?? documentsPath ?? 'Documents'}
            >
              {folder ?? 'Documents'}
            </code>
            <button
              type="button"
              className="nf-button"
              data-settings-export-choose="true"
              onClick={() => void choose()}
            >
              Choose…
            </button>
            <button
              type="button"
              className="nf-button nf-button-quiet"
              data-settings-export-reset="true"
              disabled={folder === null}
              onClick={useDocuments}
            >
              Use Documents
            </button>
          </div>
        </div>
        <p className="nf-settings-help" data-settings-export-folder-help="true">
          {folder === null
            ? 'New exports go here.'
            : 'New exports go here. You can pick another folder when exporting.'}
        </p>
      </section>

      <section className="nf-settings-section" data-settings-export-filename-section="true">
        <h4 className="nf-settings-section-title">File name</h4>
        <div className="nf-settings-row">
          <span className="nf-settings-row-label">Name</span>
          <div className="nf-settings-control">
            <code className="nf-settings-export-path" data-settings-export-filename="true">
              {exampleName}
            </code>
          </div>
        </div>
        <p className="nf-settings-help" data-settings-export-filename-help="true">
          The file is named after the note. You can rename it when exporting.
        </p>
      </section>

      <section className="nf-settings-section" data-settings-export-action-section="true">
        <h4 className="nf-settings-section-title">Export</h4>
        <button
          type="button"
          className="nf-button nf-button-primary"
          data-settings-export-now="true"
          onClick={() => {
            // Flush every debounced Page edit first so the export sheet reads
            // the same resolved Page settings. Settings stays open underneath:
            // the Export sheet is a second modal, and the overlay gate keeps
            // both surfaces owned until Export is dismissed (UI Sentinel F1).
            void flushPendingSettingsEdits().then(() => {
              exportActiveDocument();
            });
          }}
        >
          Export PDF…
        </button>
      </section>
    </>
  );
}
