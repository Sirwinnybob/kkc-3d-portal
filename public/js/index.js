let currentJob = '';
let pendingRedirectUrl = '';
let pendingRooms = null;

function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

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
        btn.style.margin = '5px 0';
        btn.style.padding = '10px';
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
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .catch(() => { /* Silence errors */ });
    });
}

document.addEventListener('DOMContentLoaded', () => {
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
        input.addEventListener('input', () => {
            const errorMsg = document.getElementById('errorMsg');
            if (errorMsg) errorMsg.style.display = 'none';
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const disclaimerModal = document.getElementById('disclaimer-modal');
            const roomContainer = document.getElementById('room-container');

            if (disclaimerModal && disclaimerModal.classList.contains('show')) {
                disclaimerModal.classList.remove('show');
                const checkBtn = document.getElementById('btnCheckJob');
                if (checkBtn) checkBtn.focus();
            } else if (roomContainer && roomContainer.style.display === 'block') {
                backToLogin();
                if (input) input.focus();
            }
        }
    });

    // --- SHOWROOM ---
    const showroomBtn = document.getElementById('btnShowroom');

    if (showroomBtn) {
        showroomBtn.addEventListener('click', () => {
            window.location.href = '/viewer.html?mode=showroom';
        });
    }
});
