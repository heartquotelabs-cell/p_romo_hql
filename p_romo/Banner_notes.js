// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCZCAwncuoDuy033ZrEquCwRvYpacBs8xM",
    authDomain: "heartquotecommunity.firebaseapp.com",
    projectId: "heartquotecommunity",
    storageBucket: "heartquotecommunity.firebasestorage.app",
    messagingSenderId: "346084161963",
    appId: "1:346084161963:web:f7ed56dc4a4599f4befaee",
    measurementId: "G-JGKWQP35QB"
};

let analytics = null;
let firebaseInitialized = false;
let promotionConfig = null;
let currentVersion = '1.0.0'; // Default version for images

// ===== LOAD PROMOTION FROM JSON =====
async function loadPromotionConfig() {
    try {
        const response = await fetch('notes_promotion.json?t=' + Date.now());
        console.log('✅ JSON loaded with cache busting');
        
        if (!response.ok) {
            throw new Error('Failed to load promotion config');
        }
        
        const config = await response.json();
        promotionConfig = config;
        
        // Store the version from JSON for image cache busting
        currentVersion = config.version || '1.0.0';
        console.log('📋 Config version:', currentVersion);
        
        return config;
    } catch (error) {
        console.error('❌ Error loading promotion config:', error);
        return getDefaultConfig();
    }
}

// ===== STYLE APPLICATION HELPER =====
function applyStyles(element, styles) {
    if (!styles || typeof styles !== 'object') return;
    Object.entries(styles).forEach(([key, value]) => {
        if (key === 'hover') return; // Handle hover separately
        element.style[key] = value;
    });
}

// ===== FIREBASE FUNCTIONS =====
function loadFirebaseScripts() {
    return new Promise((resolve) => {
        if (firebaseInitialized) {
            resolve(true);
            console.log('🔥 Firebase already loaded');
            return;
        }

        if (window.firebase && window.firebase.analytics) {
            initializeFirebase();
            resolve(true);
            return;
        }

        const script1 = document.createElement('script');
        script1.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js';
        
        script1.onload = () => {
            const script2 = document.createElement('script');
            script2.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-analytics.js';
            
            script2.onload = () => {
                initializeFirebase();
                resolve(true);
            };
            
            script2.onerror = () => resolve(false);
            document.head.appendChild(script2);
        };
        
        script1.onerror = () => resolve(false);
        document.head.appendChild(script1);
    });
}

function initializeFirebase() {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        analytics = firebase.analytics();
        analytics.setAnalyticsCollectionEnabled(true);
        firebaseInitialized = true;
        console.log('🔥 Firebase initialized');
    } catch (error) {
        console.error('❌ Firebase init error:', error);
    }
}

// ===== SAFE TRACKING =====
function safeTrackEvent(eventName, params = {}) {
    if (!firebaseInitialized || !analytics) return false;
    try {
        analytics.logEvent(eventName, params);
        return true;
    } catch (error) {
        return false;
    }
}

// ===== PROMOTION WIDGET CREATION =====
async function initPromotion() {
    console.log('🚀 Starting promotion widget...');
    
    const promotionElements = document.querySelectorAll('.promotion');
    if (promotionElements.length === 0) {
        console.log('⚠️ No .promotion elements found');
        return;
    }
    
    // Check global visibility setting
    const config = await loadPromotionConfig();
    if (config.settings && config.settings.visible === false) {
        console.log('📢 Promotions are hidden by config');
        promotionElements.forEach(el => el.style.display = 'none');
        return;
    }
    
    // Apply container styles
    if (config.settings && config.settings.containerStyles) {
        promotionElements.forEach(el => {
            applyStyles(el, config.settings.containerStyles);
        });
    }
    
    const promotions = config.promotions || [];
    
    // Filter visible promotions
    const visiblePromotions = promotions.filter(p => p.visible !== false);
    
    if (visiblePromotions.length === 0) {
        console.log('⚠️ No visible promotions');
        return;
    }
    
    console.log(`📦 Loading ${visiblePromotions.length} promotion(s) with version: ${currentVersion}`);
    
    // Clear and create widgets
    promotionElements.forEach((element, elementIndex) => {
        element.innerHTML = '';
        
        const promoIndex = elementIndex % visiblePromotions.length;
        createPromotionWidget(element, visiblePromotions[promoIndex], elementIndex);
    });
    
    // Load Firebase in background
    setTimeout(() => {
        loadFirebaseScripts().then(() => {
            setTimeout(() => {
                visiblePromotions.forEach((promo, idx) => {
                    if (promo.tracking) {
                        safeTrackEvent('promotion_impression', {
                            promotion_name: promo.tracking.promotionName || 'unknown',
                            promotion_id: promo.tracking.promotionId || 'unknown'
                        });
                    }
                });
            }, 2000);
        });
    }, 3000);
}

function createPromotionWidget(container, promo, index) {
    const styles = promo.styles || {};
    
    // Create widget container
    const widget = document.createElement('div');
    widget.className = `promotion-widget promotion-${promo.id}`;
    
    // Apply widget styles
    if (styles.widget) {
        applyStyles(widget, styles.widget);
    }
    
    // Store hover styles
    if (styles.widgetHover) {
        widget.addEventListener('mouseenter', () => {
            applyStyles(widget, styles.widgetHover);
        });
        widget.addEventListener('mouseleave', () => {
            // Reset to original styles
            widget.style.cssText = '';
            applyStyles(widget, styles.widget);
            updateNightModeStyles(widget, promo);
        });
    }
    
    // Create image WITH VERSION CACHE BUSTING
    const img = document.createElement('img');
    // Add version parameter from JSON to force cache update when version changes
    img.src = `${promo.logo}?v=${currentVersion}`;
    img.alt = promo.name;
    img.setAttribute('data-version', currentVersion); // For debugging
    if (styles.image) {
        applyStyles(img, styles.image);
    }
    
    // Create content container
    const content = document.createElement('div');
    if (styles.content) {
        applyStyles(content, styles.content);
    }
    
    // Create title
    const title = document.createElement('div');
    title.className = 'promo-title';
    title.textContent = promo.name;
    if (styles.title) {
        applyStyles(title, styles.title);
    }
    
    // Create description
    const desc = document.createElement('div');
    desc.className = 'promo-description';
    desc.textContent = promo.description;
    if (styles.description) {
        applyStyles(desc, styles.description);
    }
    
    // Create button
    const button = document.createElement('button');
    button.className = 'promo-button';
    button.textContent = promo.buttonText;
    if (styles.button) {
        applyStyles(button, styles.button);
    }
    
    // Button hover effects
    if (styles.buttonHover) {
        button.addEventListener('mouseenter', () => {
            applyStyles(button, styles.buttonHover);
        });
        button.addEventListener('mouseleave', () => {
            button.style.cssText = '';
            applyStyles(button, styles.button);
        });
    }
    
    // Button click
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (promo.tracking) {
            safeTrackEvent('promotion_click', {
                promotion_name: promo.tracking.promotionName || 'unknown',
                button_text: promo.buttonText
            });
        }
        
        window.open(promo.link, '_blank');
    });
    
    // Assemble widget
    content.appendChild(title);
    content.appendChild(desc);
    
    widget.appendChild(img);
    widget.appendChild(content);
    widget.appendChild(button);
    
    container.appendChild(widget);
    
    // Log image URL with version for debugging
    console.log(`🖼️ Image loaded: ${promo.name} (v${currentVersion})`);
    
    // Check initial night mode
    if (document.body.classList.contains('night-mode')) {
        applyNightModeStyles(widget, promo);
    }
}

// ===== NIGHT MODE HANDLING =====
function applyNightModeStyles(widget, promo) {
    const nightStyles = promo.styles?.nightMode;
    if (!nightStyles) return;
    
    // Apply night mode styles to widget
    if (nightStyles.widget) {
        applyStyles(widget, nightStyles.widget);
    }
    
    // Apply to title
    const title = widget.querySelector('.promo-title');
    if (title && nightStyles.title) {
        applyStyles(title, nightStyles.title);
    }
    
    // Apply to description
    const desc = widget.querySelector('.promo-description');
    if (desc && nightStyles.description) {
        applyStyles(desc, nightStyles.description);
    }
    
    // Apply to button
    const button = widget.querySelector('.promo-button');
    if (button && nightStyles.button) {
        applyStyles(button, nightStyles.button);
        
        // Update button hover for night mode
        if (nightStyles.buttonHover) {
            const originalHover = promo.styles.buttonHover;
            button.addEventListener('mouseenter', () => {
                applyStyles(button, nightStyles.buttonHover);
            });
            button.addEventListener('mouseleave', () => {
                button.style.cssText = '';
                applyStyles(button, nightStyles.button);
            });
        }
    }
}

function updateAllForNightMode() {
    const isNightMode = document.body.classList.contains('night-mode');
    const widgets = document.querySelectorAll('.promotion-widget');
    
    widgets.forEach(widget => {
        const promoId = widget.className.match(/promotion-(\S+)/)?.[1];
        const promo = promotionConfig?.promotions?.find(p => p.id === promoId);
        
        if (promo) {
            if (isNightMode) {
                applyNightModeStyles(widget, promo);
            } else {
                // Reset to light mode
                widget.style.cssText = '';
                applyStyles(widget, promo.styles.widget);
                
                const title = widget.querySelector('.promo-title');
                const desc = widget.querySelector('.promo-description');
                const button = widget.querySelector('.promo-button');
                
                if (title) {
                    title.style.cssText = '';
                    applyStyles(title, promo.styles.title);
                }
                if (desc) {
                    desc.style.cssText = '';
                    applyStyles(desc, promo.styles.description);
                }
                if (button) {
                    button.style.cssText = '';
                    applyStyles(button, promo.styles.button);
                }
            }
        }
    });
}

// ===== INITIALIZATION =====
console.log('📝 Promotion script loaded with version-based image caching');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initPromotion();
        
        // Watch for night mode
        const observer = new MutationObserver(updateAllForNightMode);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    });
} else {
    initPromotion();
    
    const observer = new MutationObserver(updateAllForNightMode);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

// Retry on window load
window.addEventListener('load', () => {
    if (document.querySelectorAll('.promotion-widget').length === 0) {
        console.log('🔄 Retrying promotion initialization on load');
        initPromotion();
    }
});