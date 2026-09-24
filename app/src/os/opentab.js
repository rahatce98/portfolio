/* -----------------------------------------------------------------------------
 * Open a link in a new tab — also from a voice command.
 *
 * Browsers block window.open() that isn't triggered by a click, which is every
 * voice command. They do allow navigating a window this page already opened.
 * So the first tool opened by a tap (or the one-tap fallback button) becomes
 * "the J.A.R.V.I.S. tab", and later voice commands load their tool into it.
 * Returns true when something opened.
 * -------------------------------------------------------------------------- */

let jarvisTab = null;

const alive = () => {
  try {
    return !!jarvisTab && !jarvisTab.closed;
  } catch {
    return false;
  }
};

export function openTab(url) {
  const gesture = navigator.userActivation ? navigator.userActivation.isActive : true;
  if (!gesture && alive()) {
    try {
      jarvisTab.location.href = url;
      jarvisTab.focus?.();
      return true;
    } catch {
      /* fall through to a fresh tab */
    }
  }
  // The opener link is kept on purpose: cutting it (noopener / opener=null)
  // also takes away this page's right to navigate the tab later, which is what
  // lets a voice command load the next tool into it (tested in Chromium).
  const w = window.open(url, '_blank');
  if (!w) return false;
  jarvisTab = w;
  return true;
}
