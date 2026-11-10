import { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  FileDown,
  FileText,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  TriangleAlert,
  X,
} from 'lucide-react';

const documents = [
  { title: 'Linear algebra', meta: '12 blocks', active: true },
  { title: 'Real analysis', meta: '8 blocks' },
  { title: 'Algorithms', meta: '21 blocks' },
];

const topics = [
  { title: 'Chapter 1 · Eigenvalues', depth: 0, open: true },
  { title: 'Eigenvalues', depth: 1, active: true },
  { title: 'Eigenvector', depth: 2 },
  { title: 'Characteristic polynomial', depth: 2 },
  { title: 'Spectrum', depth: 2 },
  { title: 'Worked example', depth: 1 },
  { title: 'Trace and determinant', depth: 1 },
  { title: 'Chapter 2 · Diagonalization', depth: 0 },
];

const paletteCommands = [
  { label: 'New note', shortcut: '⌘N' },
  { label: 'Save now', shortcut: '⌘S' },
  { label: 'Export PDF…', shortcut: '⇧⌘E' },
  { label: 'Toggle sidebar', shortcut: '⌘\\' },
  { label: 'Command palette', shortcut: '⌘K' },
  { label: 'Settings…', shortcut: '⌘,' },
];

const settingsPages = [
  { group: 'App', id: 'general', label: 'General' },
  { group: 'App', id: 'appearance', label: 'Appearance' },
  { group: 'Document', id: 'page', label: 'Page' },
  { group: 'Document', id: 'continuous', label: 'Continuous' },
  { group: 'Workflow', id: 'editor', label: 'Editor' },
  { group: 'Workflow', id: 'export', label: 'Export' },
  { group: 'Data', id: 'data', label: 'Data & About' },
];

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="lab-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'is-active' : undefined}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function IconButton({ label, children, onClick, className = '' }) {
  return (
    <button type="button" className={`lab-icon-btn ${className}`} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function Row({ label, help, children }) {
  return (
    <div className="lab-settings-row">
      <div className="lab-settings-row-copy">
        <span className="lab-row-label">{label}</span>
        {help ? <span className="lab-row-help">{help}</span> : null}
      </div>
      <div className="lab-settings-row-control">{children}</div>
    </div>
  );
}

function TitleBar() {
  return (
    <header className="lab-titlebar">
      <div className="lab-traffic" aria-label="Window controls">
        <span className="lab-traffic-red" />
        <span className="lab-traffic-yellow" />
        <span className="lab-traffic-green" />
      </div>
      <span className="lab-app-name">NoteForest</span>
    </header>
  );
}

function Toolbar({ layout, setLayout, mode, setMode, onPalette }) {
  return (
    <header className="lab-toolbar">
      <div className="lab-tabs" role="tablist" aria-label="Open documents">
        {documents.map((doc) => (
          <button
            key={doc.title}
            type="button"
            role="tab"
            aria-selected={doc.active}
            className={`lab-tab ${doc.active ? 'is-active' : ''}`}
          >
            <span className="lab-tab-title">{doc.title}</span>
            {doc.active ? <span className="lab-tab-dirty" title="Unsaved changes" /> : null}
            <X size={11} strokeWidth={1.6} className="lab-tab-close" aria-hidden="true" />
          </button>
        ))}
      </div>
      <IconButton label="New note" className="lab-new-tab">
        <Plus size={15} strokeWidth={1.5} />
      </IconButton>
      <div className="lab-topbar-spacer" />
      <div className="lab-view-controls" role="toolbar" aria-label="View controls">
        <Segmented
          label="Layout"
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'continuous', label: 'Continuous' },
            { value: 'page', label: 'Page' },
          ]}
        />
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'read', label: 'Read' },
          ]}
        />
        <div className="lab-zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" title="Zoom out (⌘−)">
            <Minus size={12} strokeWidth={1.7} />
          </button>
          <button type="button" className="lab-zoom-value" title="Reset zoom (⌘0)">
            100%
          </button>
          <button type="button" aria-label="Zoom in" title="Zoom in (⌘+)">
            <Plus size={12} strokeWidth={1.7} />
          </button>
          <button type="button" aria-label="Zoom options" title="Zoom options">
            <ChevronDown size={12} strokeWidth={1.7} />
          </button>
        </div>
      </div>
      <IconButton label="Command palette" onClick={onPalette} className="lab-palette-button">
        <Command size={14} strokeWidth={1.5} />
        <span>K</span>
      </IconButton>
    </header>
  );
}

function Sidebar({ collapsed, onToggle, onSettings, onNew }) {
  if (collapsed) {
    return (
      <aside className="lab-sidebar lab-sidebar-rail" aria-label="Sidebar">
        <div className="lab-rail-head">
          <IconButton label="Expand sidebar" onClick={onToggle}>
            <PanelLeftOpen size={15} strokeWidth={1.5} />
          </IconButton>
        </div>
        <div className="lab-topbar-spacer" />
        <div className="lab-rail-foot">
          <IconButton label="Settings" onClick={onSettings}>
            <Settings size={15} strokeWidth={1.5} />
          </IconButton>
        </div>
      </aside>
    );
  }

  return (
    <aside className="lab-sidebar" aria-label="Sidebar">
      <div className="lab-sidebar-head">
        <button type="button" className="lab-search">
          <Search size={13} strokeWidth={1.5} />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
        <IconButton label="New note" onClick={onNew}>
          <Plus size={14} strokeWidth={1.5} />
        </IconButton>
        <IconButton label="Collapse sidebar" onClick={onToggle}>
          <PanelLeftClose size={15} strokeWidth={1.5} />
        </IconButton>
      </div>
      <div className="lab-sidebar-scroll">
        <section className="lab-sidebar-section">
          <div className="lab-section-head">
            <span>Library</span>
            <span className="lab-section-tail">
              <span className="lab-count">3</span>
              <IconButton label="New note" onClick={onNew} className="lab-section-add">
                <Plus size={12} strokeWidth={1.6} />
              </IconButton>
            </span>
          </div>
          <label className="lab-filter">
            <Search size={12} strokeWidth={1.5} />
            <input placeholder="Filter documents" aria-label="Filter documents" />
          </label>
          <div className="lab-doc-list">
            {documents.map((doc) => (
              <button
                key={doc.title}
                type="button"
                className={`lab-doc ${doc.active ? 'is-active' : ''}`}
              >
                <FileText size={13} strokeWidth={1.5} />
                <span>{doc.title}</span>
                <span className="lab-doc-meta">{doc.meta}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="lab-sidebar-section">
          <div className="lab-section-head">
            <span>Topics</span>
            <span className="lab-count">2</span>
          </div>
          <div className="lab-tree">
            {topics.map((topic) => (
              <button
                key={topic.title}
                type="button"
                className={`lab-topic ${topic.active ? 'is-active' : ''}`}
                style={{ paddingLeft: 8 + topic.depth * 16 }}
              >
                {topic.depth === 0 ? (
                  <ChevronDown size={12} strokeWidth={1.5} className="lab-topic-chevron" />
                ) : topic.depth === 1 ? (
                  <ChevronRight size={12} strokeWidth={1.5} className="lab-topic-chevron" />
                ) : (
                  <span className="lab-topic-dot" />
                )}
                <span>{topic.title}</span>
              </button>
            ))}
          </div>
          <button type="button" className="lab-add-block">
            <Plus size={12} strokeWidth={1.6} />
            Add block
          </button>
        </section>
      </div>
      <div className="lab-sidebar-foot">
        <button type="button" className="lab-settings-entry" onClick={onSettings}>
          <Settings size={15} strokeWidth={1.5} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

function ContinuousCanvas() {
  return (
    <div className="lab-canvas lab-canvas-continuous">
      <div className="lab-chapter">
        <span className="lab-eyebrow">CHAPTER</span>
        <h1>Chapter 1 · Eigenvalues</h1>
        <span className="lab-chapter-meta">5 blocks</span>
      </div>
      <div className="lab-board">
        <svg className="lab-edges" viewBox="0 0 960 470" aria-hidden="true">
          <defs>
            <marker id="lab-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L8 4 L0 8 Z" fill="var(--edge)" />
            </marker>
          </defs>
          <path d="M344 111 H380 V84 H420" markerEnd="url(#lab-arrow)" />
          <path d="M344 111 H380 V240 H420" markerEnd="url(#lab-arrow)" />
          <path d="M680 84 H690 V156 H700" markerEnd="url(#lab-arrow)" />
          <path d="M184 186 V240 H210 V300" markerEnd="url(#lab-arrow)" />
        </svg>

        <article className="lab-card lab-card-main is-selected" style={{ left: 24, top: 36, width: 320 }}>
          <div className="lab-card-label">Block</div>
          <h2>Eigenvalues</h2>
          <p>A scalar λ is an eigenvalue of A if there is a nonzero vector v with Av = λv.</p>
          <div className="lab-anchor-chip">“v ≠ 0”</div>
        </article>

        <article className="lab-card" style={{ left: 420, top: 24, width: 260 }}>
          <div className="lab-card-label">Child</div>
          <h2>Eigenvector</h2>
          <p>A nonzero vector that satisfies Av = λv.</p>
        </article>

        <article className="lab-card" style={{ left: 420, top: 180, width: 260 }}>
          <div className="lab-card-label">Child</div>
          <h2>Spectrum</h2>
          <p>The set of all eigenvalues of A.</p>
        </article>

        <article className="lab-card" style={{ left: 700, top: 96, width: 236 }}>
          <div className="lab-card-label">Grandchild</div>
          <h2>Characteristic polynomial</h2>
          <p>Eigenvalues are the roots of det(A − λI) = 0.</p>
          <pre>det(A − λI) = 0</pre>
        </article>

        <article className="lab-card lab-card-below" style={{ left: 50, top: 300, width: 320 }}>
          <div className="lab-card-label">Below</div>
          <h2>Worked example</h2>
          <p>For A = [[2, 1], [1, 2]], the eigenvalues are 1 and 3.</p>
          <pre>A = [[2, 1], [1, 2]]</pre>
        </article>
      </div>
    </div>
  );
}

function PageCanvas() {
  return (
    <div className="lab-canvas lab-canvas-page">
      <div className="lab-page-toolbar">
        <div className="lab-page-nav">
          <IconButton label="Previous page">
            <ChevronLeft size={14} strokeWidth={1.6} />
          </IconButton>
          <span>Page 1 of 2</span>
          <IconButton label="Next page">
            <ChevronRight size={14} strokeWidth={1.6} />
          </IconButton>
        </div>
        <div className="lab-topbar-spacer" />
        <button type="button" className="lab-btn lab-export-btn">
          <FileDown size={13} strokeWidth={1.6} />
          Export PDF
        </button>
      </div>
      <div className="lab-page-stage">
        <article className="lab-sheet" aria-label="Page 1 of 2">
          <header className="lab-sheet-head">
            <span>Linear algebra</span>
            <span>Chapter 1 · Eigenvalues</span>
          </header>
          <div className="lab-sheet-body">
            <h2>Eigenvalues</h2>
            <p>
              A scalar λ is an eigenvalue of A if there is a nonzero vector v with Av = λv. The
              eigenvectors are the directions that only stretch under A.
            </p>
            <div className="lab-sheet-columns">
              <section>
                <h3>Eigenvector</h3>
                <p>A nonzero vector that satisfies Av = λv.</p>
                <h3>Spectrum</h3>
                <p>The set of all eigenvalues of A.</p>
              </section>
              <section>
                <h3>Characteristic polynomial</h3>
                <p>Eigenvalues are the roots of det(A − λI) = 0.</p>
                <pre>det(A − λI) = 0</pre>
              </section>
            </div>
            <h3>Worked example</h3>
            <p>For A = [[2, 1], [1, 2]], the eigenvalues are 1 and 3.</p>
            <pre>A = [[2, 1], [1, 2]]</pre>
          </div>
          <footer className="lab-sheet-foot">
            <span>Chapter 1 · Eigenvalues</span>
            <span>Page 1 of 2</span>
          </footer>
        </article>
      </div>
    </div>
  );
}

function StatusStrip() {
  return (
    <footer className="lab-statusbar">
      <span className="lab-save">
        <span className="lab-save-dot" />
        Saved
      </span>
      <span>1,204 words</span>
      <span>86 blocks</span>
      <span className="lab-topbar-spacer" />
      <button type="button" className="lab-health">
        <TriangleAlert size={11} strokeWidth={1.5} />
        2 anchors need repair
      </button>
    </footer>
  );
}

function SettingsPageContent({ page }) {
  if (page === 'appearance') {
    return (
      <div className="lab-settings-single">
        <section className="lab-settings-section">
          <h3>Theme</h3>
          <Row label="Theme" help="Page and PDF keep the paper light.">
            <Segmented
              label="Theme"
              value="dark"
              onChange={() => undefined}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
            />
          </Row>
          <Row label="Accent" help="Focus, selection, and primary actions.">
            <div className="lab-swatches">
              <span className="lab-swatch is-active" style={{ background: '#9bb7d4' }} />
              <span className="lab-swatch" style={{ background: '#7fc4c0' }} />
              <span className="lab-swatch" style={{ background: '#d6b17a' }} />
              <span className="lab-swatch" style={{ background: '#d9a0a8' }} />
            </div>
          </Row>
        </section>
        <section className="lab-settings-section">
          <h3>Typography</h3>
          <Row label="UI text size">
            <Segmented
              label="UI text size"
              value="default"
              onChange={() => undefined}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'default', label: 'Default' },
                { value: 'large', label: 'Large' },
              ]}
            />
          </Row>
          <Row label="UI font">
            <select className="lab-input lab-select" defaultValue="system">
              <option value="system">System</option>
              <option value="serif">Serif</option>
            </select>
          </Row>
          <Row label="Code font" help="Affects code blocks in Page and PDF.">
            <select className="lab-input lab-select" defaultValue="jetbrains">
              <option value="jetbrains">JetBrains Mono</option>
              <option value="system">System Mono</option>
            </select>
          </Row>
        </section>
      </div>
    );
  }

  if (page === 'general') {
    return (
      <div className="lab-settings-single">
        <section className="lab-settings-section">
          <h3>Startup</h3>
          <Row label="Default layout">
            <Segmented
              label="Default layout"
              value="continuous"
              onChange={() => undefined}
              options={[
                { value: 'continuous', label: 'Continuous' },
                { value: 'page', label: 'Page' },
              ]}
            />
          </Row>
          <Row label="Default mode">
            <Segmented
              label="Default mode"
              value="edit"
              onChange={() => undefined}
              options={[
                { value: 'edit', label: 'Edit' },
                { value: 'read', label: 'Read' },
              ]}
            />
          </Row>
        </section>
        <section className="lab-settings-section">
          <h3>Saving</h3>
          <Row label="Autosave" help="Autosave after 800 ms; ⌘S flushes immediately.">
            <span className="lab-readonly">On</span>
          </Row>
        </section>
      </div>
    );
  }

  if (page === 'continuous') {
    return (
      <div className="lab-settings-single">
        <p className="lab-settings-note">These controls apply to this document. There are no global Continuous settings.</p>
        <section className="lab-settings-section">
          <h3>View</h3>
          <Row label="Zoom">
            <div className="lab-inline-control">
              <input className="lab-input lab-input-sm" defaultValue="100" />
              <span className="lab-unit">%</span>
            </div>
          </Row>
          <Row label="Canvas width" help="A future per-document view setting.">
            <span className="lab-readonly">3,200 px</span>
          </Row>
        </section>
      </div>
    );
  }

  if (page === 'editor') {
    return (
      <div className="lab-settings-single">
        <section className="lab-settings-section">
          <h3>Shortcuts</h3>
          <Row label="Keyboard shortcuts" help="Open the shortcut list.">
            <button type="button" className="lab-btn">View all</button>
          </Row>
          <Row label="Single-key shortcuts" help="Future option.">
            <span className="lab-readonly">Off</span>
          </Row>
        </section>
        <section className="lab-settings-section">
          <h3>Autosave</h3>
          <Row label="Interval" help="Current fixed interval.">
            <span className="lab-readonly">800 ms</span>
          </Row>
        </section>
      </div>
    );
  }

  if (page === 'export') {
    return (
      <div className="lab-settings-single">
        <section className="lab-settings-section">
          <h3>Current behavior</h3>
          <Row label="Save dialog" help="Native save dialog; default filename <title>.pdf.">
            <span className="lab-readonly">Native</span>
          </Row>
          <Row label="Defaults" help="Folder, filename/date, metadata, tagged PDF, range are future settings.">
            <span className="lab-readonly">Not set</span>
          </Row>
        </section>
      </div>
    );
  }

  if (page === 'data') {
    return (
      <div className="lab-settings-single">
        <section className="lab-settings-section">
          <h3>Paths</h3>
          <Row label="Library" help="~/Documents/NoteForest">
            <button type="button" className="lab-btn">Reveal</button>
          </Row>
          <Row label="App data" help="~/Library/Application Support/NoteForest">
            <button type="button" className="lab-btn">Reveal</button>
          </Row>
        </section>
        <section className="lab-settings-section">
          <h3>Settings file</h3>
          <Row label="Status" help="settingsVersion 2">
            <span className="lab-readonly">OK</span>
          </Row>
          <Row label="Version" help="NoteForest 0.0.0-m2.2">
            <span className="lab-readonly">0.0.0-m2.2</span>
          </Row>
        </section>
      </div>
    );
  }

  return (
    <div className="lab-settings-page-grid">
      <div className="lab-settings-form">
        <section className="lab-settings-section">
          <h3>Scope</h3>
          <Segmented
            label="Page settings scope"
            value="document"
            onChange={() => undefined}
            options={[
              { value: 'global', label: 'Global default' },
              { value: 'document', label: 'This document' },
            ]}
          />
        </section>
        <section className="lab-settings-section">
          <h3>Setup</h3>
          <Row label="Page size">
            <Segmented
              label="Page size"
              value="a4"
              onChange={() => undefined}
              options={[
                { value: 'a4', label: 'A4' },
                { value: 'a5', label: 'A5' },
                { value: 'letter', label: 'Letter' },
              ]}
            />
          </Row>
          <Row label="Orientation">
            <Segmented
              label="Orientation"
              value="landscape"
              onChange={() => undefined}
              options={[
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
              ]}
            />
          </Row>
          <Row label="Margins" help="Millimetres. Minimum content area 20 mm.">
            <div className="lab-margins">
              <input className="lab-input lab-input-sm" defaultValue="12" aria-label="Top margin" />
              <input className="lab-input lab-input-sm" defaultValue="12" aria-label="Right margin" />
              <input className="lab-input lab-input-sm" defaultValue="12" aria-label="Bottom margin" />
              <input className="lab-input lab-input-sm" defaultValue="12" aria-label="Left margin" />
            </div>
          </Row>
        </section>
        <section className="lab-settings-section">
          <h3>Typography</h3>
          <Row label="Preset">
            <Segmented
              label="Preset"
              value="compact"
              onChange={() => undefined}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'comfortable', label: 'Comfortable' },
              ]}
            />
          </Row>
          <Row label="Page density" help="60% fine print · 70% gentle dense · 100% default">
            <div className="lab-density">
              <input type="range" min="60" max="120" step="5" defaultValue="100" aria-label="Page density" />
              <span>100%</span>
            </div>
          </Row>
          <details className="lab-advanced">
            <summary>Advanced typography</summary>
            <Row label="Body">
              <div className="lab-inline-control"><input className="lab-input lab-input-sm" defaultValue="9" /><span className="lab-unit">pt</span></div>
            </Row>
            <Row label="Heading 1">
              <div className="lab-inline-control"><input className="lab-input lab-input-sm" defaultValue="14" /><span className="lab-unit">pt</span></div>
            </Row>
            <Row label="Code">
              <div className="lab-inline-control"><input className="lab-input lab-input-sm" defaultValue="8" /><span className="lab-unit">pt</span></div>
            </Row>
          </details>
        </section>
        <section className="lab-settings-section">
          <h3>Layout</h3>
          <Row label="Max card width">
            <div className="lab-inline-control"><input className="lab-input lab-input-sm" defaultValue="420" /><span className="lab-unit">px</span></div>
          </Row>
          <Row label="Min content width">
            <div className="lab-inline-control"><input className="lab-input lab-input-sm" defaultValue="160" /><span className="lab-unit">px</span></div>
          </Row>
          <details className="lab-advanced">
            <summary>Advanced layout</summary>
            <Row label="List indent"><div className="lab-inline-control"><input className="lab-input lab-input-sm" defaultValue="12" /><span className="lab-unit">px</span></div></Row>
            <Row label="Child indent"><div className="lab-inline-control"><input className="lab-input lab-input-sm" defaultValue="26" /><span className="lab-unit">px</span></div></Row>
          </details>
        </section>
        <section className="lab-settings-section">
          <h3>Manual breaks</h3>
          <p className="lab-settings-note">Cleanup rules are not implemented yet. The list appears when they are.</p>
        </section>
      </div>
      <aside className="lab-settings-preview" aria-label="Page preview">
        <div className="lab-preview-label">Preview</div>
        <div className="lab-preview-sheet">
          <div className="lab-preview-head">Linear algebra</div>
          <div className="lab-preview-line" style={{ width: '78%' }} />
          <div className="lab-preview-line" style={{ width: '92%' }} />
          <div className="lab-preview-line" style={{ width: '64%' }} />
          <div className="lab-preview-cards">
            <div />
            <div />
          </div>
          <div className="lab-preview-foot">Page 1 of 2</div>
        </div>
      </aside>
    </div>
  );
}

function SettingsModal({ onClose }) {
  const [page, setPage] = useState('page');
  const active = settingsPages.find((item) => item.id === page) ?? settingsPages[2];
  return (
    <div className="lab-overlay" onMouseDown={onClose}>
      <div className="lab-settings" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(event) => event.stopPropagation()}>
        <aside className="lab-settings-nav">
          <div className="lab-settings-brand">Settings</div>
          {['App', 'Document', 'Workflow', 'Data'].map((group) => (
            <div key={group} className="lab-settings-group">
              <div className="lab-settings-group-label">{group}</div>
              {settingsPages.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`lab-settings-nav-item ${page === item.id ? 'is-active' : ''}`}
                  onClick={() => setPage(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
          <div className="lab-settings-nav-foot">0.0.0-m2.2</div>
        </aside>
        <div className="lab-settings-content">
          <header className="lab-settings-header">
            <div>
              <h2>{active.label}</h2>
              <p>
                {page === 'page'
                  ? 'Page size, typography, layout, and breaks.'
                  : page === 'appearance'
                    ? 'Theme, colors, and fonts for the app shell.'
                    : 'Application and document defaults.'}
              </p>
            </div>
            <IconButton label="Close settings" onClick={onClose}>
              <X size={16} strokeWidth={1.5} />
            </IconButton>
          </header>
          <div className="lab-settings-body">
            <SettingsPageContent page={page} />
          </div>
          <footer className="lab-settings-footer">
            <span className="lab-settings-status">No unsaved changes</span>
            <span className="lab-topbar-spacer" />
            <button type="button" className="lab-btn">Reset page</button>
            <button type="button" className="lab-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="lab-btn lab-btn-primary">Apply</button>
          </footer>
        </div>
      </div>
    </div>
  );
}

function ExportSheet({ onClose }) {
  const [step, setStep] = useState('configure');
  return (
    <div className="lab-overlay" onMouseDown={onClose}>
      <div className="lab-modal lab-export" role="dialog" aria-modal="true" aria-label="Export PDF" onMouseDown={(event) => event.stopPropagation()}>
        <header className="lab-modal-head">
          <h2>{step === 'done' ? 'PDF exported' : 'Export PDF'}</h2>
          <IconButton label="Close export" onClick={onClose}>
            <X size={16} strokeWidth={1.5} />
          </IconButton>
        </header>
        {step === 'configure' ? (
          <>
            <div className="lab-modal-body">
              <section className="lab-export-section">
                <h3>Destination</h3>
                <div className="lab-export-path">
                  <span>~/Documents/Exports</span>
                  <button type="button" className="lab-btn">Choose…</button>
                </div>
                <Row label="File name">
                  <input className="lab-input" defaultValue="Linear algebra.pdf" />
                </Row>
                <label className="lab-check">
                  <input type="checkbox" /> Add date
                </label>
              </section>
              <section className="lab-export-section">
                <h3>What will be exported</h3>
                <div className="lab-export-summary">
                  <span>Page layout · A4 landscape · 12 mm · 100%</span>
                  <span>12 pages · whole document</span>
                </div>
              </section>
              <details className="lab-advanced">
                <summary>Advanced</summary>
                <Row label="Metadata"><span className="lab-readonly">Title, creator</span></Row>
                <Row label="Tagged PDF"><span className="lab-readonly">Off</span></Row>
                <Row label="Page range"><span className="lab-readonly">Whole document</span></Row>
              </details>
            </div>
            <footer className="lab-modal-foot">
              <button type="button" className="lab-btn" onClick={onClose}>Cancel</button>
              <button type="button" className="lab-btn lab-btn-primary" onClick={() => setStep('done')}>Export</button>
            </footer>
          </>
        ) : (
          <>
            <div className="lab-modal-body">
              <p className="lab-export-done">12 pages · ~/Documents/Exports/Linear algebra.pdf</p>
              <section className="lab-export-section">
                <h3>Warnings (2)</h3>
                <ul className="lab-warning-list">
                  <li>Manual break before “Chapter 3” could not be honored</li>
                  <li>Image asset missing in “Cell diagram”</li>
                </ul>
              </section>
            </div>
            <footer className="lab-modal-foot">
              <button type="button" className="lab-btn">Reveal in Finder</button>
              <span className="lab-topbar-spacer" />
              <button type="button" className="lab-btn lab-btn-primary">Open PDF</button>
              <button type="button" className="lab-btn" onClick={onClose}>Done</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function CommandPalette({ onClose }) {
  return (
    <div className="lab-overlay" onMouseDown={onClose}>
      <div className="lab-modal lab-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="lab-palette-search">
          <Search size={15} strokeWidth={1.5} />
          <input autoFocus placeholder="Search or run a command…" aria-label="Search commands" />
          <kbd>⌘K</kbd>
        </div>
        <div className="lab-palette-body">
          <div className="lab-palette-group">Commands</div>
          {paletteCommands.map((command) => (
            <button key={command.label} type="button" className="lab-palette-row">
              <span>{command.label}</span>
              <kbd>{command.shortcut}</kbd>
            </button>
          ))}
          <div className="lab-palette-group">Documents</div>
          {documents.map((doc) => (
            <button key={doc.title} type="button" className="lab-palette-row">
              <BookOpen size={13} strokeWidth={1.5} />
              <span>{doc.title}</span>
              <span className="lab-palette-meta">{doc.meta}</span>
            </button>
          ))}
          <div className="lab-palette-group">Blocks</div>
          <button type="button" className="lab-palette-row">
            <span>Eigenvalues</span>
            <span className="lab-palette-meta">Chapter 1</span>
          </button>
        </div>
        <footer className="lab-palette-foot">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
        </footer>
      </div>
    </div>
  );
}

function LabBar({ screen, setScreen, layout, setLayout, collapsed, setCollapsed }) {
  return (
    <div className="lab-bar">
      <span className="lab-badge">
        <span className="lab-badge-dot" />
        LAB
      </span>
      <span className="lab-bar-title">Browser pass · V0 is not the design</span>
      <div className="lab-bar-group">
        <button type="button" className={screen === 'workspace' ? 'is-active' : ''} onClick={() => setScreen('workspace')}>Workspace</button>
        <button type="button" className={screen === 'settings' ? 'is-active' : ''} onClick={() => setScreen('settings')}>Settings</button>
        <button type="button" className={screen === 'export' ? 'is-active' : ''} onClick={() => setScreen('export')}>Export</button>
        <button type="button" className={screen === 'palette' ? 'is-active' : ''} onClick={() => setScreen('palette')}>Palette</button>
      </div>
      <div className="lab-bar-group">
        <button type="button" className={layout === 'continuous' ? 'is-active' : ''} onClick={() => setLayout('continuous')}>Continuous</button>
        <button type="button" className={layout === 'page' ? 'is-active' : ''} onClick={() => setLayout('page')}>Page</button>
      </div>
      <div className="lab-bar-group">
        <button type="button" className={!collapsed ? 'is-active' : ''} onClick={() => setCollapsed(false)}>Sidebar</button>
        <button type="button" className={collapsed ? 'is-active' : ''} onClick={() => setCollapsed(true)}>Collapsed</button>
      </div>
      <span className="lab-bar-note">Annotate the mock; the lab bar is not the product.</span>
    </div>
  );
}

export function Lab() {
  const [screen, setScreen] = useState('workspace');
  const [layout, setLayout] = useState('continuous');
  const [mode, setMode] = useState('edit');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="lab-shell">
      <LabBar
        screen={screen}
        setScreen={setScreen}
        layout={layout}
        setLayout={setLayout}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
      <div className="lab-app">
        <TitleBar />
        <div className="lab-body">
          <Sidebar
            collapsed={collapsed}
            onToggle={() => setCollapsed((value) => !value)}
            onSettings={() => setScreen('settings')}
            onNew={() => undefined}
          />
          <main className="lab-main">
            <Toolbar
              layout={layout}
              setLayout={setLayout}
              mode={mode}
              setMode={setMode}
              onPalette={() => setScreen('palette')}
            />
            {layout === 'continuous' ? <ContinuousCanvas /> : <PageCanvas />}
          </main>
        </div>
        <StatusStrip />
      </div>
      {screen === 'settings' ? <SettingsModal onClose={() => setScreen('workspace')} /> : null}
      {screen === 'export' ? <ExportSheet onClose={() => setScreen('workspace')} /> : null}
      {screen === 'palette' ? <CommandPalette onClose={() => setScreen('workspace')} /> : null}
    </div>
  );
}
