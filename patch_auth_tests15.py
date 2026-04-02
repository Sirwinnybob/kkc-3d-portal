import re

auth_file = 'test/jobsAuth.test.js'

with open(auth_file, 'r') as f:
    content = f.read()

# Restore the original expected logic for tests since we rolled back jobsAuth.js
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
        assert.strictEqual(statusSet, 403);
        assert.strictEqual(sentMessage, 'Forbidden');
    });"""

new_logic = """    await t.test('returns 400 for malformed URI', () => {
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

content = content.replace(old_logic, new_logic)

with open(auth_file, 'w') as f:
    f.write(content)


auth_file2 = 'test/server.test.js'
with open(auth_file2, 'r') as f:
    content2 = f.read()

old_logic2 = """    await t.test('returns 400 Bad Request for malformed URI', async () => {
        const response = await request(app).get('/jobs/%');
        assert.strictEqual(response.status, 403);
    });"""

new_logic2 = """    await t.test('returns 400 Bad Request for malformed URI', async () => {
        const response = await request(app).get('/jobs/%');
        assert.strictEqual(response.status, 400);
    });"""

content2 = content2.replace(old_logic2, new_logic2)

with open(auth_file2, 'w') as f:
    f.write(content2)
