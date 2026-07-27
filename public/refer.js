// public/refer.js
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
// Set this to your bot's @username (same value used in watch.js).
const BOT_USERNAME = 'viralvideohub009_bot';
const user = tg?.initDataUnsafe?.user;
const referLink = document.getElementById('referLink');
const referralCountEl = document.getElementById('referralCount');
const milestoneList = document.getElementById('milestoneList');
if (user) {
  referLink.value = `https://t.me/${BOT_USERNAME}?start=ref_${user.id}`;
}
document.getElementById('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(referLink.value);
    tg?.showAlert?.('কপি হয়েছে ✅');
  } catch (e) {
    referLink.select();
    document.execCommand('copy');
    tg?.showAlert?.('কপি হয়েছে ✅');
  }
});
async function loadRefer() {
  try {
    const res = await fetch(`/api/refer?initData=${encodeURIComponent(tg?.initData || '')}`);
    const data = await res.json();
    if (!res.ok) {
      milestoneList.innerHTML = `<div class="empty-state">${data.error || 'লোড করতে সমস্যা হয়েছে'}</div>`;
      return;
    }
    referralCountEl.textContent = data.referralCount;
    // rewardLabel is a plain string from the server, e.g. "+2 Videos Free"
    // or "$0.50" — the milestone reward doesn't have to be cash, so the
    // frontend just displays whatever label the backend sends.
    milestoneList.innerHTML = data.milestones.map((m) => `
      <div class="milestone-item ${m.claimed ? 'done' : ''}">
        <div>
          <div class="milestone-label">${m.count} জন রেফার</div>
          <div class="milestone-sub">বোনাস: ${m.rewardLabel}</div>
        </div>
        <div class="milestone-badge ${m.claimed ? 'done' : ''}">
          ${m.claimed ? 'পাওয়া গেছে ✅' : (m.achieved ? 'প্রসেসিং...' : 'বাকি')}
        </div>
      </div>
    `).join('');
  } catch (e) {
    milestoneList.innerHTML = '<div class="empty-state">লোড করতে সমস্যা হয়েছে।</div>';
  }
}
loadRefer();
