// public/rank.js
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const user = tg?.initDataUnsafe?.user;
if (user) {
  const avatarEl = document.getElementById('avatar');
  if (user.photo_url) {
    avatarEl.innerHTML = `<img src="${user.photo_url}" alt="" />`;
  } else {
    avatarEl.textContent = (user.first_name || '?')[0].toUpperCase();
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

const tabs = document.querySelectorAll('.rank-tab');
const rankList = document.getElementById('rankList');
let activeType = 'earners';

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.type === activeType) return;
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeType = tab.dataset.type;
    loadRank();
  });
});

async function loadRank() {
  rankList.innerHTML = '<div class="empty-state">লোড হচ্ছে...</div>';
  try {
    const res = await fetch(`/api/rank?type=${encodeURIComponent(activeType)}`);
    const data = await res.json();
    const entries = data.entries || [];
    if (!entries.length) {
      rankList.innerHTML = '<div class="empty-state">এখনো কোনো ডেটা নেই — প্রথম হয়ে যান!</div>';
      return;
    }
    rankList.innerHTML = entries.map((u, i) => {
      const pos = i + 1;
      const posClass = pos === 1 ? 'top1' : pos === 2 ? 'top2' : pos === 3 ? 'top3' : '';
      const posDisplay = pos === 1 ? '👑' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
      const avatarHtml = u.photoUrl
        ? `<img src="${u.photoUrl}" alt="" />`
        : (u.name || '?')[0].toUpperCase();
      return `
        <div class="rank-item ${posClass}">
          <div class="rank-pos ${posClass}">${posDisplay}</div>
          <div class="rank-avatar">${avatarHtml}</div>
          <div class="rank-name">${escapeHtml(u.name)}</div>
          <div class="rank-value">${escapeHtml(u.valueLabel)}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    rankList.innerHTML = '<div class="empty-state">লোড করতে সমস্যা হয়েছে।</div>';
  }
}
loadRank();
