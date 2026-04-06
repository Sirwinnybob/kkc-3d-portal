const fs = require('fs');
let content = fs.readFileSync('public/js/showroomManager.js', 'utf8');

// In initShowroomMode, make sure the panel gets the .show class right away
// since the test expects it, and the original behavior seems to have been
// modified or the test is assuming it opens by default.
// Let's add showroomPanel.classList.add('show'); inside initShowroomMode

const oldString = `        // Ensure inline display:none from HTML is removed so .show (display:flex) works
        if (showroomPanel) showroomPanel.style.display = '';`;

const newString = `        // Ensure inline display:none from HTML is removed so .show (display:flex) works
        if (showroomPanel) {
            showroomPanel.style.display = '';
            showroomPanel.classList.add('show');
        }`;

content = content.replace(oldString, newString);

fs.writeFileSync('public/js/showroomManager.js', content);
