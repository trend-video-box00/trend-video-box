// public/rank.js
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

async function loadRank() {
  const list = document.getElementById('rankList');
  try {
    const res = await fetch('/api/rank');
    const data = await res.json();
    if (!data.leaderboard || !data.leaderboard.length) {
      list.innerHTML = '<div class="empty-state">এখনো কেউ রেফার করেনি — প্রথম হয়ে যান!</div>';
      return;
    }
    list.innerHTML = data.leaderboard.map((u, i) => {
      const pos = i + 1;
      const posClass = pos === 1 ? 'top1' : pos === 2 ? 'top2' : pos === 3 ? 'top3' : '';
      return `
        <div class="rank-item">
          <div class="rank-pos ${posClass}">${pos}</div>
          <div class="rank-name">${escapeHtml(u.name)}</div>
          <div class="rank-value">${u.referralCount} রেফার</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state">লোড করতে সমস্যা হয়েছে।</div>';
  }
}

loadRank();
