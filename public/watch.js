// public/watch.js — 5-ad unlock flow (Monetag)
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
const BOT_USERNAME = 'viralvideohub009_bot';
const ADS_REQUIRED = 5;
const params = new URLSearchParams(window.location.search);
const videoId = params.get('id');
const unlockCard = document.getElementById('unlockCard');
const loadingState = document.getElementById('loadingState');
const successState = document.getElementById('successState');
const errorState = document.getElementById('errorState');
const errorMsg = document.getElementById('errorMsg');
const unlockBtn = document.getElementById('unlockBtn');
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

// Loads the video's thumbnail/title/lock-status
async function loadVideoInfo() {
  try {
    const res = await fetch(`/api/videos?id=${encodeURIComponent(videoId)}`);
    const data = await res.json();
    if (!res.ok || !data.video) {
      showError('ভিডিও খুঁজে পাওয়া যায়নি।');
      return;
    }
    const v = data.video;
    if (wcThumb) { wcThumb.src = v.thumbnailUrl; wcThumb.alt = v.title; }
    if (wcTitle) wcTitle.textContent = v.title;

    if (v.lockedUntil && v.lockedUntil > Date.now()) {
      showError('এই ভিডিওটি এখনো লক করা আছে। ২৪ ঘণ্টা পর আবার চেষ্টা করুন।');
      return;
    }

    updateProgress();
    showUnlockCard();
  } catch (e) {
    showError('ভিডিও লোড করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
  }
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

function watchOneAd() {
  showAdLoading();
  showOneAd()
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

async function completeUnlock() {
  showAdLoading();
  try {
    const res = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, initData: tg?.initData }),
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
  loadVideoInfo();
}
document.getElementById('checkInboxBtn')?.addEventListener('click', () => {
  if (!BOT_USERNAME.startsWith('REPLACE_') && tg?.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/${BOT_USERNAME}`);
  } else {
    tg?.close?.();
  }
});
