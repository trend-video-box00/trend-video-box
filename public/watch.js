// public/watch.js — 5-ad unlock flow (Monetag)
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
const BOT_USERNAME = 'viralvideohub009_bot';
const ADS_REQUIRED = 5;
const params = new URLSearchParams(window.location.search);
const videoId = (params.get('id') || '').trim();

const unlockCard = document.getElementById('unlockCard');
const loadingState = document.getElementById('loadingState');
const successState = document.getElementById('successState');
const errorState = document.getElementById('errorState');
const errorMsg = document.getElementById('errorMsg');
const unlockBtn = document.getElementById('unlockBtn');
const freeCreditBtn = document.getElementById('freeCreditBtn');
const wcThumbWrap = document.getElementById('wcThumbWrap');
const wcThumb = document.getElementById('wcThumb');
const wcTitle = document.getElementById('wcTitle');
const wcProgressText = document.getElementById('wcProgressText');

let watchedCount = 0;

function showError(msg) {
  unlockCard.hidden = true;
  if (loadingState) loadingState.hidden = true;
  successState.hidden = true;
  errorState.hidden = false;
  errorMsg.textContent = msg;
}
function showSuccess() {
  unlockCard.hidden = true;
  if (loadingState) loadingState.hidden = true;
  errorState.hidden = true;
  successState.hidden = false;
}
function showUnlockCard() {
  if (loadingState) loadingState.hidden = true;
  successState.hidden = true;
  errorState.hidden = true;
  unlockCard.hidden = false;
}
function showAdLoading() {
  unlockCard.hidden = true;
  successState.hidden = true;
  errorState.hidden = true;
  if (loadingState) loadingState.hidden = false;
}
function updateProgress() {
  if (wcProgressText) wcProgressText.textContent = `Watch ${watchedCount}/${ADS_REQUIRED}`;
}

// Checks how many free video-unlock credits (earned via referrals) the
// user currently has, and shows/hides the "use free credit" button.
async function loadFreeCredits() {
  if (!freeCreditBtn) return;
  try {
    const res = await fetch(`/api/refer?initData=${encodeURIComponent(tg?.initData || '')}`);
    const data = await res.json();
    if (!res.ok) return;
    const credits = data.freeUnlockCredits || 0;
    if (credits > 0) {
      freeCreditBtn.hidden = false;
      freeCreditBtn.textContent = `🎁 Free Credit দিয়ে Unlock করুন (${credits} বাকি)`;
    } else {
      freeCreditBtn.hidden = true;
    }
  } catch (e) {
    // Free-credit button just stays hidden if this fails — not critical.
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One fetch attempt for the video info. Throws on network error or "not found".
async function fetchVideoInfo() {
  const userId = tg?.initDataUnsafe?.user?.id || '';
  // cache-buster so a stale/incorrect cached response can't cause a false "not found"
  const res = await fetch(
    `/api/videos?id=${encodeURIComponent(videoId)}&userId=${encodeURIComponent(userId)}&_ts=${Date.now()}`,
    { cache: 'no-store' }
  );
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('bad_response');
  }
  if (!res.ok || !data || !data.video) {
    throw new Error('not_found');
  }
  return data.video;
}

// Loads the video's thumbnail/title/lock-status.
// The unlockCard box is visible from the start with a shimmer placeholder
// (no literal "Loading..." text). Once data arrives, the real thumbnail
// fades into the frame and the real title replaces the skeleton bar.
// Retries once automatically before giving up, so a single transient
// failure (cold start, slow DB, flaky network) doesn't immediately show
// "video not found" before the ad flow even starts.
async function loadVideoInfo() {
  let video = null;
  let lastErr = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      video = await fetchVideoInfo();
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) {
        await wait(900); // brief pause before retry
      }
    }
  }

  if (lastErr || !video) {
    showError('ভিডিও খুঁজে পাওয়া যায়নি।');
    return;
  }

  // Fill in the thumbnail — fade it in once it actually loads, so the
  // frame never shows a broken-image icon.
  if (wcThumb) {
    wcThumb.classList.remove('loaded');
    wcThumb.onload = () => {
      wcThumb.classList.add('loaded');
      if (wcThumbWrap) wcThumbWrap.classList.remove('skeleton');
    };
    wcThumb.onerror = () => {
      wcThumb.onerror = null;
      if (wcThumbWrap) wcThumbWrap.classList.remove('skeleton');
    };
    wcThumb.alt = video.title || '';
    wcThumb.src = video.thumbnailUrl || '';
  }

  // Fill in the title — replaces the shimmer bar.
  if (wcTitle) {
    wcTitle.classList.remove('skeleton');
    wcTitle.textContent = video.title || '';
  }

  if (video.lockedUntil && video.lockedUntil > Date.now()) {
    showError('এই ভিডিওটি এখনো লক করা আছে। ২৪ ঘণ্টা পর আবার চেষ্টা করুন।');
    return;
  }

  updateProgress();
  showUnlockCard();
  loadFreeCredits();
}

// Shows one Monetag rewarded interstitial ad (hardcoded — replaces adsgram/adConfig logic)
function showOneAd() {
  return new Promise((resolve, reject) => {
    const fnName = 'show_11415029';
    if (typeof window[fnName] !== 'function') {
      reject(new Error('Monetag SDK not loaded'));
      return;
    }
    window[fnName]().then(resolve).catch(reject);
  });
}

// Ad #5 (the last one) is a plain direct link instead of the Monetag SDK.
// A direct link has no "reward completed" callback, so we open it and treat
// it as watched once the person comes back to this tab/app.
const DIRECT_LINK_AD_URL = 'https://omg10.com/4/11256528';

function showDirectLinkAd() {
  return new Promise((resolve) => {
    if (tg?.openLink) {
      tg.openLink(DIRECT_LINK_AD_URL, { try_instant_view: false });
    } else {
      window.open(DIRECT_LINK_AD_URL, '_blank', 'noopener');
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      resolve();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') finish();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
  });
}

function watchOneAd() {
  showAdLoading();
  // watchedCount is 0-indexed going in: 0,1,2,3 are Monetag ads (ads 1-4),
  // watchedCount === 4 means this is the 5th/last ad -> direct link.
  const isFinalAd = watchedCount === ADS_REQUIRED - 1;
  const adPromise = isFinalAd ? showDirectLinkAd() : showOneAd();

  adPromise
    .then(() => {
      watchedCount += 1;
      if (watchedCount >= ADS_REQUIRED) {
        completeUnlock();
      } else {
        showUnlockCard();
        updateProgress();
      }
    })
    .catch((err) => {
      console.error('Ad error:', err);
      showUnlockCard();
      tg?.showAlert?.('অ্যাডটি সম্পূর্ণ দেখা হয়নি। আবার চেষ্টা করুন।');
    });
}

async function completeUnlock(useFreeCredit) {
  showAdLoading();
  try {
    const res = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, initData: tg?.initData, useFreeCredit: !!useFreeCredit }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 423) {
        showError('এই ভিডিওটি এখনো লক করা আছে। ২৪ ঘণ্টা পর আবার চেষ্টা করুন।');
      } else {
        showError(data.error || 'সমস্যা হয়েছে, আবার চেষ্টা করুন।');
      }
      return;
    }
    showSuccess();
  } catch (e) {
    showError('নেটওয়ার্ক সমস্যা হয়েছে। আবার চেষ্টা করুন।');
  }
}

if (!videoId) {
  showError('ভিডিও খুঁজে পাওয়া যায়নি।');
} else {
  unlockBtn.addEventListener('click', watchOneAd);
  freeCreditBtn?.addEventListener('click', () => completeUnlock(true));
  loadVideoInfo();
}
document.getElementById('checkInboxBtn')?.addEventListener('click', () => {
  if (!BOT_USERNAME.startsWith('REPLACE_') && tg?.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/${BOT_USERNAME}`);
  } else {
    tg?.close?.();
  }
});
