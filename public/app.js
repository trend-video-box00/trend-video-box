// public/app.js — Home dashboard
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const user = tg?.initDataUnsafe?.user;
if (user) {
  document.getElementById('userName').textContent = user.first_name || user.username || 'User';
  const avatarEl = document.getElementById('avatar');
  if (user.photo_url) {
    avatarEl.innerHTML = `<img src="${user.photo_url}" alt="" />`;
  } else {
    avatarEl.textContent = (user.first_name || '?')[0].toUpperCase();
  }
}

async function loadBalance() {
  try {
    const res = await fetch(`/api/earn?initData=${encodeURIComponent(tg?.initData || '')}`);
    const data = await res.json();
    if (res.ok) {
      document.getElementById('balanceValue').textContent = (data.balance || 0).toFixed(2);
    }
  } catch (e) {
    // Balance stays at 0.00 on load failure; user can pull-to-refresh via Telegram.
  }
}
loadBalance();

// --- One-time-per-session notification, with a haptic buzz ---
const notifOverlay = document.getElementById('notifOverlay');
if (!sessionStorage.getItem('th_notif_shown')) {
  notifOverlay.hidden = false;
  tg?.HapticFeedback?.notificationOccurred?.('success');
  sessionStorage.setItem('th_notif_shown', '1');
}
document.getElementById('notifCloseBtn').addEventListener('click', () => {
  notifOverlay.hidden = true;
});

// --- Withdraw modal ---
const withdrawOverlay = document.getElementById('withdrawOverlay');
document.getElementById('withdrawOpenBtn').addEventListener('click', (e) => {
  e.preventDefault();
  withdrawOverlay.hidden = false;
});
document.getElementById('withdrawCloseBtn').addEventListener('click', () => {
  withdrawOverlay.hidden = true;
});

document.getElementById('withdrawSubmitBtn').addEventListener('click', async () => {
  const amount = document.getElementById('withdrawAmount').value;
  const method = document.getElementById('withdrawMethod').value;
  const accountNumber = document.getElementById('withdrawAccount').value.trim();
  const statusEl = document.getElementById('withdrawStatus');

  try {
    const res = await fetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg?.initData, amount, method, accountNumber }),
    });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.error || 'সমস্যা হয়েছে';
      statusEl.className = 'status-msg err';
      return;
    }
    statusEl.textContent = 'উইথড্র রিকোয়েস্ট পাঠানো হয়েছে ✅ শীঘ্রই পেমেন্ট পাঠানো হবে।';
    statusEl.className = 'status-msg ok';
    document.getElementById('balanceValue').textContent = (data.balance || 0).toFixed(2);
  } catch (e) {
    statusEl.textContent = 'নেটওয়ার্ক সমস্যা হয়েছে।';
    statusEl.className = 'status-msg err';
  }
});
