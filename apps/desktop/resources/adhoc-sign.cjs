/**
 * electron-builder afterPack hook: ad-hoc sign the macOS bundle.
 *
 * There is no Developer ID in the local build (option A), and electron-builder
 * skips signing entirely when no identity exists. A copied Electron.app then
 * carries a signature whose resources no longer match the bundle, which macOS
 * reports as invalid. An ad-hoc signature makes the bundle internally
 * consistent (it is still not notarized and a downloaded copy would be
 * quarantined, by design).
 */
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
