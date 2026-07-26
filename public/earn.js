// public/earn.js
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const watchAdBtn = document.getElementById('watchAdBtn');
const adsProgressText = document.getElementById('adsProgressText');
const balanceChip = document.getElementById('balanceChip');
const taskList = document.getElementById('taskList');

let adsLimit = 20;

// --- Adsgram setup ---
const AdController = window.Adsgram
  ? window.Adsgram.init({ blockId: '39829' })
  : null;

async function loadEarnState() {
  try {
    const res = await fetch(`/api/earn?initData=${encodeURIComponent(tg?.initData || '')}`);
    const data = await res.json();
    if (!res.ok) {
      tg?.showAlert?.(data.error || 'লোড করতে সমস্যা হয়েছে');
      return;
    }
    adsLimit = data.adsLimit;
    balanceChip.textContent = `$${(data.balance || 0).toFixed(2)}`;
    adsProgressText.textContent = `${data.adsToday}/${data.adsLimit}`;
    if (data.adsToday >= data.adsLimit) {
      watchAdBtn.disabled = true;
      watchAdBtn.textContent = 'আজকের লিমিট শেষ — কাল আবার আসুন';
    }
    renderTasks(data.tasks || []);
  } catch (e) {
    taskList.innerHTML = '<div class="empty-state">লোড করতে সমস্যা হয়েছে।</div>';
  }
}

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

let pendingTaskId = null;
function handleTaskClick(btn) {
  const taskId = btn.dataset.id;
  const link = btn.dataset.link;
  // Open the link, then let the user come back and claim.
  tg?.openLink ? tg.openLink(link) : window.open(link, '_blank');
  pendingTaskId = taskId;
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

function showOneRichAd() {
  return new Promise((resolve, reject) => {
    if (!AdController) {
      reject(new Error('Ad SDK not ready'));
      return;
    }
    AdController.show()
      .then((result) => resolve(result))
      .catch((result) => reject(result));
  });
}

watchAdBtn.addEventListener('click', () => {
  watchAdBtn.disabled = true;
  watchAdBtn.textContent = 'অ্যাড লোড হচ্ছে...';

  showOneRichAd()
    .then(async () => {
      const res = await fetch('/api/earn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'watchAd', initData: tg?.initData }),
      });
      const data = await res.json();
      if (!res.ok) {
        tg?.showAlert?.(data.error || 'সমস্যা হয়েছে');
        watchAdBtn.disabled = data.adsToday >= adsLimit;
        watchAdBtn.textContent = watchAdBtn.disabled ? 'আজকের লিমিট শেষ — কাল আবার আসুন' : '▶ Watch Ad Now';
        return;
      }
      balanceChip.textContent = `$${data.balance.toFixed(2)}`;
      adsProgressText.textContent = `${data.adsToday}/${data.adsLimit}`;
      if (data.adsToday >= data.adsLimit) {
        watchAdBtn.disabled = true;
        watchAdBtn.textContent = 'আজকের লিমিট শেষ — কাল আবার আসুন';
      } else {
        watchAdBtn.disabled = false;
        watchAdBtn.textContent = '▶ Watch Ad Now';
      }
    })
    .catch(() => {
      watchAdBtn.disabled = false;
      watchAdBtn.textContent = '▶ Watch Ad Now';
      tg?.showAlert?.('অ্যাডটি সম্পূর্ণ দেখা হয়নি। আবার চেষ্টা করুন।');
    });
});

loadEarnState();
