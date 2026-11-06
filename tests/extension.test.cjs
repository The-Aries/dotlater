const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function contentHarness(initialIcons = [], safari = false) {
  let messageListener;
  let visibilityListener;
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const sent = [];
  class Link {
    constructor(rel = 'icon', href = '') {
      this.tagName = 'LINK';
      this.rel = rel;
      this.attributes = new Map([['rel', rel], ['href', href]]);
    }
    get href() { return this.getAttribute('href') || ''; }
    set href(value) { this.setAttribute('href', value); }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    remove() { head.links = head.links.filter((link) => link !== this); }
  }
  const head = {
    links: initialIcons.map(([rel, href]) => new Link(rel, href)),
    appendChild(link) { this.links.push(link); },
    querySelectorAll() { return this.links.filter((link) => link.rel.split(/\s+/).includes('icon')); }
  };
  class Observer {
    constructor(callback) {
      this.callback = callback;
      Observer.latest = this;
      (Observer.instances ||= []).push(this);
    }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
    simulateChange() { if (this.active) this.callback(); }
  }
  const document = {
    head, hidden: false, title: 'Wikipedia', createElement: () => new Link(),
    addEventListener(type, fn) { if (type === 'visibilitychange') visibilityListener = fn; }
  };
  const context = {
    document, MutationObserver: Observer,
    navigator: safari
      ? { vendor: 'Apple Computer, Inc.', userAgent: 'Version/26.4 Safari/605.1.15' }
      : { vendor: 'Google Inc.', userAgent: 'Chrome/156.0 Safari/537.36' },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    chrome: {
      runtime: {
        onMessage: { addListener(fn) { messageListener = fn; } },
        sendMessage(message) { sent.push(message); return Promise.resolve(); }
      }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/content.js'), 'utf8'), context);
  return {
    head, Observer, sent, document,
    toggle(marked, icon = 'data:image/png;base64,MARKED', autoClearSeconds = 1) {
      messageListener({ type: 'setUnreadMark', marked, icon, markId: 'test-mark', autoClearSeconds });
    },
    visible(isVisible) {
      document.hidden = !isVisible;
      visibilityListener();
    },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      now = end;
    }
  };
}

test('click on/off preserves the original favicon and its link', () => {
  const page = contentHarness([['icon', 'https://chatgpt.com/favicon.ico']]);
  const link = page.head.links[0];
  page.toggle(true);
  assert.equal(link.href, 'data:image/png;base64,MARKED');
  assert.equal(link.getAttribute('data-tab-unread-original'), 'https://chatgpt.com/favicon.ico');
  page.toggle(false);
  assert.equal(link.href, 'https://chatgpt.com/favicon.ico');
  assert.equal(page.head.links[0], link);
  assert.equal(link.hasAttribute('data-tab-unread-original'), false);
});

test('works with multiple favicon links, restores each independently', () => {
  const page = contentHarness([['icon', '/16.png'], ['shortcut icon', '/32.png']]);
  page.head.links[0].setAttribute('type', 'image/svg+xml');
  page.toggle(true);
  assert.equal(page.head.links[0].href, 'data:image/png;base64,MARKED');
  assert.equal(page.head.links[1].href, 'data:image/png;base64,MARKED');
  assert.equal(page.head.links[0].getAttribute('type'), 'image/png');
  page.toggle(false);
  assert.equal(page.head.links[0].href, '/16.png');
  assert.equal(page.head.links[1].href, '/32.png');
  assert.equal(page.head.links[0].getAttribute('type'), 'image/svg+xml');
  assert.equal(page.head.links[1].getAttribute('type'), null);
});

test('missing favicon gets a temporary link removed when unmarked', () => {
  const page = contentHarness();
  page.toggle(true);
  assert.equal(page.head.links.length, 1);
  page.toggle(false);
  assert.equal(page.head.links.length, 0);
});

test('site changes favicon while marked: the current underlying icon restores', () => {
  const page = contentHarness([['icon', '/original.ico']]);
  page.toggle(true);
  const link = page.head.links[0];
  link.href = '/new.ico';
  page.Observer.latest.simulateChange();
  assert.equal(link.href, 'data:image/png;base64,MARKED');
  page.toggle(false);
  assert.equal(link.href, '/new.ico');
});

test('Safari shows a title marker and restores the latest site title', () => {
  const page = contentHarness([['icon', '/favicon.ico']], true);
  page.toggle(true);
  assert.equal(page.document.title, '🟡 Wikipedia');
  page.document.title = 'Updated Wikipedia';
  page.Observer.instances.forEach((observer) => observer.simulateChange());
  assert.equal(page.document.title, '🟡 Updated Wikipedia');
  page.toggle(false);
  assert.equal(page.document.title, 'Updated Wikipedia');
  page.toggle(true);
  page.toggle(false);
  assert.equal(page.document.title, 'Updated Wikipedia');
});

test('Safari preserves titles that already start with the marker', () => {
  const page = contentHarness([], true);
  page.document.title = '🟡 Original site title';
  page.toggle(true);
  assert.equal(page.document.title, '🟡 🟡 Original site title');
  page.toggle(false);
  assert.equal(page.document.title, '🟡 Original site title');
});

test('Chromium pages keep their original title', () => {
  const page = contentHarness([['icon', '/favicon.ico']]);
  page.toggle(true);
  assert.equal(page.document.title, 'Wikipedia');
  page.toggle(false);
  assert.equal(page.document.title, 'Wikipedia');
});

test('manifest grants per-click rather than all-sites permissions', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.name, 'DotLater');
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.action.default_popup, undefined);
  assert.deepEqual(manifest.commands, {
    _execute_action: { suggested_key: { default: 'Ctrl+Shift+X', mac: 'Command+Shift+X' } }
  });
  // Reserved action shortcuts reuse chrome.action.onClicked. No new
  // content-script permission or separate event handler is necessary.
  assert.equal(manifest.permissions.includes('commands'), false);
  assert.equal(manifest.background.service_worker, 'src/background.js');
  assert.deepEqual(manifest.background.scripts, ['src/unread-icon.js', 'src/background.js']);
  assert.equal(manifest.options_page, 'src/options.html');
});

test('toolbar defaults to a green dot and marked tabs use a yellow dot without badges', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.version, '1.0');
  for (const size of ['16', '32', '48', '128']) {
    assert.equal(manifest.icons[size], `assets/icons/green-dot-${size}.png`);
    assert.equal(manifest.action.default_icon[size], manifest.icons[size]);
    assert.ok(fs.existsSync(path.join(root, `assets/icons/dot-${size}.png`)));
    assert.ok(fs.existsSync(path.join(root, `assets/icons/green-dot-${size}.png`)));
  }
  const background = fs.readFileSync(path.join(root, 'src/background.js'), 'utf8');
  assert.match(background, /files: \["src\/content\.js"\]/);
  assert.match(background, /chrome\.action\.setIcon\(\{ tabId, path: marked \? YELLOW_ICON : GREEN_ICON \}\)/);
  assert.doesNotMatch(background, /chrome\.action\.setBadge/);
});

test('cross-browser background scripts initialize without service-worker importScripts', () => {
  // Firefox runs Manifest V3 background.scripts as an event page rather than
  // a service worker. It loads the icon file before the main script.
  const listeners = { addListener() {} };
  const context = vm.createContext({
    chrome: {
      action: { onClicked: listeners },
      tabs: { onUpdated: listeners, onRemoved: listeners, onActivated: listeners },
      windows: { onFocusChanged: listeners },
      runtime: { onMessage: listeners, onInstalled: listeners }
    },
    console
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'src/unread-icon.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/background.js'), 'utf8'), context);
  assert.match(vm.runInContext('UNREAD_ICON_DATA', context), /^data:image\/png;base64,/);
  assert.equal(vm.runInContext('typeof toggleTab', context), 'function');
});

test('first installation opens the public guide once, never on updates', async () => {
  let installed;
  const opened = [];
  const listeners = { addListener() {} };
  const context = vm.createContext({
    chrome: {
      action: { onClicked: listeners },
      tabs: {
        onUpdated: listeners, onRemoved: listeners, onActivated: listeners,
        create({ url }) { opened.push(url); return Promise.resolve(); }
      },
      windows: { onFocusChanged: listeners },
      runtime: {
        onMessage: listeners,
        onInstalled: { addListener(fn) { installed = fn; } }
      }
    },
    console
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'src/unread-icon.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/background.js'), 'utf8'), context);
  assert.equal(typeof installed, 'function');
  installed({ reason: 'update' });
  assert.equal(opened.length, 0);
  installed({ reason: 'install' });
  assert.deepEqual(opened, ['https://the-aries.github.io/dotlater/']);
});

test('settings page remains local and links to the public guide', () => {
  const html = fs.readFileSync(path.join(root, 'src/options.html'), 'utf8');
  assert.match(html, /https:\/\/the-aries.github.io\/dotlater\//);
  assert.match(html, /auto-clear/);
  assert.match(html, /options.js/);
});

test('staying on the tab after marking does not auto-clear', () => {
  const page = contentHarness([['icon', '/favicon.ico']]);
  page.toggle(true);
  page.advance(15000);
  assert.equal(page.sent.length, 0);
});

test('returning for one full second clears, but the time spent away does not', () => {
  const page = contentHarness([['icon', '/favicon.ico']]);
  page.toggle(true);
  page.advance(1000);
  page.visible(false);
  page.advance(15000);
  assert.equal(page.sent.length, 0);
  page.visible(true);
  page.advance(999);
  assert.equal(page.sent.length, 0);
  page.advance(1);
  assert.equal(page.sent[0].type, 'autoClearUnread');
  assert.equal(page.sent[0].markId, 'test-mark');
  assert.equal(page.sent.length, 1);
});

test('leaving again before one second cancels the first countdown', () => {
  const page = contentHarness([['icon', '/favicon.ico']]);
  page.toggle(true);
  page.visible(false);
  page.visible(true);
  page.advance(400);
  page.visible(false);
  page.advance(20000);
  assert.equal(page.sent.length, 0);
  page.visible(true);
  page.advance(999);
  assert.equal(page.sent.length, 0);
  page.advance(1);
  assert.equal(page.sent.length, 1);
});

test('instant and manual modes keep the click-to-toggle workflow', () => {
  const page = contentHarness([['icon', '/favicon.ico']]);
  page.toggle(true, undefined, 0);
  page.visible(false);
  page.visible(true);
  assert.equal(page.sent.length, 1);
  page.toggle(false);
  page.toggle(true, undefined, -1);
  page.visible(false);
  page.visible(true);
  page.advance(10000);
  assert.equal(page.sent.length, 1);
});
