// Optional end-to-end smoke test against an isolated headless Edge profile.
// Requires Edge installed on macOS. Does not touch the user's browser profile.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const edgeBinary = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const root = path.resolve(__dirname, '..');

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function devtoolsConnection(url) {
  const socket = new WebSocket(url);
  await once(socket, 'open');
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const packet = JSON.parse(event.data);
    const task = pending.get(packet.id);
    if (!task) return;
    pending.delete(packet.id);
    packet.error ? task.reject(new Error(packet.error.message)) : task.resolve(packet.result);
  });
  const call = (method, params) => Promise.race([new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      }), delay(5000).then(() => { throw new Error('DevTools command timed out: ' + method); })]);
  return {
    call,
    async eval(expression) {
      const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    },
    close() { socket.close(); }
  };
}

async function main() {
  assert.ok(fs.existsSync(edgeBinary), 'Edge is required');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-unread-smoke-'));
  const copy = path.join(temp, 'extension');
  const profile = path.join(temp, 'edge-profile');
  fs.mkdirSync(copy);
  fs.copyFileSync(path.join(root, 'manifest.json'), path.join(copy, 'manifest.json'));
  fs.cpSync(path.join(root, 'src'), path.join(copy, 'src'), { recursive: true });
  fs.cpSync(path.join(root, 'assets'), path.join(copy, 'assets'), { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json')));
  // Headless CDP invokes the handler directly, so its simulated click cannot
  // grant activeTab. Grant ONLY the local test page in this disposable copy.
  manifest.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(copy, 'manifest.json'), JSON.stringify(manifest));

  const server = http.createServer((req, res) => {
    if (req.url === '/favicon.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#2c82ec"/></svg>');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>Unread test</title><h1>Test</h1>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/`;

  const browser = spawn(edgeBinary, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync',
    `--disable-extensions-except=${copy}`, `--load-extension=${copy}`,
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, url
  ], { stdio: 'ignore' });

  try {
    let debugPort;
    for (let i = 0; i < 80; i++) {
      const devtoolsFile = path.join(profile, 'DevToolsActivePort');
      if (fs.existsSync(devtoolsFile)) {
        debugPort = Number(fs.readFileSync(devtoolsFile, 'utf8').split('\n')[0]);
        break;
      }
      if (browser.exitCode !== null) throw new Error('Headless Edge exited unexpectedly');
      await delay(100);
    }
    assert.ok(debugPort, 'Edge DevTools was not available');
    console.error('SMOKE: Edge launched');

    let targets;
    for (let i = 0; i < 80; i++) {
      targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      if (targets.some((target) => target.type === 'service_worker' && target.url.endsWith('/src/background.js')) &&
          targets.some((target) => target.type === 'page' && target.url === url)) break;
      await delay(100);
    }
    const workerTarget = targets.find((target) => target.type === 'service_worker' && target.url.endsWith('/src/background.js'));
    const pageTarget = targets.find((target) => target.type === 'page' && target.url === url);
    assert.ok(workerTarget, `Extension worker not found: ${JSON.stringify(targets.map((t) => t.url))}`);
    assert.ok(pageTarget, 'Test page not found');
    console.error('SMOKE: targets found');

    const worker = await devtoolsConnection(workerTarget.webSocketDebuggerUrl);
    const page = await devtoolsConnection(pageTarget.webSocketDebuggerUrl);
    const getFavicon = () => page.eval('document.querySelector("link[rel~=icon]").getAttribute("href")');
    const baseline = await getFavicon();
    console.error('SMOKE: page evaluated');
    assert.equal(baseline, '/favicon.svg');
    console.error('SMOKE: worker check', await worker.eval('1+1'));
    console.error('SMOKE: worker globals', await worker.eval('typeof toggleTab + "," + typeof chrome.tabs'));
    const registeredCommands = await worker.eval('chrome.commands.getAll()');
    const actionCommand = registeredCommands.find((item) => item.name === '_execute_action');
    assert.ok(actionCommand, 'Edge must register the action keyboard shortcut');
    assert.equal(actionCommand.shortcut, '⇧⌘X', 'macOS Edge should register Command+Shift+X');
    const tabId = await worker.eval(`(async()=>{const tabs=await chrome.tabs.query({});return tabs.find(t=>t.id&&t.url===${JSON.stringify(url)})?.id;})()`);
    console.error('SMOKE: tab discovered');
    assert.ok(tabId, 'Unable to find test tab');
    const toggle = () => worker.eval(`toggleTab({id:${tabId},url:${JSON.stringify(url)}})`);
    const titleFor = (id) => worker.eval(`chrome.action.getTitle({tabId:${id}})`);
    assert.equal(await titleFor(tabId), 'Mark as unread', 'Read tab must use the green default action');
    await toggle();
    console.error('SMOKE: first toggle');
    assert.equal(await titleFor(tabId), 'Mark as read', 'Marking must set unread state on this tab');
    const marked = await getFavicon();
    assert.match(marked, /^data:image\/png;base64,/);
    assert.notEqual(marked, baseline);
    const sourceArt = fs.readFileSync(path.join(root, 'assets/icons/chat-dinger-unread.png')).toString('base64');
    assert.equal(marked, 'data:image/png;base64,' + sourceArt, 'Marked favicon must exactly match Chat Dinger');
    const pixels = await page.eval(`(async () => {
      const img = new Image();
      img.src = document.querySelector('link[rel~="icon"]').href;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
      return {center: pixel(16, 16), outline: pixel(3, 16)};
    })()`);
    assert.ok(pixels.center[0] > 230 && pixels.center[1] > 170 && pixels.center[2] < 135,
      `Center dot should be yellow: ${pixels.center}`);
    assert.ok(pixels.outline[0] < 80 && pixels.outline[1] < 80 && pixels.outline[2] < 90,
      `Dot should have a dark border: ${pixels.outline}`);

    await page.call('Page.enable', {});
    await page.call('Page.reload', {});
    let reloaded = false;
    for (let i = 0; i < 40; i++) {
      try { reloaded = (await getFavicon()) === marked; } catch { /* page still loading */ }
      if (reloaded) break;
      await delay(100);
    }
    assert.ok(reloaded, 'Unread mark was not restored after reloading the same URL');
    await toggle();
    assert.equal(await getFavicon(), baseline);
    assert.equal(await titleFor(tabId), 'Mark as unread', 'Unmarking must restore the read state');
    // Shared storage must not lose one tab's state when two clicks overlap.
    const parallelUrl = url + '?parallel';
    const parallelTabId = await worker.eval(`(async() => (await chrome.tabs.create({url:${JSON.stringify(parallelUrl)},active:false})).id)()`);
    assert.ok(parallelTabId);
    await worker.eval(`Promise.all([serializeMutation(()=>toggleTab({id:${tabId},url:${JSON.stringify(url)}})),serializeMutation(()=>toggleTab({id:${parallelTabId},url:${JSON.stringify(parallelUrl)}}))])`);
    const bothMarked = await worker.eval(`(async()=>{const s=(await chrome.storage.session.get('markedTabs')).markedTabs;return !!s[${tabId}] && !!s[${parallelTabId}];})()`);
    assert.equal(bothMarked, true, 'Concurrent tab toggles must preserve both marks');
    await worker.eval(`Promise.all([serializeMutation(()=>toggleTab({id:${tabId},url:${JSON.stringify(url)}})),serializeMutation(()=>toggleTab({id:${parallelTabId},url:${JSON.stringify(parallelUrl)}}))])`);
    await worker.eval(`chrome.tabs.remove(${parallelTabId})`);
    assert.equal(await getFavicon(), baseline);
    for (let i = 0; i < 12; i++) {
      await toggle();
      assert.match(await getFavicon(), /^data:image\/png;base64,/);
      await toggle();
      assert.equal(await getFavicon(), baseline);
    }
    // Same-document navigation does not remove the favicon DOM. It must be
    // unmarked just like a full navigation to a different URL.
    await toggle();
    await page.eval('history.pushState({}, "", "/?spa")');
    let spaCleared = false;
    for (let i = 0; i < 35; i++) {
      spaCleared = await getFavicon() === baseline && await titleFor(tabId) === 'Mark as unread';
      if (spaCleared) break;
      await delay(100);
    }
    assert.ok(spaCleared, 'SPA navigation must restore favicon and toolbar state');
    await page.eval('history.replaceState({}, "", "/")');
    // A marked tab stays unread after switching away, then clears only after
    // a continuous one-second look at it on return (the new default).
    await toggle();
    const nextTabId = await worker.eval(`(async () => (await chrome.tabs.create({url:${JSON.stringify(url + '?second')},active:true})).id)()`);
    assert.ok(nextTabId);
    assert.equal(await titleFor(tabId), 'Mark as read', 'Inactive marked tab remains unread');
    assert.equal(await titleFor(nextTabId), 'Mark as unread', 'Other tab remains read independently');
    await delay(1100);
    assert.equal(await getFavicon(), marked, 'Leaving a marked tab must not clear it');
    await worker.eval(`chrome.tabs.update(${tabId},{active:true})`);
    await delay(350);
    assert.equal(await getFavicon(), marked, 'Returning for less than one second must not clear it');
    await delay(1500);
    assert.equal(await getFavicon(), baseline, 'One second of viewing after return should auto-clear');
    assert.equal(await titleFor(tabId), 'Mark as unread', 'Auto-clear must restore green toolbar state');
    await worker.eval(`chrome.tabs.remove(${nextTabId})`);

    // Local HTML can be marked even when Edge has not granted file-URL
    // injection. Its toolbar indicator must never depend on script access.
    const localFile = path.join(temp, 'example.html');
    fs.writeFileSync(localFile, '<!doctype html><title>Local HTML test</title><p>Local file</p>');
    const localUrl = 'file://' + localFile;
    const localTabId = await worker.eval(`(async()=> (await chrome.tabs.create({url:${JSON.stringify(localUrl)},active:true})).id)()`);
    await delay(450);
    const actualLocalUrl = await worker.eval(`(async()=> (await chrome.tabs.get(${localTabId})).url)()`);
    await worker.eval(`toggleTab({id:${localTabId},url:${JSON.stringify(actualLocalUrl)}})`);
    assert.equal(await titleFor(localTabId), 'Mark as read', 'Local HTML must be markable');
    await worker.eval(`toggleTab({id:${localTabId},url:${JSON.stringify(actualLocalUrl)}})`);
    assert.equal(await titleFor(localTabId), 'Mark as unread', 'Local HTML must be unmarkable');
    await worker.eval(`chrome.tabs.remove(${localTabId})`);

    // Local PDF files open in Edge's internal viewer, where extensions may
    // be unable to alter the favicon. Marking must still work via the toolbar.
    const pdfPath = path.join(temp, 'example.pdf');
    const pdfObjects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length 43 >>\nstream\nBT /F1 14 Tf 30 250 Td (DotLater PDF) Tj ET\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let pdfText = '%PDF-1.4\n';
    const positions = [0];
    for (let i = 0; i < pdfObjects.length; i++) {
      positions.push(Buffer.byteLength(pdfText));
      pdfText += `${i + 1} 0 obj\n${pdfObjects[i]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdfText);
    pdfText += `xref\n0 ${pdfObjects.length + 1}\n0000000000 65535 f \n`;
    for (const position of positions.slice(1)) pdfText += `${String(position).padStart(10, '0')} 00000 n \n`;
    pdfText += `trailer\n<< /Root 1 0 R /Size ${pdfObjects.length + 1} >>\nstartxref\n${xref}\n%%EOF\n`;
    fs.writeFileSync(pdfPath, pdfText);
    const pdfUrl = 'file://' + pdfPath;
    const pdfTabId = await worker.eval(`(async()=> (await chrome.tabs.create({url:${JSON.stringify(pdfUrl)},active:true})).id)()`);
    await delay(700);
    const actualPdfUrl = await worker.eval(`(async()=> (await chrome.tabs.get(${pdfTabId})).url)()`);
    await worker.eval(`toggleTab({id:${pdfTabId},url:${JSON.stringify(actualPdfUrl)}})`);
    assert.equal(await titleFor(pdfTabId), 'Mark as read', 'Local PDF tab must be markable');
    await worker.eval(`toggleTab({id:${pdfTabId},url:${JSON.stringify(actualPdfUrl)}})`);
    assert.equal(await titleFor(pdfTabId), 'Mark as unread', 'Local PDF tab must be unmarkable');
    await worker.eval(`chrome.tabs.remove(${pdfTabId})`);

    // A protected browser page cannot run content scripts, but we can still
    // track its tab using only the toolbar dot and the return timer.
    const protectedTabId = await worker.eval(`(async()=> (await chrome.tabs.create({url:'edge://settings/',active:true})).id)()`);
    await delay(550);
    const protectedUrl = await worker.eval(`(async()=> (await chrome.tabs.get(${protectedTabId})).url)()`);
    await worker.eval(`toggleTab({id:${protectedTabId},url:${JSON.stringify(protectedUrl)}})`);
    assert.equal(await titleFor(protectedTabId), 'Mark as read', 'Protected tabs must allow a toolbar-only mark');
    const fallback = await worker.eval(`(async()=> (await chrome.storage.session.get('markedTabs')).markedTabs[${protectedTabId}]?.fallback)()`);
    assert.equal(fallback, true, 'Protected tab must use the toolbar-only fallback');
    await worker.eval(`chrome.tabs.update(${tabId},{active:true})`);
    await delay(250);
    await worker.eval(`chrome.tabs.update(${protectedTabId},{active:true})`);
    await delay(1550);
    assert.equal(await titleFor(protectedTabId), 'Mark as unread', 'Returning to a protected tab must auto-clear the toolbar mark');
    await worker.eval(`chrome.tabs.remove(${protectedTabId})`);
    console.log('PASS: per-tab state, local HTML/PDF, protected-page fallback, reload and auto-clear');
    worker.close();
    page.close();
  } finally {
    browser.kill('SIGTERM');
    server.close();
    await delay(300);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
