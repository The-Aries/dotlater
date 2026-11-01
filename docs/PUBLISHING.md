# Edge Store release preparation

**Status: DotLater 1.0, Microsoft Edge first.** GitHub v1.0 manual-install release available to users with repository access; Edge store submission pending.

## Remaining decisions

- [x] Set the working name to **DotLater** in the manifest, options page, package metadata, README and store listing.
- [ ] Complete an independent name / trademark check and verify existing local unpacked installations. **Do not rename the local folder while Edge loads the extension from it.**
- [ ] Perform a manual Windows Edge smoke test. macOS Edge, including the `Command+Shift+X` shortcut and green/yellow toggle, has already been tested.
- [ ] Make a store-ready screenshot showing only the extension's intended workflow. Avoid personal tabs, profiles, private page URLs or browser identifiers.
- [ ] Produce the final, clean ZIP and validate it in a disposable Edge profile.
- [ ] Review the permissions, privacy disclosures and third-party icon license one last time.
- [ ] Decide when to make the repository public, so the privacy policy URL and support documentation are actually accessible.

## Publish to Microsoft Edge Add-ons

Microsoft's Edge developer enrollment currently has **no registration fee**. A developer account in Microsoft Partner Center is required; a personal Microsoft account or a personal GitHub sign-in can be used.

1. Register or sign in to [Microsoft Partner Center](https://partner.microsoft.com/) and enroll in the **Microsoft Edge program** as an individual developer.
2. Open the Edge extensions dashboard and create a new extension.
3. Upload a ZIP whose root contains `manifest.json`, the JS files, icon assets and the settings page. Do not package the containing folder as an extra top-level directory. Exclude tests, temporary profiles and unrelated development files.
4. Provide availability information, the extension's purpose and the three permission justifications below.
5. Complete the **Privacy** section. Disclose the session-stored tab URLs, the synced auto-clear preference and the lack of telemetry or remote code. After publication of a public privacy page, add its working URL.
6. Complete the **Store listing**: an English description of at least 250 characters, the extension's name and short description from `manifest.json`, and a square extension logo. Microsoft recommends **300 × 300 px**, minimum **128 × 128 px**.
7. Optionally add screenshots (**640 × 480** or **1280 × 800**; up to six), a small tile (440 × 280), or a large tile (1400 × 560). Screenshots are useful but not mandatory.
8. Add clear certification instructions: mark and unmark a normal HTTPS page, test the toolbar shortcut and the one-second auto-clear after switching away and back.
9. **Only after reviewing the final submission**, send it for certification. The Microsoft documentation states that review can take up to seven business days; acceptance is not guaranteed.

Official references: [developer enrollment](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account), [publishing workflow](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension), [store policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies).

### Clean ZIP contents

Package only `manifest.json`, the `src/` and `assets/icons/` directories, `LICENSE`, and the third-party license notice at `docs/THIRD_PARTY_LICENSE.txt`. The ZIP must not contain the project directory wrapper. Leave documentation, tests and `.github/` out of the production ZIP except the required notice.

The source ZIP in `~/Downloads/DotLater.zip` is **not** the final store submission: it includes development documentation and tests.

## Draft Edge store listing (English)

**Extension name:** `DotLater`

**Short description for manifest:** Mark a tab for later with a yellow dot. One click or shortcut to toggle; clears automatically when you return.

**Long description:**

> Leave a clear visual reminder on any webpage you want to revisit. DotLater adds a simple green or yellow dot to your Microsoft Edge toolbar: green means the tab is not marked, and yellow means you've marked it for later. When marked, the tab's own favicon becomes a yellow dot, making it easy to spot among many open tabs.
>
> Click the toolbar dot or press Ctrl + Shift + X (Windows) / Command + Shift + X (macOS) to toggle the mark. The default behavior clears the mark after you switch away, return, and stay on the tab for one second. You can adjust the delay or disable automatic clearing in the extension's options. Each tab is marked independently.
>
> No account, server, ads, analytics or page-content tracking. Marks are temporary and stored in the current browser session. The auto-clear preference is stored in browser sync settings and may be synchronized by your browser provider. The extension requires only activeTab, scripting and storage permissions. Local HTML files can also be marked; changing their favicon requires granting file-URL access. Protected PDF viewers may show only the toolbar mark.

**Permissions explanation for Partner Center:**

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Allows an explicit toolbar click or assigned shortcut to operate on the selected webpage, without requesting access to all sites |
| `scripting` | Injects the small script that changes and later restores the tab's favicon |
| `storage` | Retains temporary per-tab mark state within the browser session and saves the user's auto-clear delay preference |

**Certification notes (draft):** Open a normal HTTPS webpage. Click the green toolbar dot or press the configured shortcut: both the toolbar dot and page favicon turn yellow. Click again to restore. Mark the tab, switch to another tab, then return and remain for at least one second: the mark clears. The delay can be changed in Extension options. Local HTML and PDF tabs can be marked; the built-in PDF viewer may only show the toolbar dot.

## GitHub and sponsorship

Before making the repository public, check that the README, icons, license, privacy policy, attribution and installation instructions are final. A public `docs/PRIVACY.md` link is needed if Partner Center requires a public privacy URL.

GitHub's **Sponsor** button is configured through `.github/FUNDING.yml` with `github: The-Aries`. Keep donation handling outside the extension itself.

The owner's GitHub Sponsors profile is approved and public. **Five tiers are published** (verified 2026-11-01): one-time $1/$5/$10, and monthly $2/$5.

References: [GitHub Sponsors onboarding](https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/setting-up-github-sponsors-for-your-personal-account), [GitHub FUNDING.yml](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository).

## Verification already completed

- [x] Local `npm test` unit tests.
- [x] Isolated macOS Edge browser smoke test, including single-page navigation and concurrent marks.
- [x] Real macOS Edge click and keyboard shortcut tests.
- [x] Simple green/yellow icons, no corner badge.
- [x] Minimal permissions and no third-party runtime dependencies.
- [x] MIT notice for Chat Dinger-derived dot artwork.
- [ ] Windows Edge test, final branded assets and release certification.
