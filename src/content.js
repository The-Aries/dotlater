// Executed on demand only after a toolbar click. All changes stay inside this tab.
if (!globalThis.__tabUnreadToggleInstalled) {
  globalThis.__tabUnreadToggleInstalled = true;
  const ORIGINAL = "data-tab-unread-original";
  const ORIGINAL_TYPE = "data-tab-unread-original-type";
  const TYPE_WAS_ABSENT = "__absent__";
  const ADDED = "data-tab-unread-added";
  const SAFARI_MARK = "🟡 ";
  const safari = typeof navigator !== "undefined" &&
    navigator.vendor === "Apple Computer, Inc." &&
    /Safari\//.test(navigator.userAgent) &&
    !/(?:Chrome|Chromium|Edg|OPR)\//.test(navigator.userAgent);
  const overlayState = {
    observer: null, icon: "", markId: "", hasLeft: false,
    autoClearSeconds: 1, clearTimer: null, titleObserver: null
  };

  function stopTitleMark() {
    overlayState.titleObserver?.disconnect();
    overlayState.titleObserver = null;
    if (safari && document.title.startsWith(SAFARI_MARK)) {
      document.title = document.title.slice(SAFARI_MARK.length);
    }
  }

  function startTitleMark() {
    if (!safari) return;
    // Always add our own prefix, even when the site's original title starts
    // with the same symbol. Removing one prefix restores the original title.
    document.title = SAFARI_MARK + document.title;
    const ensureMark = () => {
      if (!document.title.startsWith(SAFARI_MARK)) {
        document.title = SAFARI_MARK + document.title;
      }
    };
    ensureMark();
    overlayState.titleObserver = new MutationObserver(ensureMark);
    overlayState.titleObserver.observe(document.head, {
      childList: true, characterData: true, subtree: true
    });
  }

  function cancelAutoClear() {
    if (overlayState.clearTimer !== null) clearTimeout(overlayState.clearTimer);
    overlayState.clearTimer = null;
  }

  function requestAutoClear() {
    const markId = overlayState.markId;
    if (!markId || !overlayState.icon || document.hidden) return;
    // The service worker validates this ID so an old timer cannot clear a
    // newer manual mark on the same tab.
    chrome.runtime.sendMessage({ type: "autoClearUnread", markId }).catch(() => {});
  }

  function onVisibilityChange() {
    cancelAutoClear();
    if (!overlayState.icon) return;
    if (document.hidden) {
      overlayState.hasLeft = true;
      return;
    }
    // Marking a tab while reading it must not start the countdown.
    // The first switch AWAY arms the next return.
    if (!overlayState.hasLeft || overlayState.autoClearSeconds < 0) return;
    if (overlayState.autoClearSeconds === 0) requestAutoClear();
    else overlayState.clearTimer = setTimeout(
      requestAutoClear, overlayState.autoClearSeconds * 1000
    );
  }

  document.addEventListener("visibilitychange", onVisibilityChange);

  function isIcon(link) {
    return link.tagName === "LINK" && link.rel.split(/\s+/).includes("icon");
  }

  function originalHref(link) {
    return link.getAttribute("href") || "";
  }

  function markLinks() {
    const links = [...document.head.querySelectorAll('link[rel~="icon"]')];
    if (!links.length) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute(ADDED, "");
      link.href = overlayState.icon;
      document.head.appendChild(link);
      return;
    }
    for (const link of links) {
      if (!link.hasAttribute(ADDED)) {
        if (!link.hasAttribute(ORIGINAL)) link.setAttribute(ORIGINAL, originalHref(link));
        if (!link.hasAttribute(ORIGINAL_TYPE)) link.setAttribute(ORIGINAL_TYPE, link.getAttribute("type") ?? TYPE_WAS_ABSENT);
        else if (originalHref(link) !== overlayState.icon) {
          // If the website changed its icon, remember the latest underlying URL.
          link.setAttribute(ORIGINAL, originalHref(link));
        }
      }
      if (originalHref(link) !== overlayState.icon) link.setAttribute("href", overlayState.icon);
      if (link.getAttribute("type") !== "image/png") link.setAttribute("type", "image/png");
    }
  }

  function updateMark({ marked, icon, markId = "", autoClearSeconds = 1 }) {
    overlayState.observer?.disconnect();
    overlayState.observer = null;
    if (overlayState.titleObserver) stopTitleMark();
    cancelAutoClear();
    if (!marked) {
      for (const link of document.head.querySelectorAll('link[rel~="icon"]')) {
        if (link.hasAttribute(ADDED)) link.remove();
        else if (link.hasAttribute(ORIGINAL)) {
          const previous = link.getAttribute(ORIGINAL);
          if (previous) link.setAttribute("href", previous);
          else link.removeAttribute("href");
          link.removeAttribute(ORIGINAL);
          const previousType = link.getAttribute(ORIGINAL_TYPE);
          if (previousType === TYPE_WAS_ABSENT) link.removeAttribute("type");
          else if (previousType != null) link.setAttribute("type", previousType);
          link.removeAttribute(ORIGINAL_TYPE);
        }
      }
      overlayState.icon = "";
      overlayState.markId = "";
      overlayState.hasLeft = false;
      return;
    }

    // Re-injecting after a reload while the tab is hidden should arm it.
    overlayState.hasLeft = document.hidden;
    overlayState.markId = markId;
    overlayState.autoClearSeconds = autoClearSeconds;
    overlayState.icon = icon;
    startTitleMark();
    markLinks();
    overlayState.observer = new MutationObserver(() => {
      overlayState.observer.disconnect();
      markLinks();
      overlayState.observer.observe(document.head, {
        attributes: true, attributeFilter: ["href", "rel", "type"], childList: true, subtree: true
      });
    });
    overlayState.observer.observe(document.head, {
      attributes: true, attributeFilter: ["href", "rel", "type"], childList: true, subtree: true
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "setUnreadMark") updateMark(message);
  });
}
