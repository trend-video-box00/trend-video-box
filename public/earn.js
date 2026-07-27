// public/earn.js
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const balanceChip = document.getElementById('balanceChip');
const networkList = document.getElementById('networkList');
const taskList = document.getElementById('taskList');
const tabAds = document.getElementById('tabAds');
const tabArticles = document.getElementById('tabArticles');
const adsPanel = document.getElementById('adsPanel');
const articlesPanel = document.getElementById('articlesPanel');

// Card order = render order: Adsgram Daily, Adsgram Special, Monetag, GigaPub.
// Fill in the remaining REPLACE_ placeholder with your real Adsgram block ID.
const NETWORKS = [
  {
    id: 'adsgramDaily',
    name: 'Adsgram Daily',
    icon: '⚡',
    show: () => showAdsgramAd('39958'),
  },
  {
    id: 'adsgramSpecial',
    name: 'Adsgram Special',
    icon: '✨',
    show: () => showAdsgramAd('REPLACE_ADSGRAM_SPECIAL_BLOCK_ID'),
  },
  {
    id: 'monetag',
    name: 'Monetag',
    icon: '🎬',
    show: () => showMonetagAd(),
  },
  {
    id: 'gigapub',
    name: 'GigaPub',
    icon: '📺',
    // TODO: replace with GigaPub's real SDK call once its script tag +
    // function name are added to earn.html. Left disabled until then.
    show: () => Promise.reject(new Error('GigaPub SDK not wired up yet')),
  },
];

// Per-network state as returned by the server: { [id]: { reward, today, limit } }
let networkState = {};

async function loadEarnState() {
  try {
    const res = await fetch(`/api/earn?initData=${encodeURIComponent(tg?.initData || '')}`);
    const data = await res.json();
    if (!res.ok) {
      tg?.showAlert?.(data.error || 'লোড করতে সমস্যা হয়েছে');
      return;
    }
    balanceChip.textContent = `$${(data.balance || 0).toFixed(2)}`;
    networkState = data.networks || {};
    renderNetworks();
    renderTasks(data.tasks || []);
  } catch (e) {
    networkList.innerHTML = '<div class="empty-state">লোড করতে সমস্যা হয়েছে।</div>';
  }
}

function renderNetworks() {
  networkList.innerHTML = NETWORKS.map((net) => {
    const state = networkState[net.id] || { reward: 0, today: 0, limit: 0 };
    const maxedOut = state.limit > 0 && state.today >= state.limit;
    const pct = state.limit ? Math.min(100, (state.today / state.limit) * 100) : 0;
    return `
      <div class="network-card">
        <div class="network-icon">${net.icon}</div>
        <div class="network-info">
          <div class="network-name">${net.name} <span class="reward">+$${(state.reward || 0).toFixed(2)}</span></div>
          <div class="network-progress-bar"><div class="network-progress-fill" style="width:${pct}%"></div></div>
          <div class="network-progress-text">${state.today}/${state.limit} today</div>
        </div>
        <button class="network-watch-btn" data-network="${net.id}" ${maxedOut ? 'disabled' : ''}>
          ${maxedOut ? 'Done' : 'Watch'}
        </button>
      </div>
    `;
  }).join('');

  networkList.querySelectorAll('.network-watch-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => watchNetworkAd(btn.dataset.network, btn));
  });
}

function showAdsgramAd(blockId) {
  return new Promise((resolve, reject) => {
    if (!window.Adsgram) {
      reject(new Error('Adsgram SDK not loaded'));
      return;
    }
    try {
      const controller = window.Adsgram.init({ blockId });
      controller.show().then(resolve).catch(reject);
    } catch (e) {
      reject(e);
    }
  });
}

// --- Monetag rewarded interstitial (unchanged — already configured) ---
function showMonetagAd() {
  return new Promise((resolve, reject) => {
    const fnName = 'show_11415029';
    if (typeof window[fnName] !== 'function') {
      reject(new Error('Monetag SDK not loaded'));
      return;
    }
    window[fnName]().then(resolve).catch(reject);
  });
}

function watchNetworkAd(networkId, btn) {
  const net = NETWORKS.find((n) => n.id === networkId);
  if (!net) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';

  net.show()
    .then(() => submitAdWatched(networkId))
    .then((data) => {
      balanceChip.textContent = `$${data.balance.toFixed(2)}`;
      networkState[networkId] = { reward: data.reward, today: data.today, limit: data.limit };
      renderNetworks();
      tg?.showAlert?.(`You have Rewarded $${data.reward.toFixed(2)}`);
    })
    .catch((err) => {
      console.error('Ad error:', err);
      btn.disabled = false;
      btn.textContent = originalText;
      tg?.showAlert?.('অ্যাডটি সম্পূর্ণ দেখা হয়নি। আবার চেষ্টা করুন।');
    });
}

async function submitAdWatched(networkId) {
  const res = await fetch('/api/earn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'watchAd', network: networkId, initData: tg?.initData }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Server error');
  return data;
}

// --- Articles / task list (unchanged logic, now lives under the Articles tab) ---
function renderTasks(tasks) {
  if (!tasks.length) {
    taskList.innerHTML = '<div class="empty-state">এখনো কোনো টাস্ক নেই।</div>';
    return;
  }
  taskList.innerHTML = tasks.map((t) => `
    <div class="task-item">
      <div class="task-info">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-reward">+$${t.reward.toFixed(2)}</div>
      </div>
      <button class="task-btn ${t.completed ? 'done' : ''}" data-id="${t.id}" data-link="${t.link}" ${t.completed ? 'disabled' : ''}>
        ${t.completed ? 'সম্পন্ন ✅' : 'ভিজিট করুন'}
      </button>
    </div>
  `).join('');

  taskList.querySelectorAll('.task-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => handleTaskClick(btn));
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function handleTaskClick(btn) {
  const taskId = btn.dataset.id;
  const link = btn.dataset.link;
  tg?.openLink ? tg.openLink(link) : window.open(link, '_blank');
  btn.textContent = 'ভিজিট শেষ? ক্লেইম করুন';
  btn.onclick = () => claimTask(taskId);
}

async function claimTask(taskId) {
  try {
    const res = await fetch('/api/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'completeTask', initData: tg?.initData, taskId }),
    });
    const data = await res.json();
    if (!res.ok) {
      tg?.showAlert?.(data.error || 'সমস্যা হয়েছে');
      return;
    }
    tg?.showAlert?.('টাস্ক সম্পন্ন ✅ বোনাস যোগ হয়েছে।');
    await loadEarnState();
  } catch (e) {
    tg?.showAlert?.('নেটওয়ার্ক সমস্যা হয়েছে।');
  }
}

// --- Ads / Articles tab switching ---
tabAds.addEventListener('click', () => {
  tabAds.classList.add('active');
  tabArticles.classList.remove('active');
  adsPanel.hidden = false;
  articlesPanel.hidden = true;
});
tabArticles.addEventListener('click', () => {
  tabArticles.classList.add('active');
  tabAds.classList.remove('active');
  adsPanel.hidden = true;
  articlesPanel.hidden = false;
});

loadEarnState();
