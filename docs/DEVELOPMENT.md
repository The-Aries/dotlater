# Development

DotLater uses Manifest V3, plain JavaScript, and no runtime or npm dependencies.

## Repository layout

```text
manifest.json        Extension entry point (must remain at repository root)
src/                 Background worker, content script, options page
assets/icons/        Green and yellow dot PNG assets
docs/                Usage, privacy, third-party credits, publishing
tests/               Unit tests and isolated Edge integration test
.github/             GitHub repository settings and sponsorship preparation
```

## Test

Requires Node.js 22+ and, for browser integration tests, Microsoft Edge on macOS.

```sh
npm test
npm run test:browser
```

The browser test launches a disposable Edge profile using only the extension's production files. It doesn't touch the everyday Edge profile. The default shortcut is verified in that profile and was also tested with real keyboard input in Edge on macOS.

## Permissions and storage

`activeTab` grants access to the current tab when the user clicks the icon or invokes the shortcut. `scripting` changes and restores the favicon; `storage` retains temporary session marks and the delay preference. No host permissions, telemetry or account are required. On first installation only, the browser opens the public guide; the site is not involved in tab marking or storage.

See [PRIVACY.md](PRIVACY.md) for details.

## Public documentation site

GitHub Pages publishes the static [index.html](index.html) from the
main branch's /docs folder. No custom build workflow or site dependencies
are needed. On installation only, DotLater opens
https://the-aries.github.io/dotlater/. The extension's options page remains
local to the browser so the auto-clear setting works without internet access.
Keep all executable extension logic in src/, not on GitHub Pages.

## Build packages for multiple browsers

All browser versions share the same JavaScript, HTML, options, and icons.
The root manifest contains both supported background declarations for local
development. Store ZIPs are generated from it, with only browser-specific
metadata changed. Do not copy or edit separate versions of the source files.

    npm test
    npm run build

The build creates these packages in the ignored dist directory:

| Package | Background runtime | Distribution |
| --- | --- | --- |
| chrome | Manifest V3 service worker | Chrome Web Store |
| edge | Manifest V3 service worker | Microsoft Edge Add-ons |
| firefox | Background scripts, plus Mozilla ID and data-collection declaration | Firefox Add-ons (AMO) |
| safari | Background scripts | Safari Web Extension packager / Xcode |

Run one target with, for example:

    node scripts/build.cjs firefox

Build folders can be loaded as unpacked extensions during testing.
Chrome and Edge packages require no access to Mozilla-specific metadata.
Firefox store/release installations require Mozilla signing; the ZIP is
the unsigned source submission, not a signed XPI.
Safari distribution requires Apple Developer Program membership and a
signed containing app. Apple's Safari Web Extension packager in App Store
Connect can convert the Safari ZIP without requiring a separate native
source tree; the existing Xcode conversion project is only an optional
local packaging/test route.

The ZIPs are not published automatically. A browser version can be
submitted to its store independently, but all releases should derive
from the same Git commit and use coordinated version numbers.

## Licenses and credits

DotLater code is [MIT licensed](../LICENSE), including permission for commercial use. Its yellow-dot icon originated from [Chat Dinger](https://github.com/rumblelab/chatdinger) (MIT), with a green color variant. The original copyright and license notice are preserved in [THIRD_PARTY_LICENSE.txt](THIRD_PARTY_LICENSE.txt).

The simple marking workflow was also informed by [Mark this tab!](https://github.com/esin/markThisTab). DotLater is independent of both projects.
