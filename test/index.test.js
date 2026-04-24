const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const indexJsPath = path.join(__dirname, '../public/js/index.js');
const indexJsContent = fs.readFileSync(indexJsPath, 'utf8').replace("import { escapeHtml } from './utils.js';", '');

test('frontend index.js proceedAfterDisclaimer', async (t) => {
    let dom;

    t.beforeEach(() => {
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
                <body>
                    <input type="checkbox" id="chkDontShow" />
                    <div id="disclaimer-modal" class="show"></div>
                    <div id="login-container"></div>
                    <div id="room-container"></div>
                    <div id="room-list"></div>
                    <input type="text" id="jobCode" />
                    <button id="btnCheckJob">View My Job</button>
                    <div id="errorMsg" style="display:none"></div>
                </body>
            </html>
        `, {
            runScripts: 'dangerously',
            url: 'http://localhost/'
        });

        // Mock escapeHtml if needed (though it might not be used in proceedAfterDisclaimer)
        dom.window.escapeHtml = (s) => s;

        // Mock localStorage
        let store = {};
        const localStorageMock = {
            getItem: (key) => store[key] || null,
            setItem: (key, value) => { store[key] = value.toString(); },
            clear: () => { store = {}; }
        };
        Object.defineProperty(dom.window, 'localStorage', { value: localStorageMock });

        // Change window.location behavior for test intercept
        const scriptContent = `
            // Change how we modify window location slightly for test intercept
            // If window._mockLocation is set, update that instead
            ${indexJsContent.replace('window.location.href = pendingRedirectUrl;', 'if (window._mockLocation) { window._mockLocation.href = pendingRedirectUrl; } else { window.location.href = pendingRedirectUrl; }')}

            // Expose a way to set global variables from tests
            window.setGlobals = function(url, rooms) {
                pendingRedirectUrl = url;
                pendingRooms = rooms;
            };
        `;

        const script = dom.window.document.createElement('script');
        script.textContent = scriptContent;
        dom.window.document.body.appendChild(script);

        dom.window._mockLocation = {
            href: 'http://localhost/'
        };
    });

    await t.test('Scenario 1: Sets localStorage if chkDontShow is checked', () => {
        dom.window.localStorage.clear();
        const chkDontShow = dom.window.document.getElementById('chkDontShow');
        chkDontShow.checked = true;

        dom.window.proceedAfterDisclaimer();
        assert.strictEqual(dom.window.localStorage.getItem('kkc_skip_disclaimer'), 'true');
    });

    await t.test('Scenario 2: Does not set localStorage if chkDontShow is unchecked', () => {
        dom.window.localStorage.clear();
        const chkDontShow = dom.window.document.getElementById('chkDontShow');
        chkDontShow.checked = false;

        dom.window.proceedAfterDisclaimer();
        assert.strictEqual(dom.window.localStorage.getItem('kkc_skip_disclaimer'), null);
    });

    await t.test('Scenario 3: Removes "show" class from disclaimer-modal', () => {
        const modal = dom.window.document.getElementById('disclaimer-modal');
        modal.classList.add('show');
        assert.strictEqual(modal.classList.contains('show'), true);

        dom.window.proceedAfterDisclaimer();
        assert.strictEqual(modal.classList.contains('show'), false);
    });

    await t.test('Scenario 4: Redirects to pendingRedirectUrl if set', () => {
        dom.window.setGlobals('/viewer.html?job=123', null);

        dom.window.proceedAfterDisclaimer();
        assert.strictEqual(dom.window._mockLocation.href, '/viewer.html?job=123');
    });

    await t.test('Scenario 5: Calls showRoomSelection if pendingRooms is set and pendingRedirectUrl is empty', () => {
        dom.window.setGlobals('', ['Room A', 'Room B']);

        dom.window.proceedAfterDisclaimer();

        const loginContainer = dom.window.document.getElementById('login-container');
        const roomContainer = dom.window.document.getElementById('room-container');
        const roomList = dom.window.document.getElementById('room-list');

        assert.strictEqual(loginContainer.style.display, 'none');
        assert.strictEqual(roomContainer.style.display, 'block');
        assert.strictEqual(roomList.children.length, 2);
        assert.strictEqual(roomList.children[0].textContent, 'Room A');
        assert.strictEqual(roomList.children[1].textContent, 'Room B');
    });

    await t.test('Scenario 6: Does not throw if chkDontShow is completely missing from DOM', () => {
        dom.window.localStorage.clear();
        const chkDontShow = dom.window.document.getElementById('chkDontShow');
        chkDontShow.remove(); // Remove element completely

        dom.window.proceedAfterDisclaimer();
        assert.strictEqual(dom.window.localStorage.getItem('kkc_skip_disclaimer'), null);
    });

    await t.test('Scenario 7: Does nothing if pendingRedirectUrl and pendingRooms are both empty/null', () => {
        dom.window.setGlobals('', null);

        // Reset location to ensure it doesn't change
        dom.window._mockLocation.href = 'http://localhost/';

        const loginContainer = dom.window.document.getElementById('login-container');
        const roomContainer = dom.window.document.getElementById('room-container');
        loginContainer.style.display = 'block';
        roomContainer.style.display = 'none';

        dom.window.proceedAfterDisclaimer();

        assert.strictEqual(dom.window._mockLocation.href, 'http://localhost/');
        assert.strictEqual(loginContainer.style.display, 'block');
        assert.strictEqual(roomContainer.style.display, 'none');
    });

    await t.test('Scenario 8: Input event hides error message and resets aria-invalid', () => {
        const input = dom.window.document.getElementById('jobCode');
        const errorMsg = dom.window.document.getElementById('errorMsg');

        // Setup error state
        errorMsg.style.display = 'block';
        input.setAttribute('aria-invalid', 'true');

        // Trigger input event
        input.value = 'a';
        input.dispatchEvent(new dom.window.Event('input'));

        assert.strictEqual(errorMsg.style.display, 'none');
        assert.strictEqual(input.getAttribute('aria-invalid'), null);
    });

    await t.test('Scenario 9: Input event updates button text for 5-digit PIN', () => {
        const input = dom.window.document.getElementById('jobCode');
        const btn = dom.window.document.getElementById('btnCheckJob');

        // Initially 'View My Job'
        btn.innerText = 'View My Job';

        // 4 digits -> still 'View My Job'
        input.value = '1234';
        input.dispatchEvent(new dom.window.Event('input'));
        assert.strictEqual(btn.innerText, 'View My Job');

        // 5 digits -> 'Enter Showroom'
        input.value = '12345';
        input.dispatchEvent(new dom.window.Event('input'));
        assert.strictEqual(btn.innerText, 'Enter Showroom');

        // 6 digits -> back to 'View My Job'
        input.value = '123456';
        input.dispatchEvent(new dom.window.Event('input'));
        assert.strictEqual(btn.innerText, 'View My Job');
    });
});
