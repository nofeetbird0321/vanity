const form = document.querySelector('#search-form');
const targetInput = document.querySelector('#target');
const positionInput = document.querySelector('#match-position');
const workersInput = document.querySelector('#workers');
const workersValue = document.querySelector('#workers-value');
const startButton = document.querySelector('#start');
const stopButton = document.querySelector('#stop');
const errorMessage = document.querySelector('#error');
const estimate = document.querySelector('#estimate');
const statusBadge = document.querySelector('#status-badge');
const statusText = document.querySelector('#status-text');
const attemptsOutput = document.querySelector('#attempts');
const rateOutput = document.querySelector('#rate');
const etaOutput = document.querySelector('#eta');
const progressBar = document.querySelector('#progress-bar');
const progressNote = document.querySelector('#progress-note');
const resultPanel = document.querySelector('#result-panel');
const resultAddress = document.querySelector('#result-address');
const resultPrivate = document.querySelector('#result-private');
const revealPrivate = document.querySelector('#reveal-private');

let workers = [];
let attempts = 0;
let running = false;
let startedAt = 0;
let lastRateAt = 0;
let lastRateAttempts = 0;
let currentTarget = '';
let currentExpected = 0n;

const formatInteger = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);

function setError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function formatLargeInteger(value) {
  if (value < 1000000n) return formatInteger(Number(value));
  const units = [['万', 10000n], ['亿', 100000000n], ['万亿', 1000000000000n]];
  for (let i = units.length - 1; i >= 0; i -= 1) {
    if (value >= units[i][1]) return `${(Number(value) / Number(units[i][1])).toFixed(1)}${units[i][0]}`;
  }
  return formatInteger(Number(value));
}

function updateEstimate() {
  const target = targetInput.value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(target)) {
    estimate.textContent = '输入目标后显示难度';
    return;
  }
  const expected = 16n ** BigInt(target.length);
  estimate.textContent = `平均 ${formatLargeInteger(expected)} 次尝试`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} 分钟`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} 小时`;
  return `${(seconds / 86400).toFixed(1)} 天`;
}

function setStatus(label, isRunning = false) {
  statusText.textContent = label;
  statusBadge.classList.toggle('running', isRunning);
}

function renderProgress() {
  attemptsOutput.textContent = formatInteger(attempts);
  const elapsed = (performance.now() - startedAt) / 1000;
  const rate = elapsed > 0 ? attempts / elapsed : 0;
  rateOutput.textContent = rate > 0 ? `${formatLargeInteger(BigInt(Math.round(rate)))}/秒` : '—';
  const expectedNumber = currentExpected <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(currentExpected) : Infinity;
  const percentage = expectedNumber === Infinity ? 0 : Math.min(99.9, (attempts / expectedNumber) * 100);
  progressBar.style.width = `${percentage}%`;
  etaOutput.textContent = rate > 0 && expectedNumber !== Infinity ? formatDuration(expectedNumber / rate) : '—';
  if (Date.now() - lastRateAt > 500) {
    lastRateAt = Date.now();
    lastRateAttempts = attempts;
  }
}

function stopWorkers() {
  for (const worker of workers) worker.terminate();
  workers = [];
}

function stopSearch(message = '已停止。点击开始重新计算。') {
  stopWorkers();
  running = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  setStatus('已停止');
  progressNote.textContent = message;
  renderProgress();
}

function showResult(address, privateKey) {
  resultAddress.textContent = address;
  resultPrivate.textContent = privateKey;
  resultPrivate.classList.add('masked');
  resultPrivate.classList.remove('revealed');
  revealPrivate.textContent = '显示';
  resultPanel.hidden = false;
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function onWorkerMessage(event) {
  const data = event.data;
  if (data.type === 'progress') {
    if (running) attempts += data.attempts;
    renderProgress();
    return;
  }
  if (data.type === 'found' && running) {
    attempts += data.attempts;
    stopWorkers();
    running = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    progressBar.style.width = '100%';
    setStatus('已找到');
    progressNote.textContent = `在 ${formatInteger(attempts)} 次尝试后找到匹配。`;
    renderProgress();
    showResult(data.address, data.privateKey);
  }
}

function startSearch(event) {
  event.preventDefault();
  setError('');
  const target = targetInput.value.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(target)) {
    setError('目标只能包含十六进制字符：0-9、a-f。');
    targetInput.focus();
    return;
  }
  if (target.length > 12) {
    setError('为了避免误启动不可完成的任务，目标最多 12 个字符。');
    return;
  }

  stopWorkers();
  currentTarget = target;
  currentExpected = 16n ** BigInt(target.length);
  attempts = 0;
  startedAt = performance.now();
  lastRateAt = Date.now();
  lastRateAttempts = 0;
  resultPanel.hidden = true;
  progressBar.style.width = '0%';
  running = true;
  startButton.disabled = true;
  stopButton.disabled = false;
  setStatus('计算中', true);
  progressNote.textContent = `正在使用 ${workersInput.value} 个 Worker 在本地尝试密钥。`;
  renderProgress();

  for (let index = 0; index < Number(workersInput.value); index += 1) {
    const worker = new Worker('./worker.js');
    worker.addEventListener('message', onWorkerMessage);
    worker.addEventListener('error', () => {
      if (running) stopSearch('Worker 出错，任务已停止。请刷新页面后重试。');
    }, { once: true });
    worker.postMessage({ type: 'start', target, position: positionInput.value });
    workers.push(worker);
  }
}

targetInput.addEventListener('input', updateEstimate);
workersInput.addEventListener('input', () => { workersValue.value = workersInput.value; });
stopButton.addEventListener('click', () => stopSearch());
form.addEventListener('submit', startSearch);
revealPrivate.addEventListener('click', () => {
  const revealed = resultPrivate.classList.toggle('revealed');
  revealPrivate.textContent = revealed ? '隐藏' : '显示';
});

document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const value = document.querySelector(`#${button.dataset.copy}`).textContent;
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = '已复制';
      window.setTimeout(() => { button.textContent = '复制'; }, 1200);
    } catch {
      setError('浏览器拒绝了剪贴板访问，请手动选择并复制。');
    }
  });
});

const suggestedWorkers = Math.min(8, Math.max(1, navigator.hardwareConcurrency || 4));
workersInput.value = suggestedWorkers;
workersValue.value = suggestedWorkers;
updateEstimate();
