const ADMOB_CONFIG = {
    testDevices  : [''],
    banner       : 'ca-app-pub-5188642994982403/3807044339',
    appOpen      : 'ca-app-pub-5188642994982403/8009718070',
};

const APP_OPEN_EXPIRY_MS    = 4 * 60 * 60 * 1000;
const APP_OPEN_COOLDOWN_MS  = 15 * 60 * 1000;
const MAX_RETRY_ATTEMPTS    = 3;
const RETRY_DELAY_MS        = 5 * 1000;

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/* ---------------- Banner ---------------- */

let banner;
let bannerRetries = 0;

async function initBanner() {
    try {
        if (!window.admobBanner) {
            window.admobBanner = new admob.BannerAd({
                adUnitId : ADMOB_CONFIG.banner,
                position : 'bottom',
                size     : 'BANNER',
            });

            window.admobBanner.on('load', () => {
                bannerRetries = 0;
                window.admobBanner.show().catch(e => console.error('[AdMob] Banner show error: ' + e));
            });

            window.admobBanner.on('loadfail', (error) => {
                console.error('[AdMob] Banner load failed: ' + JSON.stringify(error));

                // FIX: this used to retry every 5s forever with no ceiling,
                // which can look like abusive/excessive ad requests to AdMob.
                // Cap attempts and back off, same pattern as the app-open ad.
                if (bannerRetries >= MAX_RETRY_ATTEMPTS) {
                    bannerRetries = 0;
                    return;
                }
                bannerRetries++;
                const backoff = RETRY_DELAY_MS * bannerRetries; // 5s, 10s, 15s
                setTimeout(() => {
                    window.admobBanner.load().catch(e => console.error('[AdMob] Banner retry failed: ' + e));
                }, backoff);
            });

            await window.admobBanner.load();
        } else {
            await window.admobBanner.show();
        }
        banner = window.admobBanner;
    } catch (e) {
        console.error('[AdMob] Banner initialization error: ' + e);
    }
}

/* ---------------- App Open ---------------- */

let appOpenAd        = null;
let appOpenLoadTime   = null;
let appOpenIsShowing  = false;
let appOpenReady      = false;
let appOpenRetries    = 0;
let appOpenLastShown  = 0;

function isAppOpenAdFresh() {
    if (!appOpenLoadTime) return false;
    return (Date.now() - appOpenLoadTime) < APP_OPEN_EXPIRY_MS;
}

async function loadAppOpenAd() {
    // Already have a fresh ad loaded — nothing to do.
    if (appOpenAd && isAppOpenAdFresh()) {
        return;
    }

    // Exhausted retries for now — back off and let a later trigger
    // (deviceready / resume / dismiss) try again from a clean slate.
    if (appOpenRetries >= MAX_RETRY_ATTEMPTS) {
        appOpenRetries = 0;
        return;
    }

    try {
        appOpenAd = new admob.AppOpenAd({
            adUnitId: ADMOB_CONFIG.appOpen,
        });

        appOpenAd.on('load', () => {
            appOpenLoadTime = Date.now();
            appOpenReady = true;
            window.admobAppOpenReady = true;
            appOpenRetries = 0;
        });

        appOpenAd.on('loadfail', (error) => {
            console.error('[AdMob] App Open ad load failed: ' + JSON.stringify(error));
            appOpenAd = null;
            appOpenReady = false;
            window.admobAppOpenReady = false;
            appOpenRetries++;

            // FIX: previously there was no scheduled retry here at all.
            // In production, a "no fill" on the very first request would
            // permanently stop any further app-open requests, since nothing
            // else ever called loadAppOpenAd() again on its own.
            if (appOpenRetries < MAX_RETRY_ATTEMPTS) {
                setTimeout(() => {
                    loadAppOpenAd().catch(e => console.error('[AdMob] App Open retry failed: ' + e));
                }, RETRY_DELAY_MS);
            }
        });

        await appOpenAd.load();
    } catch (e) {
        console.error('[AdMob] App Open ad error: ' + e);
        appOpenAd = null;
        appOpenReady = false;
        window.admobAppOpenReady = false;
        appOpenRetries++;
    }
}

async function showAppOpenAd() {
    if (appOpenIsShowing) {
        return;
    }

    // FIX: previously this just returned when appOpenAd was null,
    // meaning a failed/never-attempted load silently killed all future
    // app-open ads. Now it triggers a (re)load instead of giving up.
    if (!appOpenAd || !appOpenReady) {
        await loadAppOpenAd();
        return;
    }

    if (!isAppOpenAdFresh()) {
        await loadAppOpenAd();
        return;
    }

    if ((Date.now() - appOpenLastShown) < APP_OPEN_COOLDOWN_MS) {
        return;
    }

    try {
        appOpenIsShowing = true;

        // Hide banner while showing app open ad
        if (window.admobBanner) {
            await window.admobBanner.hide();
        }

        appOpenAd.on('dismiss', async () => {
            appOpenIsShowing = false;
            appOpenLastShown = Date.now();
            appOpenAd = null;
            appOpenReady = false;
            window.admobAppOpenReady = false;

            // Reshow banner
            if (window.admobBanner) {
                await window.admobBanner.show();
            }

            // Load next ad
            await loadAppOpenAd();
        });

        appOpenAd.on('error', async (error) => {
            console.error('[AdMob] App Open ad show error: ' + JSON.stringify(error));
            appOpenIsShowing = false;
            appOpenAd = null;
            appOpenReady = false;
            window.admobAppOpenReady = false;

            if (window.admobBanner) {
                await window.admobBanner.show();
            }

            // FIX: also retry loading after a failed show, otherwise this
            // path could dead-end the same way the old code did.
            await loadAppOpenAd();
        });

        await appOpenAd.show();
    } catch (e) {
        console.error('[AdMob] App Open ad show error: ' + e);
        appOpenIsShowing = false;
        if (window.admobBanner) {
            await window.admobBanner.show();
        }
        await loadAppOpenAd();
    }
}

document.addEventListener('resume', async () => {
    if ((Date.now() - appOpenLastShown) < APP_OPEN_COOLDOWN_MS) {
        return;
    }
    await showAppOpenAd();
}, false);

document.addEventListener('deviceready', async () => {
    try {
        await admob.start();

        await initBanner();

        if (!window.admobAppOpenReady) {
            await loadAppOpenAd();
        }
    } catch (e) {
        console.error('[AdMob] Failed to start AdMob: ' + e);
    }
}, false);


/*•••••••••••••••••••• Cross-promo banner ••••••••••••••••••••*/

function initPromoBanner() {
    const promo = document.getElementById('mypromo');

    // FIX: guard against the element not existing yet / not existing at all,
    // which would otherwise throw and (depending on script placement) could
    // abort the rest of this file's execution.
    if (!promo) {
        console.error('[Promo] #mypromo element not found');
        return;
    }

    promo.style.display = 'none';

    const promobanner = document.createElement('div');
    promobanner.style.cssText =
        'display:none;align-items:center;justify-content:space-between;padding:5px;background: var(--bg-card);margin: 10px 10px 0;border-radius:12px;gap:12px; border: 1px solid var(--border-light);';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;gap:12px';

    const img = document.createElement('img');
    img.src = 'https://heartquotelabs-cell.github.io/hql-ctrl/pop.png';
    img.width = 30;
    img.height = 30;
    img.style.borderRadius = '8px';
    img.style.border = '1px solid var(--border-light)';

    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'display:flex;flex-direction:column;gap:0px';

    const appName = document.createElement('div');
    appName.textContent = 'Popsquare Blast';
    appName.style.cssText = 'font-size:13px;font-weight:bold;color: var(--text-primary);';

    const desc = document.createElement('div');
    desc.textContent = 'Match 3 blocks and blast the levels';
    desc.style.cssText = 'font-size:10px;color: var(--text-secondary);';

    const btn = document.createElement('button');
    btn.textContent = 'Install';
    btn.style.cssText = 'background: var(--bg-tertiary);border:var(--border);padding:8px 20px;border-radius:20px;font-weight:bold;color: var(--text-inverse);cursor:pointer';
    btn.onclick = () => window.open('https://play.google.com/store/apps/details?id=com.wael.zookablast', '_blank');

    textWrap.appendChild(appName);
    textWrap.appendChild(desc);
    left.appendChild(img);
    left.appendChild(textWrap);
    promobanner.appendChild(left);
    promobanner.appendChild(btn);
    promo.appendChild(promobanner);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPromoBanner);
} else {
    initPromoBanner();
}

(function() {
setTimeout(function() {
const existing = document.getElementById('ios-modal-wrapper');
if (existing) existing.remove();
const CONFIG = {
latestVersion: "1.6.0",
minRequiredVersion: "1.3.0",
playStoreUrl: "https://play.google.com/store/apps/details?id=com.noteswithlock",
title: "Update Available",
msgOptional: "A new version is available with fresh features. Would you like to update now ?",
msgForce: "Your app version is no longer supported. Please update to the latest version to continue."};function compareVersions(v1, v2) {const parts1 = v1.split('.').map(num => parseInt(num, 10));const parts2 = v2.split('.').map(num => parseInt(num, 10));const maxLength = Math.max(parts1.length, parts2.length);for (let i = 0; i < maxLength; i++) {const num1 = i < parts1.length ? parts1[i] : 0;const num2 = i < parts2.length ? parts2[i] : 0;if (num1 > num2) return 1;if (num1 < num2) return -1;}return 0;}const current = window.APP_CURRENT_VERSION || "0.0.0";console.log(`[Update Check] Current: ${current}, Latest: ${CONFIG.latestVersion}, Min Required: ${CONFIG.minRequiredVersion}`);if (compareVersions(current, CONFIG.latestVersion) >= 0) {console.log('[Update Check] Version is up to date. Modal not shown.');return;}const isForceUpdate = compareVersions(current, CONFIG.minRequiredVersion) < 0;console.log(`[Update Check] Force update required: ${isForceUpdate}`);if (!document.getElementById('ios-update-styles')) { const style = document.createElement('style'); style.id = 'ios-update-styles'; style.textContent = `#ios-modal-wrapper { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; touch-action: none; } .ios-alert { width: 270px; background: rgba(255, 255, 255, 0.98); border-radius: 14px; overflow: hidden; text-align: center; box-shadow: 0 2px 20px rgba(0, 0, 0, 0.2); animation: ios-in 0.2s cubic-bezier(0.4, 0, 0.2, 1); backdrop-filter: blur(0px); } @keyframes ios-in { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } } .ios-body { padding: 20px 16px 18px 16px; background: #ffffff; } .ios-title { font-weight: 600; font-size: 17px; margin-bottom: 8px; color: #000000; letter-spacing: -0.02em; line-height: 1.3; } .ios-msg { font-size: 13px; color: #8e8e93; line-height: 1.4; letter-spacing: -0.01em; } .ios-footer { display: flex; height: 44px; align-items: stretch; border-top: 0.5px solid #c6c6c8; background: #ffffff; } .ios-btn { flex: 1; border: none; font-size: 17px; cursor: pointer; outline: none; height: 44px; border-radius: 0px; background: #ffffff; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; transition: background 0.1s ease; font-weight: 500; letter-spacing: -0.02em; } .ios-btn:active { background: #e5e5ea; } .btn-later { color: #007aff; border-right: 0.5px solid #c6c6c8; font-weight: 500; } .btn-update { color: #007aff; font-weight: 600; } .btn-force { color: #007aff; font-weight: 600; width: 100%; background: #ffffff; } .btn-force:active { background: #e5e5ea; }`; document.head.appendChild(style); }const wrapper = document.createElement('div');wrapper.id = 'ios-modal-wrapper';const message = isForceUpdate ? CONFIG.msgForce : CONFIG.msgOptional;const footerHtml = isForceUpdate ? `<button class="ios-btn btn-force" id="update-action">Update Now</button>`: `<button class="ios-btn btn-later" id="later-action">Later</button><button class="ios-btn btn-update" id="update-action">Update</button>`;wrapper.innerHTML = `<div class="ios-alert"><div class="ios-body"><div class="ios-title">${CONFIG.title}</div><div class="ios-msg">${message}</div></div><div class="ios-footer">${footerHtml}</div></div>`;document.body.appendChild(wrapper);const updateBtn = wrapper.querySelector('#update-action');const laterBtn = wrapper.querySelector('#later-action');updateBtn.onclick = () => {const url = CONFIG.playStoreUrl;if (window.cordova && window.cordova.InAppBrowser) {window.cordova.InAppBrowser.open(url, '_system');console.log('[Update Check] Opening Play Store via InAppBrowser');return;}const isAndroid = /android/i.test(navigator.userAgent);if (isAndroid) {const packageName = url.match(/id=([^&]+)/)?.[1];if (packageName) {console.log('[Update Check] Opening Play Store via market:// protocol');window.location.href = `market://details?id=${packageName}`;setTimeout(() => {window.location.href = url;}, 2000);return;}}const newWindow = window.open(url, '_blank');if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {console.log('[Update Check] Popup blocked, navigating current window');window.location.href = url;}};if (laterBtn) {laterBtn.onclick = () => {wrapper.remove();};}wrapper.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });}, 300);})();
