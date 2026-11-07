// Shatsu's in-app guide is local to this browser and requires no account.
const guide = document.getElementById('guide-dialog');
const steps = [...guide.querySelectorAll('[data-guide-step]')];
const back = document.getElementById('guide-back');
const next = document.getElementById('guide-next');
const progress = document.getElementById('guide-progress');
let step = 0;

function renderStep() {
  steps.forEach((item, index) => { item.hidden = index !== step; });
  progress.textContent = `Step ${step + 1} of ${steps.length}`;
  back.disabled = step === 0;
  next.textContent = step === steps.length - 1 ? 'Start listening ✓' : 'Next →';
}
function openGuide() {
  step = 0;
  renderStep();
  if (!guide.open) guide.showModal();
}
function dismissGuide() {
  localStorage.setItem('shatsu.guide.seen', '1');
  if (guide.open) guide.close();
}
for (const button of document.querySelectorAll('[data-open-guide]')) {
  button.addEventListener('click', openGuide);
}
for (const button of document.querySelectorAll('[data-close-guide]')) {
  button.addEventListener('click', dismissGuide);
}
back.addEventListener('click', () => { if (step > 0) { step--; renderStep(); } });
next.addEventListener('click', () => { if (step < steps.length - 1) { step++; renderStep(); } else dismissGuide(); });
guide.addEventListener('close', () => localStorage.setItem('shatsu.guide.seen', '1'));
window.ShatsuGuide = { open: openGuide };

// First launch: guide is automatic for new hosts; don't interrupt guests opening invites.
const hasInvite = new URLSearchParams(location.search).has('room');
if (new URLSearchParams(location.search).has('guide') || (!hasInvite && localStorage.getItem('shatsu.guide.seen') !== '1')) {
  openGuide();
}
