const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Wait, the error is ReferenceError: file is not defined on line 1611.
// Let's print that line and context.
const lines = code.split('\n');
for(let i=1605; i<1615; i++) {
   console.log(`${i+1}: ${lines[i]}`);
}
