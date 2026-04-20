export class UIManager {
    constructor(options = {}) {
        this.options = options;
        this.isShowroomMode = options.isShowroomMode || false;
    }

    init() {
        this.setupShare();
        this.setupMenu();
        this.setupHelp();
        this.setupTour();
        this.setupLightMode();

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                    active.blur();
                    return;
                }
                this.closeActiveModals();
            }
        });
    }

    setupShare() {
        const shareBtn = document.getElementById('share-btn');
        const shareModal = document.getElementById('share-modal');
        const shareModalClose = document.getElementById('share-modal-close');
        const shareLinkDisplay = document.getElementById('share-link-display');
        const copyShareLinkBtn = document.getElementById('copy-share-link-btn');

        this.toggleShare = (show) => {
            if (shareModal) {
                shareModal.classList.toggle('show', show);
                if (show) {
                    const fullUrl = window.location.origin + window.location.pathname + window.location.search;
                    if (shareLinkDisplay) shareLinkDisplay.textContent = fullUrl;

                    if (copyShareLinkBtn) {
                        copyShareLinkBtn.classList.remove('copied');
                        copyShareLinkBtn.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span>Copy Link</span>
                        `;
                    }
                    if (shareModalClose) shareModalClose.focus();
                } else {
                    if (shareBtn) shareBtn.focus();
                }
            }
        };

        if (shareBtn) shareBtn.onclick = () => this.toggleShare(true);
        if (shareModalClose) shareModalClose.onclick = () => this.toggleShare(false);
        if (shareModal) {
            shareModal.addEventListener('click', (e) => {
                if (e.target === shareModal) this.toggleShare(false);
            });
        }

        let shareCopyTimeout;
        if (copyShareLinkBtn) {
            copyShareLinkBtn.addEventListener("click", () => {
                if (!shareLinkDisplay) return;
                const link = shareLinkDisplay.textContent;
                navigator.clipboard.writeText(link).then(() => {
                    copyShareLinkBtn.classList.add('copied');
                    copyShareLinkBtn.setAttribute('aria-label', 'Link Copied!');
                    copyShareLinkBtn.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Copied!</span>
                    `;
                    if (shareCopyTimeout) clearTimeout(shareCopyTimeout);
                    shareCopyTimeout = setTimeout(() => {
                        copyShareLinkBtn.classList.remove('copied');
                        copyShareLinkBtn.setAttribute('aria-label', 'Copy Link');
                        copyShareLinkBtn.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span>Copy Link</span>
                        `;
                        shareCopyTimeout = null;
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy share link:', err);
                });
            };
        }
    }

    setupMenu() {
        const menuBtn = document.getElementById('menu-btn');
        const dropdown = document.getElementById('dropdown-menu');

        if (menuBtn && dropdown) {
            menuBtn.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
                const isExpanded = dropdown.classList.contains('show');
                menuBtn.setAttribute('aria-expanded', isExpanded.toString());
            };
            window.addEventListener('pointerdown', (e) => {
                const menuContainer = document.getElementById('menu-container');
                if (menuContainer && !menuContainer.contains(e.target)) {
                    dropdown.classList.remove('show');
                    menuBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }
    }

    setupHelp() {
        const helpBtn = document.getElementById('help-btn');
        const helpModal = document.getElementById('help-modal');
        const closeHelpX = document.getElementById('close-help-x');
        const closeHelpBtn = document.getElementById('close-help-btn');

        this.toggleHelp = (show) => {
            if (helpModal) {
                helpModal.classList.toggle('show', show);
                if (show) {
                    if (closeHelpBtn) closeHelpBtn.focus();
                } else {
                    if (helpBtn) helpBtn.focus();
                }
            }
        };

        if (helpBtn) helpBtn.onclick = () => this.toggleHelp(true);
        if (closeHelpX) closeHelpX.onclick = () => this.toggleHelp(false);
        if (closeHelpBtn) closeHelpBtn.onclick = () => this.toggleHelp(false);
        if (helpModal) {
            helpModal.addEventListener('click', (e) => {
                if (e.target === helpModal) this.toggleHelp(false);
            });
        }

        if (localStorage.getItem('kkc_help_shown') !== 'true' && localStorage.getItem('kkc_tutorial_v1') === 'true') {
            this.toggleHelp(true);
            localStorage.setItem('kkc_help_shown', 'true');
        }
    }

    setupTour() {
        const tourEl   = document.getElementById('product-tour');
        const tourMask = document.getElementById('tour-mask');
        const tourTip  = document.getElementById('tour-tooltip');
        const tourDots = document.getElementById('tour-step-dots');
        const tourHead = document.getElementById('tour-title');
        const tourBody = document.getElementById('tour-desc');
        const tourNext = document.getElementById('tour-next');
        const tourSkip = document.getElementById('tour-skip');
        if (!tourEl) return;

        const STEPS = [
            { target: '#menu-btn',           title: 'Project Menu',           desc: 'Switch rooms, adjust sensitivity, or log out.',                               tip: 'bottom-right' },
            { target: '#help-btn',           title: 'Help & Controls',        desc: 'Tap here anytime to see the full controls reference.',                        tip: 'bottom-left'  },
            { target: '#texture-btn',        title: 'Texture Library',        desc: 'Browse and swap materials from the KKC catalog.',                             tip: 'left'         },
            { target: '#camera-btn',         title: 'Render Photo',           desc: 'Save a high-res photo. Texture changes are logged in the watermark.',         tip: 'left'         },
            { target: '#joystick-container', title: 'Zoom Joystick',          desc: 'Drag up to zoom in, drag down to zoom out.',                                  tip: 'left'         },
            { target: null,                  title: 'Tap to Change Textures', desc: 'Tap any surface on the model to swap its texture. Choose <b>Paint Mode</b> to quickly paint multiple surfaces one by one.', tip: 'center' },
        ];

        let step = 0;

        function buildDots() {
            if (!tourDots) return;
            tourDots.innerHTML = '';
            STEPS.forEach((_, i) => {
                const dot = document.createElement('div');
                dot.className = 'tour-dot' + (i === step ? ' active' : '');
                tourDots.appendChild(dot);
            });
        }

        function updateTourUI() {
            const current = STEPS[step];
            if (tourHead) tourHead.textContent = current.title;
            if (tourBody) tourBody.innerHTML = current.desc;

            if (tourNext) tourNext.textContent = (step === STEPS.length - 1) ? 'Got it!' : 'Next';
            if (tourSkip) tourSkip.style.display = (step === STEPS.length - 1) ? 'none' : 'block';

            buildDots();

            if (tourMask) tourMask.style.display = 'none';
            if (tourTip) tourTip.className = 'tour-tooltip ' + current.tip;

            if (current.target) {
                const targetEl = document.querySelector(current.target);
                if (targetEl && tourMask) {
                    const rect = targetEl.getBoundingClientRect();
                    const pad = 8;
                    tourMask.style.display = 'block';
                    tourMask.style.left = (rect.left - pad) + 'px';
                    tourMask.style.top = (rect.top - pad) + 'px';
                    tourMask.style.width = (rect.width + pad * 2) + 'px';
                    tourMask.style.height = (rect.height + pad * 2) + 'px';
                }
            }
        }

        const endTour = () => {
            tourEl.classList.remove('show');
            localStorage.setItem('kkc_tutorial_v1', 'true');
            if (localStorage.getItem('kkc_help_shown') !== 'true') {
                if (this.toggleHelp) this.toggleHelp(true);
                localStorage.setItem('kkc_help_shown', 'true');
            }
        };

        if (tourNext) {
            tourNext.onclick = () => {
                if (step < STEPS.length - 1) {
                    step++;
                    updateTourUI();
                } else {
                    endTour();
                }
            };
        }

        if (tourSkip) {
            tourSkip.onclick = endTour;
        }

        if (localStorage.getItem('kkc_tutorial_v1') !== 'true') {
            tourEl.classList.add('show');
            updateTourUI();
        }
    }

    setupLightMode() {
        const lightModeBtn = document.getElementById('light-mode-btn');
        if (lightModeBtn) {
            const updateLightModeUI = () => {
                const isLightMode = localStorage.getItem("lightMode") === "true";
                if (isLightMode) {
                    lightModeBtn.style.background = '#e0e0e0';
                } else {
                    lightModeBtn.style.background = '#fff';
                }
            };

            lightModeBtn.addEventListener('click', () => {
                const isLightMode = localStorage.getItem("lightMode") === "true";
                const newMode = !isLightMode;
                localStorage.setItem("lightMode", newMode);
                updateLightModeUI();
                window.dispatchEvent(new CustomEvent('lightmodechange', { detail: { isLightMode: newMode } }));
            });

            updateLightModeUI();
        }
    }

    closeActiveModals() {
        // Priority 1: Product Tour
        const tour = document.getElementById('product-tour');
        if (tour?.classList.contains('show')) {
            document.getElementById('tour-skip')?.click();
            return true;
        }

        // Priority 2: Help Modal
        const helpModal = document.getElementById('help-modal');
        if (helpModal?.classList.contains('show')) {
            document.getElementById('close-help-btn')?.click();
            return true;
        }

        // Priority 3: Share Modal
        const shareModal = document.getElementById('share-modal');
        if (shareModal?.classList.contains('show')) {
            document.getElementById('share-modal-close')?.click();
            return true;
        }

        // Priority 4: PIN Modal
        const pinModal = document.getElementById('pin-modal');
        if (pinModal?.classList.contains('show')) {
            document.getElementById('pin-modal-close')?.click();
            return true;
        }

        // Priority 5: Showroom Panel
        const showroomPanel = document.getElementById('showroom-panel');
        if (showroomPanel?.classList.contains('show')) {
            document.getElementById('showroom-panel-close')?.click();
            return true;
        }

        // Priority 6: Quick Picker
        const quickPicker = document.getElementById('quick-picker');
        if (quickPicker?.classList.contains('show')) {
            document.getElementById('qp-close')?.click();
            return true;
        }

        // Priority 7: Tap-to-Replace Sheet
        const tapReplaceSheet = document.getElementById('tap-replace-sheet');
        if (tapReplaceSheet?.classList.contains('show')) {
            document.getElementById('tap-replace-cancel')?.click();
            return true;
        }

        // Priority 8: Texture Panel
        const texturePanel = document.getElementById('texture-panel');
        if (texturePanel?.classList.contains('show')) {
            document.getElementById('close-texture-btn')?.click();
            return true;
        }

        // Priority 9: Dropdown Menu
        const dropdown = document.getElementById('dropdown-menu');
        if (dropdown?.classList.contains('show')) {
            document.getElementById('menu-btn')?.click();
            return true;
        }

        return false;
    }
}
