// public/app.js — Home dashboard
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
const user = tg?.initDataUnsafe?.user;

const MIN_WITHDRAW = 2;

// --- Avatar in the header (name text is no longer shown, per the new design) ---
if (user) {
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
      const balance = data.balance || 0;
      document.getElementById('balanceValue').textContent = balance.toFixed(2);
      const pct = Math.min(100, (balance / MIN_WITHDRAW) * 100);
      document.getElementById('balanceProgressFill').style.width = `${pct}%`;
    }
  } catch (e) {
    // Balance stays at 0.00 on load failure; user can pull-to-refresh via Telegram.
  }
}
loadBalance();

// --- Top Unlocks: who's unlocking videos, their position + earning.
// NOTE: depends on a backend endpoint (/api/rank?type=topUnlocks) that
// doesn't exist yet — this is wired up to be ready once that's built.
async function loadTopUnlocks() {
  const list = document.getElementById('topUnlocksList');
  try {
    const res = await fetch(`/api/rank?type=topUnlocks&initData=${encodeURIComponent(tg?.initData || '')}`);
    const data = await res.json();
    if (!res.ok || !data.entries || !data.entries.length) {
      list.innerHTML = '<div class="empty-state">এখনো কোনো ডেটা নেই।</div>';
      return;
    }
    list.innerHTML = data.entries.map((e, i) => {
      const posClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      const avatarHtml = e.photoUrl
        ? `<img src="${e.photoUrl}" alt="" />`
        : (e.name || '?')[0].toUpperCase();
      return `
        <div class="top-unlock-item">
          <div class="top-unlock-pos ${posClass}">${i + 1}</div>
          <div class="top-unlock-avatar">${avatarHtml}</div>
          <div class="top-unlock-name">${escapeHtml(e.name)}</div>
          <div class="top-unlock-earning">$${(e.earning || 0).toFixed(2)}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state">লোড করতে সমস্যা হয়েছে।</div>';
  }
}
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
loadTopUnlocks();

// --- One-time-per-session welcome notification, with a haptic buzz ---
const notifOverlay = document.getElementById('notifOverlay');
function maybeShowWelcomeNotif() {
  if (!sessionStorage.getItem('th_notif_shown')) {
    notifOverlay.hidden = false;
    tg?.HapticFeedback?.notificationOccurred?.('success');
    sessionStorage.setItem('th_notif_shown', '1');
  }
}
document.getElementById('notifCloseBtn').addEventListener('click', () => {
  notifOverlay.hidden = true;
});

// --- Settings modal: Language + Currency ---
// Stored locally for now (per-device). Auto-opens once for brand-new users
// who haven't picked a language/currency yet; reopenable any time via the
// header gear icon.
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsBtn = document.getElementById('settingsBtn');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');
const langOptions = [document.getElementById('langBn'), document.getElementById('langEn')];
const curOptions = [document.getElementById('curUsd'), document.getElementById('curBdt')];

let selectedLang = localStorage.getItem('th_lang') || 'bn';
let selectedCurrency = localStorage.getItem('th_currency') || 'USD';

function refreshSettingsSelection() {
  langOptions.forEach((el) => el.classList.toggle('selected', el.dataset.lang === selectedLang));
  curOptions.forEach((el) => el.classList.toggle('selected', el.dataset.cur === selectedCurrency));
}
refreshSettingsSelection();

langOptions.forEach((el) => {
  el.addEventListener('click', () => {
    selectedLang = el.dataset.lang;
    refreshSettingsSelection();
  });
});
curOptions.forEach((el) => {
  el.addEventListener('click', () => {
    selectedCurrency = el.dataset.cur;
    refreshSettingsSelection();
  });
});

function openSettings() {
  settingsOverlay.hidden = false;
}
function closeSettings() {
  settingsOverlay.hidden = true;
}

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsSaveBtn.addEventListener('click', () => {
  localStorage.setItem('th_lang', selectedLang);
  localStorage.setItem('th_currency', selectedCurrency);
  localStorage.setItem('th_settings_done', '1');
  closeSettings();
  maybeShowWelcomeNotif();
});

// First-ever visit (no saved preference yet): force the settings picker
// before anything else. Returning users just get the normal session welcome.
if (!localStorage.getItem('th_settings_done')) {
  openSettings();
} else {
  maybeShowWelcomeNotif();
}

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
