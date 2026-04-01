import re

auth_file = 'test/server.test.js'

with open(auth_file, 'r') as f:
    content = f.read()

content = content.replace("assert.strictEqual(response.status, 400);", "assert.strictEqual(response.status, 403);")

with open(auth_file, 'w') as f:
    f.write(content)
