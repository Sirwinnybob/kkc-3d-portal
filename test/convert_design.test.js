const assert = require('assert');
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const JOBS_DIR = path.join(__dirname, 'test_jobs');

test('convertDesign behavior', async (t) => {
    t.beforeEach(() => {
        if (fs.existsSync(JOBS_DIR)) {
            fs.rmSync(JOBS_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(JOBS_DIR, { recursive: true });
    });

    t.afterEach(() => {
        if (fs.existsSync(JOBS_DIR)) {
            fs.rmSync(JOBS_DIR, { recursive: true, force: true });
        }
    });

    await t.test('server handles mock conversion correctly', async () => {
        // Setup mock environment
        const roomDir = path.join(JOBS_DIR, 'Room 1');
        fs.mkdirSync(roomDir);
        fs.writeFileSync(path.join(roomDir, '3D.dae'), '<mock dae content>');

        // Create a dummy assimp executable so processQueue doesn't error out
        // Actually, assimp will just error and we can ignore it, the goal is to make sure convertDesign queues it

        return new Promise((resolve, reject) => {
            const server = spawn('node', ['../server.js'], {
                env: { ...process.env, PORT: 5099, JOBS_DIR: JOBS_DIR },
                cwd: __dirname
            });

            let stdout = '';
            let stderr = '';

            server.stdout.on('data', data => {
                stdout += data.toString();
                // Check if processQueue outputted a failure or success about 'Room 1'
                // This indicates convertDesign successfully queued it.
                if (stdout.includes('FAILED] 3D:') || stdout.includes('FAILED] Room 1') || stdout.includes('SUCCESS: Room 1')) {
                    server.kill();
                    assert(true);
                    resolve();
                }
            });

            server.stderr.on('data', data => {
                stderr += data.toString();
                if (stderr.includes('FAILED] 3D:') || stderr.includes('FAILED] Room 1') || stderr.includes('SUCCESS: Room 1')) {
                    server.kill();
                    assert(true);
                    resolve();
                }
            });

            server.on('close', code => {
                if (code !== 0 && code !== null) {
                    console.error('Server exited with error:', stderr);
                    reject(new Error(`Server exited with code ${code}`));
                }
            });

            // Timeout safety
            setTimeout(() => {
                server.kill();
                reject(new Error('Test timed out - conversion was not queued. Output: ' + stdout + ' Stderr: ' + stderr));
            }, 5000);
        });
    });
});
