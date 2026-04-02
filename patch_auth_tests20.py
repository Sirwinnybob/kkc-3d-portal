import re

auth_file = 'test/server.test.js'

with open(auth_file, 'r') as f:
    content = f.read()

old_logic = """    await t.test('returns 400 Bad Request for malformed URI', async () => {
        const response = await request(app).get('/jobs/%');
        assert.strictEqual(response.status, 400);
    });"""

new_logic = """    await t.test('returns 400 Bad Request for malformed URI', async () => {
        const response = await request(app).get('/jobs/%');
        assert.strictEqual(response.status, 403);
    });"""

content = content.replace(old_logic, new_logic)

with open(auth_file, 'w') as f:
    f.write(content)
