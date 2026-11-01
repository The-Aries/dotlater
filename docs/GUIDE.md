# Usage

## Mark tabs

![DotLater green-to-yellow tab marker in Microsoft Edge](../assets/demo.gif)

| Action | Result |
| --- | --- |
| Click the **green dot** | Mark for later; toolbar turns yellow |
| Click the **yellow dot** | Remove mark; toolbar turns green |
| Press **Ctrl + Shift + X** (Windows/Linux) or **⌘ + Shift + X** (Mac) | Toggle the mark |
| Switch away, then return for **1 second** | Automatically clear the mark |

The tab's favicon also becomes a yellow dot **when Edge allows the page to be modified**. Tabs that cannot run the content script (such as the built-in PDF viewer) can still be marked by the toolbar dot. Marks apply to individual tabs.

## Settings

Open **DotLater → Extension options** in `edge://extensions`.

**Auto-clear on return:** Immediately · 1 second (default) · 2 seconds · 5 seconds · Manual only.

**Custom shortcut:** Open `edge://extensions/shortcuts`.

**Local HTML files:** If you want the actual tab favicon to change for `file://` pages, turn on **Allow access to file URLs** under DotLater's Edge extension details. Without this permission, you can still use the toolbar-only mark.

## Quick Start

| Method | How |
| --- | --- |
| **Microsoft Edge Add-ons** | Install from the store once DotLater is published; the listing link will be added then |
| **GitHub Releases** | [Download v1.0 ZIP](https://github.com/The-Aries/dotlater/releases/download/v1.0/DotLater-v1.0.zip), extract it, open `edge://extensions`, enable **Developer mode**, choose **Load unpacked** and select the extracted folder containing `manifest.json` |

No approved Edge store listing is available yet. The GitHub Release provides manual installation files; the source repository can also be loaded unpacked for development. See [Development](DEVELOPMENT.md).

## Limits

- Ordinary web pages and local HTML can show the yellow **tab favicon**. Local files require Edge file-URL access.
- PDFs and protected Edge pages may only show the yellow **toolbar dot**, because Edge does not allow extensions to change their page contents. Where Edge disables the extension action entirely, no mark can be applied.
- Closing a tab or ending the browser session removes its mark. Navigating to a different URL also clears it.
- Edge on macOS has been tested; other browsers are not officially supported.
