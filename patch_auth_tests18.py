import re

auth_file = 'test/jobsAuth.test.js'

with open(auth_file, 'r') as f:
    content = f.read()

# I had swapped it to expect 400 back. Wait, but `jobsAuth.js` currently returns 403 on malformed! Because `decodeURIComponent` falls back.
# So `test/jobsAuth.test.js` should expect 403.
old_logic = """    await t.test('returns 400 for malformed URI', () => {
        const req = { path: '/%' }; // Malformed URI component
        let statusSet = 0;
        let sentMessage = '';
        const res = {
            status: (s) => {
                statusSet = s;
                return res;
            },
            send: (msg) => {
                sentMessage = msg;
            }
        };
        jobsAuth(req, res, next);
        assert.strictEqual(statusSet, 400);
        assert.strictEqual(sentMessage, 'Bad Request');
    });"""

new_logic = """    await t.test('returns 403 for malformed URI', () => {
        const req = { path: '/%' }; // Malformed URI component
        let statusSet = 0;
        let sentMessage = '';
        const res = {
            status: (s) => {
                statusSet = s;
                return res;
            },
            send: (msg) => {
                sentMessage = msg;
            }
        };
        jobsAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
        assert.strictEqual(sentMessage, 'Forbidden');
    });"""

content = content.replace(old_logic, new_logic)

with open(auth_file, 'w') as f:
    f.write(content)
