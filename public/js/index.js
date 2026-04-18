let currentJob = '';
let pendingRedirectUrl = '';
let pendingRooms = null;

async function checkJob() {
    const code = document.getElementById('jobCode').value.trim();
    if (!code) return;

    // PIN logic: 5 digits means showroom PIN
    if (/^\d{5}$/.test(code)) {
        window.location.href = `/viewer.html?mode=showroom&pin=${code}`;
        return;
    }

    const btn = document.getElementById('btnCheckJob');
    const errorMsg = document.getElementById('errorMsg');
    
    const originalText = btn.innerText;
    btn.innerText = 'Checking...';
    btn.disabled = true;
    errorMsg.style.display = 'none';

    try {
        const response = await fetch(`/api/job/${encodeURIComponent(code)}`);
        const data = await response.json();

        if (response.ok) {
            currentJob = code;
            if (data.rooms.length === 1) {
                pendingRedirectUrl = `/viewer.html?job=${encodeURIComponent(code)}&room=${encodeURIComponent(data.rooms[0])}`;
                pendingRooms = null;
            } else {
                pendingRedirectUrl = '';
                pendingRooms = data.rooms;
            }
            
            // CHECK PREFERENCE: If they checked "Don't show again", skip the modal
            if (localStorage.getItem('kkc_skip_disclaimer') === 'true') {
                proceedAfterDisclaimer();
            } else {
                const modal = document.getElementById('disclaimer-modal');
                modal.classList.add('show');
                const acceptBtn = document.getElementById('btnAcceptDisclaimer');
                if (acceptBtn) acceptBtn.focus();
            }
        } else {
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        console.error(err);
        alert("Could not connect to server.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function proceedAfterDisclaimer() {
    // SAVE PREFERENCE: If the checkbox is checked, remember it
    const chkDontShow = document.getElementById('chkDontShow');
    if (chkDontShow && chkDontShow.checked) {
        localStorage.setItem('kkc_skip_disclaimer', 'true');
    }

    document.getElementById('disclaimer-modal').classList.remove('show');

    // Return focus to check button after dismissing
    const checkBtn = document.getElementById('btnCheckJob');
    if (checkBtn) checkBtn.focus();
    
    if (pendingRedirectUrl) {
        window.location.href = pendingRedirectUrl;
    } else if (pendingRooms) {
        showRoomSelection(pendingRooms);
    }
}

function showRoomSelection(rooms) {
    document.getElementById('login-container').style.display = 'none';
    const roomContainer = document.getElementById('room-container');
    const roomList = document.getElementById('room-list');
    roomList.innerHTML = '';

    rooms.forEach((room, index) => {
        const btn = document.createElement('button');
        btn.textContent = room;
        btn.className = 'room-btn';
        btn.id = `room-btn-${index}`;
        btn.addEventListener('click', () => {
            window.location.href = `/viewer.html?job=${encodeURIComponent(currentJob)}&room=${encodeURIComponent(room)}`;
        });
        roomList.appendChild(btn);
    });

    roomContainer.style.display = 'block';
    const firstBtn = document.getElementById('room-btn-0');
    if (firstBtn) firstBtn.focus();
}

function backToLogin() {
    document.getElementById('room-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'block';

    // Return focus to check button after backing out
    const checkBtn = document.getElementById('btnCheckJob');
    if (checkBtn) checkBtn.focus();
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .catch(() => { /* Silence errors */ });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Global Escape Key Listener
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const disclaimerModal = document.getElementById('disclaimer-modal');
            if (disclaimerModal && disclaimerModal.classList.contains('show')) {
                proceedAfterDisclaimer();
            } else {
                const roomContainer = document.getElementById('room-container');
                if (roomContainer && roomContainer.style.display === 'block') {
                    backToLogin();
                }
            }
        }
    });

    // Backdrop click for disclaimer modal
    const disclaimerModal = document.getElementById('disclaimer-modal');
    if (disclaimerModal) {
        disclaimerModal.addEventListener('click', (e) => {
            if (e.target === disclaimerModal) {
                proceedAfterDisclaimer();
            }
        });
    }

    const checkBtn = document.getElementById('btnCheckJob');
    const backBtn = document.getElementById('btnBackToLogin');
    const acceptBtn = document.getElementById('btnAcceptDisclaimer');
    const input = document.getElementById('jobCode');

    if (checkBtn) checkBtn.addEventListener('click', checkJob);
    if (backBtn) backBtn.addEventListener('click', backToLogin);
    if (acceptBtn) acceptBtn.addEventListener('click', proceedAfterDisclaimer);

    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkJob();
        });

        // Hide error message when user starts typing
        input.addEventListener('input', () => {
            const errorMsg = document.getElementById('errorMsg');
            if (errorMsg) errorMsg.style.display = 'none';
        });
    }

    // --- SHOWROOM ---
    const showroomBtn = document.getElementById('btnShowroom');

    if (showroomBtn) {
        showroomBtn.addEventListener('click', () => {
            window.location.href = '/viewer.html?mode=showroom';
        });
    }
});
