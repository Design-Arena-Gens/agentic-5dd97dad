// Sketch Tac Toe - single file JS (ES module)
const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

const State = {
  board: Array(9).fill(null), // 'X' | 'O' | null
  mode: 'local', // 'local' | 'cpu'
  current: 'X',
  scores: { X: 0, O: 0 },
  gameOver: false,
  audioReady: false,
};

// Web Audio - grayscale sounds
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  State.audioReady = true;
}

function envGain(duration=0.12, peak=0.25){
  const now = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  return gain;
}

function playTick(freq=520, duration=0.08){
  if (!State.audioReady) return;
  const osc = audioCtx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const gain = envGain(duration, 0.2);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playScribble(duration=0.18){
  if (!State.audioReady) return;
  const sampleRate = audioCtx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<length;i++){
    // white noise shaped to sound pencil-like
    const t = i / sampleRate;
    const amp = Math.exp(-6*t);
    data[i] = (Math.random()*2-1) * amp * 0.6;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const gain = envGain(duration, 0.28);
  src.connect(gain).connect(audioCtx.destination);
  src.start();
}

function playWin(){
  if (!State.audioReady) return;
  // small grayscale triad
  const now = audioCtx.currentTime;
  [440, 554.37, 659.25].forEach((f, idx)=>{
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, now);
    const gain = envGain(0.35, 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + idx*0.06);
    osc.stop(now + 0.35 + idx*0.06);
  });
}

// View management
function showView(id){
  qsa('.view').forEach(v=>v.classList.remove('active'));
  qs('#'+id).classList.add('active');
}

function setMode(mode){
  State.mode = mode; // 'local' | 'cpu'
  qs('#mode-badge').textContent = 'Mode: ' + (mode === 'cpu' ? 'VS Computer' : 'Local');
  qs('#pill-o-label').textContent = (mode === 'cpu') ? 'Computer' : 'Player O';
}

function makeBoard(){
  const board = qs('#board');
  board.innerHTML = '';
  // grid cells layer
  const cells = document.createElement('div');
  cells.className = 'cells';
  for (let i=0;i<9;i++){
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.type = 'button';
    cell.setAttribute('role','gridcell');
    cell.setAttribute('aria-label', 'Cell ' + (i+1));
    cell.dataset.index = String(i);
    cell.addEventListener('click', onCellClick);
    cell.addEventListener('mouseenter', ()=>{ if(!State.board[i] && !State.gameOver) previewMark(cell); });
    cell.addEventListener('mouseleave', ()=> clearPreview(cell));
    cells.appendChild(cell);
  }
  board.appendChild(cells);
}

function resetRound(keepScores=true){
  State.board = Array(9).fill(null);
  State.current = 'X';
  State.gameOver = false;
  updateActivePills();
  updateStatus('');
  qsa('.cell').forEach(c=> c.innerHTML = '');
}

function updateActivePills(){
  qsa('.player-pill').forEach(p=>p.classList.remove('active'));
  qs('#pill-' + State.current.toLowerCase()).classList.add('active');
}

function updateStatus(text){
  qs('#status').textContent = text;
}

// Sketch mark drawing
function jitter(val, range){
  return val + (Math.random()*2-1)*range;
}
function drawX(container){
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 100 100');
  svg.innerHTML = `
    <g fill="none" stroke="#111" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M ${jitter(18,3)} ${jitter(18,3)} L ${jitter(82,3)} ${jitter(82,3)}"/>
      <path d="M ${jitter(82,3)} ${jitter(18,3)} L ${jitter(18,3)} ${jitter(82,3)}"/>
    </g>`;
  container.appendChild(svg);
  // animate strokes
  qsa('path', svg).forEach((p, idx)=>{
    const len = p.getTotalLength();
    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = String(len);
    p.getBoundingClientRect(); // force layout
    p.style.transition = 'stroke-dashoffset 220ms ease-out';
    setTimeout(()=>{ p.style.strokeDashoffset = '0'; }, 10 + idx*70);
  });
}
function drawO(container){
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 100 100');
  const rx = jitter(34,2);
  const ry = jitter(34,2);
  const cx = jitter(50,1.5);
  const cy = jitter(50,1.5);
  const circle = document.createElementNS('http://www.w3.org/2000/svg','ellipse');
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('rx', String(rx));
  circle.setAttribute('ry', String(ry));
  circle.setAttribute('fill','none');
  circle.setAttribute('stroke','#111');
  circle.setAttribute('stroke-width','8');
  circle.setAttribute('stroke-linecap','round');
  svg.appendChild(circle);
  container.appendChild(svg);
  const len = Math.PI * 2 * ((rx+ry)/2);
  circle.style.strokeDasharray = String(len);
  circle.style.strokeDashoffset = String(len);
  circle.getBoundingClientRect();
  circle.style.transition = 'stroke-dashoffset 260ms ease-out';
  setTimeout(()=>{ circle.style.strokeDashoffset = '0'; }, 10);
}

function previewMark(cell){
  if (cell.querySelector('svg')) return;
  const ghost = document.createElement('div');
  ghost.style.position='absolute'; ghost.style.inset='0'; ghost.style.opacity='0.12';
  ghost.style.pointerEvents='none';
  if (State.current === 'X') drawX(ghost); else drawO(ghost);
  cell.appendChild(ghost);
}
function clearPreview(cell){
  const ghost = cell.querySelector('div');
  if (ghost) ghost.remove();
}

function placeMark(index){
  const cell = qsa('.cell')[index];
  clearPreview(cell);
  State.board[index] = State.current;
  if (State.current === 'X') drawX(cell); else drawO(cell);
  playScribble(0.16);
  playTick(State.current==='X'?520:420, 0.07);
}

function onCellClick(e){
  ensureAudio();
  if (State.gameOver) return;
  const idx = Number(e.currentTarget.dataset.index);
  if (State.board[idx]) return;
  placeMark(idx);
  const result = evaluate(State.board);
  if (result) return endRound(result);
  // switch player
  State.current = (State.current === 'X') ? 'O' : 'X';
  updateActivePills();
  if (State.mode === 'cpu' && State.current === 'O' && !State.gameOver){
    setTimeout(cpuMove, 300);
  }
}

// Game evaluation
const wins = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];
function evaluate(board){
  for(const line of wins){
    const [a,b,c] = line;
    if (board[a] && board[a]===board[b] && board[a]===board[c]){
      return { type:'win', player: board[a], line };
    }
  }
  if (board.every(Boolean)) return { type:'draw' };
  return null;
}

function endRound(result){
  State.gameOver = true;
  if (result.type==='win'){
    State.scores[result.player]++;
    qs('#score-x').textContent = String(State.scores.X);
    qs('#score-o').textContent = String(State.scores.O);
    updateStatus(`${result.player} wins!`);
    highlightWin(result.line);
    playWin();
  } else {
    updateStatus(`It's a draw.`);
    playTick(320, 0.12);
  }
}

function highlightWin(line){
  const cells = qsa('.cell');
  for(const i of line){ cells[i].classList.add('winner'); }
}

// CPU (O) - Minimax
function cpuMove(){
  const best = bestMove(State.board, 'O');
  if (best.index === -1) return; // should not happen
  placeMark(best.index);
  const result = evaluate(State.board);
  if (result) return endRound(result);
  State.current = 'X';
  updateActivePills();
}

function bestMove(board, player){
  // Minimax with small randomness on equivalent scores to feel human-ish
  const opponent = player === 'X' ? 'O' : 'X';
  const res = minimax(board.slice(), player, player, 0);
  return res;
}

function minimax(board, player, turn, depth){
  const result = evaluate(board);
  if (result) {
    if (result.type==='win'){
      return { score: result.player===player ? 10 - depth : depth - 10, index: -1 };
    }
    return { score: 0, index: -1 };
  }
  const moves = [];
  for (let i=0;i<9;i++) if (!board[i]){
    board[i] = turn;
    const next = minimax(board, player, turn==='X'?'O':'X', depth+1);
    moves.push({ index:i, score: next.score });
    board[i] = null;
  }
  let best = null;
  if (turn === player){
    let max = -Infinity; for(const m of moves){ if (m.score>max) { max=m.score; best=m; } }
    // break ties randomly a little
    const ties = moves.filter(m=>m.score===max);
    best = ties[Math.floor(Math.random()*ties.length)];
    return best;
  } else {
    let min = Infinity; for(const m of moves){ if (m.score<min) { min=m.score; best=m; } }
    const ties = moves.filter(m=>m.score===min);
    best = ties[Math.floor(Math.random()*ties.length)];
    return best;
  }
}

// Controls
function startGame(mode){
  ensureAudio();
  setMode(mode);
  resetRound(true);
  showView('game');
}

function backToMenu(){
  showView('landing');
}

// Boot
window.addEventListener('DOMContentLoaded', ()=>{
  makeBoard();
  updateActivePills();
  // buttons
  qs('#btn-vs-cpu').addEventListener('click', ()=> startGame('cpu'));
  qs('#btn-local').addEventListener('click', ()=> startGame('local'));
  qs('#btn-reset').addEventListener('click', ()=> resetRound(true));
  qs('#btn-menu').addEventListener('click', backToMenu);
  // first interaction primes audio
  document.body.addEventListener('pointerdown', ensureAudio, { once: true });
});
