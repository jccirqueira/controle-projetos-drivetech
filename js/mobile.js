/**
 * Mobile Navigation Module
 * Handles mobile menu toggle, overlay, and responsive behaviors
 */

export const mobileNav = {
    init() {
        this.createMobileElements();
        this.setupEventListeners();
    },

    createMobileElements() {
        // Check if elements already exist
        if (document.querySelector('.mobile-menu-btn')) return;

        // Create mobile menu button
        const menuBtn = document.createElement('button');
        menuBtn.className = 'mobile-menu-btn';
        menuBtn.setAttribute('aria-label', 'Toggle menu');
        menuBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';

        // Add to document
        document.body.insertBefore(menuBtn, document.body.firstChild);
        document.body.insertBefore(overlay, document.body.firstChild);

        // Store references
        this.menuBtn = menuBtn;
        this.overlay = overlay;
        this.sidebar = document.querySelector('.sidebar');
    },

    setupEventListeners() {
        if (!this.menuBtn || !this.overlay || !this.sidebar) return;

        // Toggle menu on button click
        this.menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // Close menu on overlay click
        this.overlay.addEventListener('click', () => {
            this.closeMenu();
        });

        // Close menu on nav item click (mobile)
        const navItems = this.sidebar.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                // Small delay to allow navigation
                setTimeout(() => this.closeMenu(), 100);
            });
        });

        // Close menu on window resize to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                this.closeMenu();
            }
        });

        // Prevent body scroll when menu is open
        this.preventBodyScroll();
    },

    toggleMenu() {
        const isOpen = this.sidebar.classList.contains('active');
        if (isOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    },

    openMenu() {
        this.sidebar.classList.add('active');
        this.overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Update button icon
        this.menuBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
    },

    closeMenu() {
        this.sidebar.classList.remove('active');
        this.overlay.classList.remove('active');
        document.body.style.overflow = '';

        // Update button icon
        this.menuBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    },

    preventBodyScroll() {
        // Prevent scroll on touch devices when menu is open
        let touchStartY = 0;

        document.addEventListener('touchstart', (e) => {
            if (this.sidebar.classList.contains('active') &&
                !this.sidebar.contains(e.target)) {
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (this.sidebar.classList.contains('active') &&
                !this.sidebar.contains(e.target)) {
                e.preventDefault();
            }
        }, { passive: false });
    }
};

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        mobileNav.init();
    });
} else {
    mobileNav.init();
}
