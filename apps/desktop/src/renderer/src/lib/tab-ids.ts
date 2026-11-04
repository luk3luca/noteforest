/**
 * DOM IDs shared by the tab strip and the tab panels. Package paths contain
 * slashes, so encode them before they become part of an element ID.
 */
export function tabElementId(packagePath: string): string {
  return `nf-tab-${encodeURIComponent(packagePath)}`;
}

export function tabPanelElementId(packagePath: string): string {
  return `nf-tabpanel-${encodeURIComponent(packagePath)}`;
}
