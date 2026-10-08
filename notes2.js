const ADMOB_CONFIG = {
    testDevices  : [],
    banner       : 'ca-app-pub-5188642994982403/3807044339',
    appOpen      : 'ca-app-pub-5188642994982403/3392624057',
};

const APP_OPEN_EXPIRY_MS        = 4 * 60 * 60 * 1000;
const APP_OPEN_COOLDOWN_MS      = 15 * 60 * 1000;
const APP_OPEN_SHOW_TIMEOUT_MS  = 60 * 1000;
const MAX_RETRY_ATTEMPTS        = 3;
const RETRY_DELAY_MS            = 5 * 1000;
const MIN_SESSIONS_BEFORE_APP_OPEN = 2;
const BANNER_MAX_RETRIES        = 5;
const BANNER_RETRY_BASE_MS      = 15 * 1000;
const BANNER_RETRY_MAX_MS       = 5 * 60 * 1000;

const ads = {
    banner          : null,
    bannerReady     : false,
    bannerRetries   : 0,

    appOpen         : null,
    appOpenReady    : false,
    appOpenShowing  : false,
    appOpenLoading  : false,
    appOpenLoadTime : 0,
    appOpenLastShown: 0,
    appOpenRetries  : 0,
};

let appOpenShowTimeout = null;
let bannerRetryTimer   = null;

function isFresh(loadTime) {
    if (!loadTime) return false;
    return (Date.now() - loadTime) < APP_OPEN_EXPIRY_MS;
}

function getSessionCount() {
    try {
        const n = parseInt(window.localStorage.getItem('app_session_count') || '0', 10);
        return isNaN(n) ? 0 : n;
    } catch (e) {
        return 0;
    }
}

function bumpSessionCount() {
    try {
        const n = getSessionCount() + 1;
        window.localStorage.setItem('app_session_count', String(n));
        return n;
    } catch (e) {
        return 0;
    }
}

function canShowAppOpen() {
    return ads.appOpenReady
        && ads.appOpen
        && isFresh(ads.appOpenLoadTime)
        && !ads.appOpenShowing
        && (Date.now() - ads.appOpenLastShown) >= APP_OPEN_COOLDOWN_MS
        && getSessionCount() >= MIN_SESSIONS_BEFORE_APP_OPEN;
}

function scheduleBannerRetry() {
    if (bannerRetryTimer) return;
    if (ads.bannerRetries >= BANNER_MAX_RETRIES) return;
    const delay = Math.min(
        BANNER_RETRY_BASE_MS * Math.pow(2, ads.bannerRetries),
        BANNER_RETRY_MAX_MS
    );
    ads.bannerRetries++;

    bannerRetryTimer = setTimeout(() => {
        bannerRetryTimer = null;
        initBanner();
    }, delay);
}

async function initBanner() {
    try {
        if (!ads.banner) {
            const banner = new admob.BannerAd({
                adUnitId : ADMOB_CONFIG.banner,
                position : 'bottom',
                size     : 'BANNER',
            });
            banner.on('load', () => {
                ads.bannerRetries = 0;
                ads.bannerReady = true;
                banner.show().catch(e => console.log('[AdMob] Banner show error: ' + e));
            });
            banner.on('loadfail', (error) => {
                console.log('[AdMob] Banner load failed: ' + error);
                ads.bannerReady = false;
                scheduleBannerRetry();
            });

            window.admobBanner = banner;
            ads.banner = banner;
        }

        if (ads.bannerReady) {
            await ads.banner.show();
        } else {
            await ads.banner.load();
        }
    } catch (e) {
        console.log('[AdMob] Banner init error: ' + e);
        ads.bannerReady = false;
        scheduleBannerRetry();
    }
}

async function onAppOpenClosed() {
    if (!ads.appOpenShowing) return;
    clearTimeout(appOpenShowTimeout);
    ads.appOpenShowing = false;
    ads.appOpenLastShown = Date.now();
    ads.appOpen = null;
    ads.appOpenReady = false;
    window.admobAppOpenReady = false;

    if (ads.banner && ads.bannerReady) {
        await ads.banner.show().catch(e => console.log('[AdMob] Banner show error: ' + e));
    }
    await loadAppOpenAd();
}

async function onAppOpenError(err) {
    if (!ads.appOpenShowing) return;
    clearTimeout(appOpenShowTimeout);
    console.log('[AdMob] App Open show error: ' + err);
    ads.appOpenShowing = false;
    ads.appOpen = null;
    ads.appOpenReady = false;
    window.admobAppOpenReady = false;

    if (ads.banner && ads.bannerReady) {
        await ads.banner.show().catch(e => console.log('[AdMob] Banner show error: ' + e));
    }
    setTimeout(() => {
        loadAppOpenAd().catch(e => console.log('[AdMob] App Open retry failed: ' + e));
    }, RETRY_DELAY_MS);
}

async function loadAppOpenAd() {
    if (ads.appOpenLoading) return;
    if (ads.appOpen && isFresh(ads.appOpenLoadTime)) return;
    if (ads.appOpenRetries >= MAX_RETRY_ATTEMPTS) {
        ads.appOpenRetries = 0;
        return;
    }

    ads.appOpenLoading = true;
    try {
        const ad = new admob.AppOpenAd({
            adUnitId: ADMOB_CONFIG.appOpen,
        });

        ad.on('load', () => {
            ads.appOpenLoadTime = Date.now();
            ads.appOpenReady = true;
            window.admobAppOpenReady = true;
            ads.appOpenRetries = 0;
        });

        ad.on('loadfail', (error) => {
            console.log('[AdMob] App Open ad load failed: ' + error);
            ads.appOpen = null;
            ads.appOpenReady = false;
            window.admobAppOpenReady = false;
            ads.appOpenRetries++;
            if (ads.appOpenRetries < MAX_RETRY_ATTEMPTS) {
                setTimeout(() => {
                    loadAppOpenAd().catch(e => console.log('[AdMob] App Open retry failed: ' + e));
                }, RETRY_DELAY_MS);
            }
        });

        ad.on('dismiss', onAppOpenClosed);
        ad.on('error',   onAppOpenError);

        ads.appOpen = ad;
        await ad.load();
    } catch (e) {
        console.log('[AdMob] App Open ad error: ' + e);
        ads.appOpen = null;
        ads.appOpenReady = false;
        window.admobAppOpenReady = false;
        ads.appOpenRetries++;
        if (ads.appOpenRetries < MAX_RETRY_ATTEMPTS) {
            setTimeout(() => {
                loadAppOpenAd().catch(err => console.log('[AdMob] App Open retry failed: ' + err));
            }, RETRY_DELAY_MS);
        }
    } finally {
        ads.appOpenLoading = false;
    }
}

async function showAppOpenAd() {
    if (ads.appOpenShowing) return;

    if (!canShowAppOpen()) {
        if (!ads.appOpen || !ads.appOpenReady) {
            await loadAppOpenAd();
        }
        return;}

    try {
        ads.appOpenShowing = true;
        clearTimeout(appOpenShowTimeout);
        appOpenShowTimeout = setTimeout(() => {
            if (ads.appOpenShowing) {
                console.log('[AdMob] App Open show timeout — resetting flag');
                onAppOpenClosed().catch(e => console.log('[AdMob] Timeout cleanup error: ' + e));
            }
        }, APP_OPEN_SHOW_TIMEOUT_MS);

        if (ads.banner && ads.bannerReady) {
            await ads.banner.hide().catch(e => console.log('[AdMob] Banner hide error: ' + e));
        }
        await ads.appOpen.show();
    } catch (e) {
        await onAppOpenError(e);
    }
}

document.addEventListener('resume', async () => {
    if (!ads.bannerReady && !bannerRetryTimer) {
        ads.bannerRetries = 0;
        initBanner();
    }

    if (!canShowAppOpen()) {
        await loadAppOpenAd(); }
    if (canShowAppOpen()) {
        await showAppOpenAd();
    }}, false);

document.addEventListener('deviceready', async () => {
    try {
        bumpSessionCount();
        await admob.start();
        await initBanner();
        if (!window.admobAppOpenReady) {
            await loadAppOpenAd();
        }
    } catch (e) {
        console.log('[AdMob] Failed to start AdMob: ' + e);}}, false);

(function() {
setTimeout(function() {
const existing = document.getElementById('ios-modal-wrapper');
if (existing) existing.remove();
const CONFIG = {
latestVersion: "1.8.0",
minRequiredVersion: "1.7.0",
playStoreUrl: "https://play.google.com/store/apps/details?id=com.noteswithlock",
title: "Update Available",
msgOptional: "A new version is available with fresh features. Would you like to update now ?",
msgForce: "Your app version is no longer supported. Please update to the latest version to continue."};function compareVersions(v1, v2) {const parts1 = v1.split('.').map(num => { const v = parseInt(num, 10); return isNaN(v) ? 0 : v; });const parts2 = v2.split('.').map(num => { const v = parseInt(num, 10); return isNaN(v) ? 0 : v; });const maxLength = Math.max(parts1.length, parts2.length);for (let i = 0; i < maxLength; i++) {const num1 = i < parts1.length ? parts1[i] : 0;const num2 = i < parts2.length ? parts2[i] : 0;if (num1 > num2) return 1;if (num1 < num2) return -1;}return 0;}const current = window.APP_CURRENT_VERSION || "0.0.0";console.log(`[Update Check] Current: ${current}, Latest: ${CONFIG.latestVersion}, Min Required: ${CONFIG.minRequiredVersion}`);if (compareVersions(current, CONFIG.latestVersion) >= 0) {console.log('[Update Check] Version is up to date. Modal not shown.');return;}const isForceUpdate = compareVersions(current, CONFIG.minRequiredVersion) < 0;console.log(`[Update Check] Force update required: ${isForceUpdate}`);if (!document.getElementById('ios-update-styles')) { const style = document.createElement('style'); style.id = 'ios-update-styles'; style.textContent = `#ios-modal-wrapper { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; touch-action: none; } .ios-alert { width: 270px; background: rgba(255, 255, 255, 0.98); border-radius: 14px; overflow: hidden; text-align: center; box-shadow: 0 2px 20px rgba(0, 0, 0, 0.2); animation: ios-in 0.2s cubic-bezier(0.4, 0, 0.2, 1); backdrop-filter: blur(0px); } @keyframes ios-in { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } } .ios-body { padding: 20px 16px 18px 16px; background: #ffffff; } .ios-title { font-weight: 600; font-size: 17px; margin-bottom: 8px; color: #000000; letter-spacing: -0.02em; line-height: 1.3; } .ios-msg { font-size: 13px; color: #8e8e93; line-height: 1.4; letter-spacing: -0.01em; } .ios-footer { display: flex; height: 44px; align-items: stretch; border-top: 0.5px solid #c6c6c8; background: #ffffff; } .ios-btn { flex: 1; border: none; font-size: 17px; cursor: pointer; outline: none; height: 44px; border-radius: 0px; background: #ffffff; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; transition: background 0.1s ease; font-weight: 500; letter-spacing: -0.02em; } .ios-btn:active { background: #e5e5ea; } .btn-later { color: #007aff; border-right: 0.5px solid #c6c6c8; font-weight: 500; } .btn-update { color: #007aff; font-weight: 600; } .btn-force { color: #007aff; font-weight: 600; width: 100%; background: #ffffff; } .btn-force:active { background: #e5e5ea; }`; document.head.appendChild(style); }const wrapper = document.createElement('div');wrapper.id = 'ios-modal-wrapper';const message = isForceUpdate ? CONFIG.msgForce : CONFIG.msgOptional;const footerHtml = isForceUpdate ? `<button class="ios-btn btn-force" id="update-action">Update Now</button>`: `<button class="ios-btn btn-later" id="later-action">Later</button><button class="ios-btn btn-update" id="update-action">Update</button>`;wrapper.innerHTML = `<div class="ios-alert"><div class="ios-body"><div class="ios-title">${CONFIG.title}</div><div class="ios-msg">${message}</div></div><div class="ios-footer">${footerHtml}</div></div>`;document.body.appendChild(wrapper);const updateBtn = wrapper.querySelector('#update-action');const laterBtn = wrapper.querySelector('#later-action');updateBtn.onclick = () => {const url = CONFIG.playStoreUrl;if (window.cordova && window.cordova.InAppBrowser) {window.cordova.InAppBrowser.open(url, '_system');console.log('[Update Check] Opening Play Store via InAppBrowser');return;}const isAndroid = /android/i.test(navigator.userAgent);if (isAndroid) {const packageName = url.match(/id=([^&]+)/)?.[1];if (packageName) {console.log('[Update Check] Opening Play Store via market:// protocol');window.location.href = `market://details?id=${packageName}`;setTimeout(() => {window.location.href = url;}, 2000);return;}}const newWindow = window.open(url, '_blank');if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {console.log('[Update Check] Popup blocked, navigating current window');window.location.href = url;}};if (laterBtn) {laterBtn.onclick = () => {wrapper.remove();};}wrapper.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });}, 300);})();