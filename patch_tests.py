import re

auth_test = 'test/jobsAuth.test.js'
with open(auth_test, 'r') as f:
    content = f.read()
content = content.replace("assert.strictEqual(statusSet, 400);", "assert.strictEqual(statusSet, 403);")
content = content.replace("assert.strictEqual(sentMessage, 'Bad Request');", "assert.strictEqual(sentMessage, 'Forbidden');")
with open(auth_test, 'w') as f:
    f.write(content)

server_test = 'test/server.test.js'
with open(server_test, 'r') as f:
    content = f.read()
content = content.replace("returns 400 Bad Request for malformed URI", "returns 403 Forbidden for malformed URI")
content = content.replace("assert.strictEqual(response.status, 400);", "assert.strictEqual(response.status, 403);")
with open(server_test, 'w') as f:
    f.write(content)
