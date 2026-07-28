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
