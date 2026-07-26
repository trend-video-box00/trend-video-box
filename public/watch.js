// public/watch.js — no ads, direct unlock
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const BOT_USERNAME = 'viralvideohub009_bot';

const params = new URLSearchParams(window.location.search);
const videoId = params.get('id');

const unlockCard = document.getElementById('unlockCard');
const successState = document.getElementById('successState');
const errorState = document.getElementById('errorState');
const errorMsg = document.getElementById('errorMsg');
const unlockBtn = document.getElementById('unlockBtn');

function showError(msg) {
  unlockCard.hidden = true;
  successState.hidden = true;
  errorState.hidden = false;
  errorMsg.textContent = msg;
}

function showSuccess() {
  unlockCard.hidden = true;
  errorState.hidden = true;
  successState.hidden = false;
}

async function completeUnlock() {
  unlockBtn.disabled = true;
  unlockBtn.textContent = 'ভিডিও পাঠানো হচ্ছে...';
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
      unlockBtn.disabled = false;
      unlockBtn.textContent = '🔓 Unlock Video';
      return;
    }
    showSuccess();
  } catch (e) {
    showError('নেটওয়ার্ক সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    unlockBtn.disabled = false;
    unlockBtn.textContent = '🔓 Unlock Video';
  }
}

if (!videoId) {
  showError('ভিডিও খুঁজে পাওয়া যায়নি।');
} else {
  unlockBtn.addEventListener('click', completeUnlock);
}

document.getElementById('checkInboxBtn')?.addEventListener('click', () => {
  if (!BOT_USERNAME.startsWith('REPLACE_') && tg?.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/${BOT_USERNAME}`);
  } else {
    tg?.close?.();
  }
});
