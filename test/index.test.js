const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const indexJsPath = path.join(__dirname, '../public/js/index.js');
const indexJsContent = fs.readFileSync(indexJsPath, 'utf8');

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
                </body>
            </html>
        `, {
            runScripts: 'dangerously',
            url: 'http://localhost/'
        });

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
        assert.strictEqual(roomList.children[0].innerText, 'Room A');
        assert.strictEqual(roomList.children[1].innerText, 'Room B');
    });
});
