const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const jsPath = path.resolve(__dirname, '../../public/js/index.js');
const jsCode = fs.readFileSync(jsPath, 'utf-8');

function setupDOM() {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <head></head>
        <body>
            <div id="login-container" style="display: block;"></div>
            <div id="room-container" style="display: none;"></div>
            <div id="room-list"></div>
            <div id="disclaimer-modal" class="show"></div>
            <input type="checkbox" id="chkDontShow" />
            <button id="btnCheckJob"></button>
            <button id="btnBackToLogin"></button>
            <button id="btnAcceptDisclaimer"></button>
            <input id="jobCode" />
        </body>
        </html>
    `, {
        url: 'http://localhost/',
        runScripts: 'dangerously'
    });

    // Mock localStorage properly so the main script can access it globally in the dom
    const storage = {};
    const mockLocalStorage = {
        setItem: (key, value) => { storage[key] = value.toString(); },
        getItem: (key) => storage[key] || null,
        removeItem: (key) => { delete storage[key]; },
        clear: () => { for(let k in storage) delete storage[k]; }
    };

    // Assign to dom.window
    Object.defineProperty(dom.window, 'localStorage', {
        value: mockLocalStorage,
        writable: true
    });
    dom.window._storageMock = storage;

    // Prevent issues with navigator.serviceWorker
    Object.defineProperty(dom.window.navigator, 'serviceWorker', {
        value: {
            register: () => Promise.resolve()
        },
        writable: true
    });

    // We can define a mock location object and replace occurrences of `window.location.href`
    // with `window.mockLocationHref` in the source code just for testing.
    let modifiedJsCode = jsCode.replace(/window\.location\.href/g, 'window.mockLocationHref');

    modifiedJsCode += `
        window.proceedAfterDisclaimer = proceedAfterDisclaimer;
        window.setPendingRedirectUrl = function(val) { pendingRedirectUrl = val; };
        window.setPendingRooms = function(val) { pendingRooms = val; };
    `;

    // Run the JS code in the JSDOM environment
    const scriptEl = dom.window.document.createElement('script');
    scriptEl.textContent = modifiedJsCode;
    dom.window.document.body.appendChild(scriptEl);

    // Initial value for our mocked location
    dom.window.mockLocationHref = 'http://localhost/';

    return dom;
}

test('proceedAfterDisclaimer - saves preference if checkbox is checked', () => {
    const dom = setupDOM();
    const window = dom.window;
    const document = window.document;

    document.getElementById('chkDontShow').checked = true;

    // Call function
    window.proceedAfterDisclaimer();

    assert.strictEqual(window._storageMock['kkc_skip_disclaimer'], 'true');
});

test('proceedAfterDisclaimer - does not save preference if checkbox is unchecked', () => {
    const dom = setupDOM();
    const window = dom.window;
    const document = window.document;

    document.getElementById('chkDontShow').checked = false;

    // Call function
    window.proceedAfterDisclaimer();

    assert.strictEqual(window._storageMock['kkc_skip_disclaimer'], undefined);
});

test('proceedAfterDisclaimer - removes "show" class from disclaimer modal', () => {
    const dom = setupDOM();
    const window = dom.window;
    const document = window.document;

    const modal = document.getElementById('disclaimer-modal');
    assert.strictEqual(modal.classList.contains('show'), true);

    // Call function
    window.proceedAfterDisclaimer();

    assert.strictEqual(modal.classList.contains('show'), false);
});

test('proceedAfterDisclaimer - redirects if pendingRedirectUrl is set', () => {
    const dom = setupDOM();
    const window = dom.window;

    window.setPendingRedirectUrl('/viewer.html?job=123&room=Kitchen');

    window.proceedAfterDisclaimer();

    assert.strictEqual(window.mockLocationHref, '/viewer.html?job=123&room=Kitchen');
});

test('proceedAfterDisclaimer - shows room selection if pendingRooms is set', () => {
    const dom = setupDOM();
    const window = dom.window;
    const document = window.document;

    window.setPendingRedirectUrl('');
    window.setPendingRooms(['Kitchen', 'Bathroom']);

    window.proceedAfterDisclaimer();

    // Verify showRoomSelection effects
    assert.strictEqual(document.getElementById('login-container').style.display, 'none');
    assert.strictEqual(document.getElementById('room-container').style.display, 'block');

    const roomList = document.getElementById('room-list');
    assert.strictEqual(roomList.children.length, 2);
    assert.strictEqual(roomList.children[0].innerText, 'Kitchen');
    assert.strictEqual(roomList.children[1].innerText, 'Bathroom');
});
