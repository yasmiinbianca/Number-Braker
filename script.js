const COLUMNS = 8;
const BASE_DESCENT_INTERVAL = 20;

// ==========================================
// 1. SOUND MANAGER
// ==========================================
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.ctx = new AudioContext();
            this.initialized = true;
        }
    }

    playTone(freq, type, duration, vol, slideFreq = null) {
        if (!this.enabled || !this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slideFreq) {
            osc.frequency.exponentialRampToValueAtTime(slideFreq, this.ctx.currentTime + duration);
        }
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    shoot() { this.playTone(400, 'sine', 0.1, 0.1, 600); }
    hit() { this.playTone(150, 'square', 0.1, 0.1); }
    destroy() { this.playTone(200, 'sawtooth', 0.2, 0.1, 100); }
    combo(comboVal) { this.playTone(300 + comboVal * 50, 'sine', 0.15, 0.1); }
    levelUp() { 
        this.playTone(440, 'sine', 0.2, 0.1);
        setTimeout(() => this.playTone(554, 'sine', 0.2, 0.1), 100);
        setTimeout(() => this.playTone(659, 'sine', 0.4, 0.1), 200);
    }
    gameOver() { this.playTone(300, 'sawtooth', 0.8, 0.1, 100); }
    click() { this.playTone(600, 'sine', 0.05, 0.05); }
    phaseComplete() { 
        this.playTone(523.25, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.1), 150);
        setTimeout(() => this.playTone(783.99, 'sine', 0.1, 0.1), 300);
        setTimeout(() => this.playTone(1046.50, 'sine', 0.3, 0.1), 450);
    }
    powerup() { this.playTone(800, 'sine', 0.3, 0.1, 200); }
    coin() { this.playTone(1200, 'sine', 0.1, 0.05, 1500); }
    crit() { this.playTone(800, 'square', 0.15, 0.1, 400); }
}
const sound = new SoundManager();

// ==========================================
// 2. SAVE MANAGER
// ==========================================
const DEFAULT_SAVE = {
    coins: 0,
    level: 1,
    xp: 0,
    shopLevels: {
        scoreMult: 1, coinMult: 1, projSpeed: 1, extraLine: 0
    },
    powerups: {
        bomb: 3, half: 3, ray: 1, freeze: 1
    },
    achievements: { unlocked: [], progress: {} },
    bestScore: 0,
    stats: {
        destroyed: 0, bombsUsed: 0, raysUsed: 0, totalCoins: 0
    },
    gameState: null
};

class SaveManager {
    static load() {
        const data = localStorage.getItem('numcrush_save');
        if (data) {
            try {
                return { ...DEFAULT_SAVE, ...JSON.parse(data) };
            } catch (e) {
                console.error("Failed to load save", e);
                return JSON.parse(JSON.stringify(DEFAULT_SAVE));
            }
        }
        return JSON.parse(JSON.stringify(DEFAULT_SAVE));
    }

    static save(data) {
        localStorage.setItem('numcrush_save', JSON.stringify(data));
    }
}
let saveData = SaveManager.load();

// ==========================================
// 3. PARTICLE SYSTEM
// ==========================================
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 200 + 50;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.maxLife = Math.random() * 0.5 + 0.5;
        this.size = Math.random() * 4 + 2;
        this.gravity = 300;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += this.gravity * dt;
        this.life -= dt;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// ==========================================
// 4. FLOATING TEXT SYSTEM
// ==========================================
class FloatingText {
    constructor(x, y, text, color, isCrit = false) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 1.0;
        this.vy = -50;
        this.isCrit = isCrit;
    }
    update(dt) {
        this.y += this.vy * dt;
        this.life -= dt;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.font = this.isCrit ? "bold 24px Arial" : "bold 20px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.text, this.x, this.y);
        ctx.globalAlpha = 1.0;
    }
}

// ==========================================
// 5. ACHIEVEMENT SYSTEM
// ==========================================
const ACHIEVEMENTS_DATA = [
    { id: 'first_blood', name: '🎯 Primeiro Sangue', desc: 'Destrua seu primeiro quadrado.', reward: 10, check: (s) => s.stats.destroyed >= 1 },
    { id: 'score_100', name: '💯 Centenário', desc: 'Faça 100 pontos.', reward: 20, check: (s) => game && game.score >= 100 },
    { id: 'combo_3', name: '🔥 Combo x3', desc: 'Faça um combo 3x.', reward: 30, check: (s) => game && game.combo >= 3 },
    { id: 'combo_5', name: '🔥🔥 Combo x5', desc: 'Faça um combo 5x.', reward: 50, check: (s) => game && game.combo >= 5 },
    { id: 'score_1000', name: '⭐ Mil Pontos', desc: 'Faça 1000 pontos.', reward: 50, check: (s) => game && game.score >= 1000 },
    { id: 'rich', name: '💰 Rico', desc: 'Colete 500 moedas no total.', reward: 30, check: (s) => s.stats.totalCoins >= 500 },
    { id: 'phase_5', name: '📊 Fase 5', desc: 'Chegue na fase 5.', reward: 50, check: (s) => game && game.phase >= 5 },
    { id: 'phase_10', name: '📊 Fase 10', desc: 'Chegue na fase 10.', reward: 100, check: (s) => game && game.phase >= 10 },
    { id: 'dest_50', name: '💀 50 Destruídos', desc: 'Destrua 50 quadrados no total.', reward: 40, check: (s) => s.stats.destroyed >= 50 },
    { id: 'dest_200', name: '💀 200 Destruídos', desc: 'Destrua 200 quadrados no total.', reward: 80, check: (s) => s.stats.destroyed >= 200 },
    { id: 'level_5', name: '🌟 Nível 5', desc: 'Chegue ao nível 5 de jogador.', reward: 50, check: (s) => s.level >= 5 },
    { id: 'level_10', name: '🌟 Nível 10', desc: 'Chegue ao nível 10 de jogador.', reward: 100, check: (s) => s.level >= 10 },
    { id: 'bomb_5', name: '💣 Bombardeiro', desc: 'Use 5 bombas.', reward: 30, check: (s) => s.stats.bombsUsed >= 5 },
    { id: 'ray_5', name: '⚡ Tempestade', desc: 'Use 5 raios.', reward: 30, check: (s) => s.stats.raysUsed >= 5 },
    { id: 'legend', name: '🏆 Lenda', desc: 'Faça 10000 pontos.', reward: 200, check: (s) => game && game.score >= 10000 }
];

class AchievementSystem {
    static check() {
        ACHIEVEMENTS_DATA.forEach(ach => {
            if (!saveData.achievements.unlocked.includes(ach.id) && ach.check(saveData)) {
                this.unlock(ach);
            }
        });
    }

    static unlock(ach) {
        saveData.achievements.unlocked.push(ach.id);
        saveData.coins += ach.reward;
        SaveManager.save(saveData);
        
        const notif = document.getElementById('achievementNotif');
        const text = document.getElementById('achievementNotifText');
        text.innerText = `Conquista: ${ach.name} (+${ach.reward}🪙)`;
        notif.classList.remove('hidden');
        notif.style.animation = 'none';
        notif.offsetHeight; // trigger reflow
        notif.style.animation = 'slideInRight 0.5s ease, fadeOut 0.5s ease 2.5s forwards';
        
        setTimeout(() => {
            notif.classList.add('hidden');
        }, 3000);
        
        sound.levelUp();
        updateUI();
    }

    static render() {
        const list = document.getElementById('achievementsList');
        list.innerHTML = '';
        ACHIEVEMENTS_DATA.forEach(ach => {
            const unlocked = saveData.achievements.unlocked.includes(ach.id);
            const div = document.createElement('div');
            div.className = `achievement-entry ${unlocked ? 'unlocked' : 'locked'}`;
            div.innerHTML = `
                <div class="achievement-icon">${ach.name.split(' ')[0]}</div>
                <div class="achievement-info">
                    <div class="achievement-name">${ach.name}</div>
                    <div class="achievement-desc">${ach.desc}</div>
                </div>
                <div class="achievement-reward">${ach.reward} 🪙</div>
            `;
            list.appendChild(div);
        });
    }
}

// ==========================================
// 6. SHOP SYSTEM
// ==========================================
const SHOP_ITEMS = [
    { id: 'bomb', name: 'Bomba Extra', icon: '💣', desc: 'Adiciona 1 bomba.', getCost: () => 50, maxLevel: Infinity, action: () => saveData.powerups.bomb++ },
    { id: 'half', name: 'Metade Extra', icon: '½', desc: 'Adiciona 1 metade.', getCost: () => 50, maxLevel: Infinity, action: () => saveData.powerups.half++ },
    { id: 'ray', name: 'Raio Extra', icon: '⚡', desc: 'Adiciona 1 raio.', getCost: () => 75, maxLevel: Infinity, action: () => saveData.powerups.ray++ },
    { id: 'freeze', name: 'Congelamento Extra', icon: '❄️', desc: 'Adiciona 1 congelamento.', getCost: () => 60, maxLevel: Infinity, action: () => saveData.powerups.freeze++ },
    { id: 'scoreMult', name: 'Multiplicador de Pontos', icon: '⭐', desc: 'Aumenta os pontos em 0.5x.', getCost: (l) => 200 * l, maxLevel: 5, action: () => saveData.shopLevels.scoreMult++ },
    { id: 'coinMult', name: 'Multiplicador de Moedas', icon: '🪙', desc: 'Aumenta moedas em 0.5x.', getCost: (l) => 250 * l, maxLevel: 5, action: () => saveData.shopLevels.coinMult++ },
    { id: 'projSpeed', name: 'Alcance do Projétil', icon: '🎯', desc: 'Projétil 20% mais rápido.', getCost: (l) => 150 * l, maxLevel: 3, action: () => saveData.shopLevels.projSpeed++ },
    { id: 'extraLine', name: 'Linha Extra', icon: '🛡️', desc: 'Move a linha de derrota para baixo.', getCost: (l) => 300 * Math.max(1, l), maxLevel: 2, action: () => saveData.shopLevels.extraLine++ },
];

class ShopSystem {
    static render() {
        document.getElementById('shopCoins').innerText = saveData.coins;
        const list = document.getElementById('shopItems');
        list.innerHTML = '';
        SHOP_ITEMS.forEach(item => {
            const isPowerup = ['bomb','half','ray','freeze'].includes(item.id);
            const level = isPowerup ? 1 : (saveData.shopLevels[item.id] || 1);
            const cost = item.getCost(level);
            const isMax = !isPowerup && level >= item.maxLevel;
            
            const div = document.createElement('div');
            div.className = `shop-item ${isMax ? 'max-level' : ''}`;
            div.innerHTML = `
                <div class="shop-item-icon">${item.icon}</div>
                <div class="shop-item-info">
                    <div class="shop-item-name">${item.name}</div>
                    <div class="shop-item-desc">${item.desc}</div>
                    <div class="shop-item-level">${isPowerup ? `(Tem: ${saveData.powerups[item.id]})` : (isMax ? 'MÁXIMO' : `Nível ${level}/${item.maxLevel}`)}</div>
                </div>
                <button class="shop-buy-btn" ${isMax || saveData.coins < cost ? 'disabled' : ''}>
                    ${isMax ? 'MÁX' : cost + ' 🪙'}
                </button>
            `;
            if (!isMax) {
                div.querySelector('button').addEventListener('click', () => {
                    if (saveData.coins >= cost) {
                        sound.coin();
                        saveData.coins -= cost;
                        item.action();
                        SaveManager.save(saveData);
                        ShopSystem.render();
                        updateUI();
                    }
                });
            }
            list.appendChild(div);
        });
    }
}

// ==========================================
// 7. GAME LOGIC
// ==========================================
function getColorForValue(val) {
    if (val <= 1) return '#22c55e';
    if (val === 2) return '#14b8a6';
    if (val === 3) return '#3b82f6';
    if (val === 4) return '#6366f1';
    if (val === 5) return '#8b5cf6';
    if (val === 6) return '#ec4899';
    if (val === 7) return '#ef4444';
    if (val === 8) return '#f97316';
    if (val === 9) return '#f59e0b';
    return '#dc2626';
}

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        this.particles = [];
        this.floatingTexts = [];
        this.grid = [];
        this.projectile = null;
        
        this.score = 0;
        this.phase = 1;
        this.combo = 1;
        this.streak = 0;
        
        this.lastDestroyTime = 0;
        this.descentTimer = 0;
        this.descentInterval = 20;
        
        this.freezeTimeRemaining = 0;
        
        this.mouse = { x: 0, y: 0 };
        this.isAiming = false;
        
        this.activePowerup = null;
        this.currentSquareValue = 1;
        this.nextSquareValue = 1;
        
        this.state = 'IDLE'; // IDLE, PLAYING, PAUSED, GAMEOVER, PHASE_COMPLETE
        
        this.lastTime = 0;
        this.reqAnim = null;
        this.shakeTime = 0;
        
        this.cellSize = 0;
        
        this.setupInput();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const topHudEl = document.getElementById('topHud');
        const bottomHudEl = document.getElementById('bottomHud');
        const topH = topHudEl ? topHudEl.offsetHeight : 60;
        const bottomH = bottomHudEl ? bottomHudEl.offsetHeight : 70;
        const screenEl = document.getElementById('gameScreen');
        const maxW = Math.min(screenEl ? screenEl.clientWidth : window.innerWidth, 500);
        this.canvas.width = maxW;
        this.canvas.height = window.innerHeight - topH - bottomH;
        
        this.cellSize = this.canvas.width / COLUMNS;
    }

    start(resume = false) {
        this.resize();
        this.state = 'PLAYING';
        this.particles = [];
        this.floatingTexts = [];
        this.projectile = null;
        this.activePowerup = null;
        this.freezeTimeRemaining = 0;
        document.getElementById('freezeOverlay').classList.add('hidden');
        
        if (resume && saveData.gameState) {
            this.score = saveData.gameState.score;
            this.phase = saveData.gameState.phase;
            this.grid = saveData.gameState.grid;
            this.descentTimer = saveData.gameState.descentTimer;
            this.currentSquareValue = this.getRandomShooterValue();
            this.nextSquareValue = this.getRandomShooterValue();
        } else {
            this.score = 0;
            this.phase = 1;
            this.combo = 1;
            this.streak = 0;
            this.generatePhase();
        }
        
        updateUI();
        this.lastTime = performance.now();
        if (this.reqAnim) cancelAnimationFrame(this.reqAnim);
        this.loop(this.lastTime);
        this.autoSaveInterval = setInterval(() => this.autoSave(), 30000);
    }

    autoSave() {
        if (this.state === 'PLAYING') {
            saveData.gameState = {
                score: this.score,
                phase: this.phase,
                grid: this.grid,
                descentTimer: this.descentTimer
            };
            SaveManager.save(saveData);
        }
    }

    generatePhase() {
        this.grid = [];
        const rows = 3 + Math.floor(this.phase / 5);
        const maxNum = Math.min(5 + this.phase, 20);
        this.descentInterval = Math.max(20 - this.phase, 8);
        this.descentTimer = this.descentInterval;
        
        for (let r = 0; r < Math.min(rows, 6); r++) {
            for (let c = 0; c < COLUMNS; c++) {
                this.grid.push({
                    r: r,
                    c: c,
                    val: Math.floor(Math.random() * maxNum) + 1,
                    isGolden: Math.random() < 0.05
                });
            }
        }
        this.currentSquareValue = this.getRandomShooterValue();
        this.nextSquareValue = this.getRandomShooterValue();
        updateUI();
    }

    getRandomShooterValue() {
        const maxShooter = Math.min(3 + Math.floor(this.phase / 3), 10);
        return Math.floor(Math.random() * maxShooter) + 1;
    }

    addXP(amount) {
        saveData.xp += amount;
        let xpNeeded = saveData.level * 100;
        while (saveData.xp >= xpNeeded) {
            saveData.xp -= xpNeeded;
            saveData.level++;
            saveData.coins += 20;
            // Random powerup
            const pTypes = ['bomb', 'half', 'ray', 'freeze'];
            const pType = pTypes[Math.floor(Math.random() * pTypes.length)];
            saveData.powerups[pType]++;
            
            sound.levelUp();
            const n = document.getElementById('levelUpNotif');
            document.getElementById('levelUpValue').innerText = saveData.level;
            n.classList.remove('hidden');
            n.style.animation = 'none';
            n.offsetHeight;
            n.style.animation = 'levelUp 1.5s ease forwards';
            setTimeout(() => n.classList.add('hidden'), 3000);
            
            xpNeeded = saveData.level * 100;
            AchievementSystem.check();
        }
        updateUI();
    }

    addScore(val, multiplierBase, isCombo = false) {
        const mult = 1 + (saveData.shopLevels.scoreMult - 1) * 0.5;
        let pts = val * 10 * mult;
        if (isCombo) pts *= this.combo;
        this.score += Math.floor(pts);
    }

    addCoins(val, isGolden) {
        const mult = 1 + (saveData.shopLevels.coinMult - 1) * 0.5;
        let c = val * mult;
        if (isGolden) c *= 5;
        const earned = Math.floor(c);
        saveData.coins += earned;
        saveData.stats.totalCoins += earned;
        return earned;
    }

    destroySquare(sq, isChain = false) {
        sound.destroy();
        this.grid = this.grid.filter(s => s !== sq);
        
        saveData.stats.destroyed++;
        AchievementSystem.check();
        
        // Particles
        const x = sq.c * this.cellSize + this.cellSize/2;
        const y = sq.r * this.cellSize + this.cellSize/2;
        const color = getColorForValue(sq.val);
        for(let i=0; i<15; i++) this.particles.push(new Particle(x, y, color));
        if (sq.isGolden) {
            for(let i=0; i<10; i++) this.particles.push(new Particle(x, y, '#fbbf24'));
        }
        
        // Score & Coins
        const coinsEarned = this.addCoins(sq.val, sq.isGolden);
        this.addScore(sq.val, 1, true);
        this.addXP(sq.val * 2);
        
        this.floatingTexts.push(new FloatingText(x, y - 20, `+${Math.floor(sq.val*10*this.combo)}`, color));
        if (coinsEarned > 0) {
            this.floatingTexts.push(new FloatingText(x, y + 20, `+${coinsEarned} 🪙`, '#fbbf24'));
        }
        
        // Chain Reaction
        if (!isChain) {
            const neighbors = this.grid.filter(n => 
                Math.abs(n.r - sq.r) <= 1 && Math.abs(n.c - sq.c) <= 1
            );
            neighbors.forEach(n => {
                if (n.val <= 1) {
                    setTimeout(() => this.destroySquare(n, true), 100);
                }
            });
        }
        
        this.checkPhaseComplete();
    }

    checkPhaseComplete() {
        if (this.grid.length === 0 && this.state === 'PLAYING') {
            this.state = 'PHASE_COMPLETE';
            sound.phaseComplete();
            const perfectClear = this.descentTimer === this.descentInterval ? 50 : 0;
            const phaseBonus = 10 * this.phase;
            saveData.coins += phaseBonus + perfectClear;
            saveData.stats.totalCoins += phaseBonus + perfectClear;
            
            document.getElementById('phaseScore').innerText = this.score;
            document.getElementById('phaseCoins').innerText = phaseBonus + perfectClear;
            document.getElementById('phaseDestroyed').innerText = saveData.stats.destroyed;
            
            document.getElementById('phaseCompleteModal').classList.remove('hidden');
            this.autoSave();
        }
    }

    gameOver() {
        this.state = 'GAMEOVER';
        sound.gameOver();
        
        let newHigh = false;
        if (this.score > saveData.bestScore) {
            saveData.bestScore = this.score;
            newHigh = true;
        }
        
        // Check Ranking
        let rankings = JSON.parse(localStorage.getItem('numcrush_ranking') || '[]');
        rankings.push({ score: this.score, phase: this.phase, date: new Date().toLocaleDateString() });
        rankings.sort((a,b) => b.score - a.score);
        rankings = rankings.slice(0, 10);
        localStorage.setItem('numcrush_ranking', JSON.stringify(rankings));
        
        document.getElementById('finalScore').innerText = this.score;
        document.getElementById('finalPhase').innerText = this.phase;
        document.getElementById('finalCoins').innerText = saveData.coins;
        if (newHigh) document.getElementById('newHighScore').classList.remove('hidden');
        else document.getElementById('newHighScore').classList.add('hidden');
        
        document.getElementById('gameOverModal').classList.remove('hidden');
        saveData.gameState = null;
        SaveManager.save(saveData);
    }

    shoot() {
        if (this.projectile || this.activePowerup || this.state !== 'PLAYING') return;
        
        const dx = this.mouse.x - this.canvas.width/2;
        const dy = this.mouse.y - this.canvas.height;
        let angle = Math.atan2(dy, dx);
        
        // Clamp angle to prevent shooting too flat
        if (angle > -0.1) angle = -0.1;
        if (angle < -Math.PI + 0.1) angle = -Math.PI + 0.1;
        
        const speedMult = 1 + (saveData.shopLevels.projSpeed - 1) * 0.2;
        const speed = 1000 * speedMult;
        
        sound.shoot();
        
        this.projectile = {
            x: this.canvas.width / 2,
            y: this.canvas.height - 20,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            val: this.currentSquareValue,
            radius: this.cellSize * 0.4
        };
        
        this.currentSquareValue = this.nextSquareValue;
        this.nextSquareValue = this.getRandomShooterValue();
        updateUI();
    }

    handlePowerupClick(r, c) {
        if (this.activePowerup === 'bomb') {
            sound.powerup();
            for (let i = this.grid.length - 1; i >= 0; i--) {
                const sq = this.grid[i];
                if (Math.abs(sq.r - r) <= 1 && Math.abs(sq.c - c) <= 1) {
                    this.destroySquare(sq);
                }
            }
            saveData.powerups.bomb--;
            saveData.stats.bombsUsed++;
        } else if (this.activePowerup === 'half') {
            sound.powerup();
            const sq = this.grid.find(s => s.r === r && s.c === c);
            if (sq) {
                sq.val = Math.floor(sq.val / 2);
                if (sq.val <= 0) this.destroySquare(sq);
            }
            saveData.powerups.half--;
        } else if (this.activePowerup === 'ray') {
            sound.powerup();
            for (let i = this.grid.length - 1; i >= 0; i--) {
                if (this.grid[i].r === r) {
                    this.destroySquare(this.grid[i]);
                }
            }
            saveData.powerups.ray--;
            saveData.stats.raysUsed++;
        }
        
        this.activePowerup = null;
        document.querySelectorAll('.powerup-btn').forEach(b => b.classList.remove('active'));
        updateUI();
        AchievementSystem.check();
    }

    activatePowerup(type) {
        if (saveData.powerups[type] <= 0 || this.state !== 'PLAYING') return;
        
        if (type === 'freeze') {
            sound.powerup();
            this.freezeTimeRemaining = 10;
            saveData.powerups.freeze--;
            document.getElementById('freezeOverlay').classList.remove('hidden');
            updateUI();
            return;
        }
        
        if (this.activePowerup === type) {
            this.activePowerup = null;
            document.querySelectorAll('.powerup-btn').forEach(b => b.classList.remove('active'));
            return;
        }
        
        this.activePowerup = type;
        document.querySelectorAll('.powerup-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.powerup-btn[data-power="${type}"]`).classList.add('active');
    }

    setupInput() {
        const getEvPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
            }
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        const onMove = (e) => {
            e.preventDefault();
            this.mouse = getEvPos(e);
            this.isAiming = true;
        };

        const onDown = (e) => {
            e.preventDefault();
            this.mouse = getEvPos(e);
            if (e.button === 2) { // Right click cancel powerup
                if (this.activePowerup) {
                    this.activePowerup = null;
                    document.querySelectorAll('.powerup-btn').forEach(b => b.classList.remove('active'));
                }
                return;
            }
            
            if (this.activePowerup) {
                const c = Math.floor(this.mouse.x / this.cellSize);
                const r = Math.floor(this.mouse.y / this.cellSize);
                this.handlePowerupClick(r, c);
            } else {
                this.shoot();
            }
        };

        this.canvas.addEventListener('mousemove', onMove);
        this.canvas.addEventListener('mousedown', onDown);
        this.canvas.addEventListener('touchmove', onMove, {passive: false});
        this.canvas.addEventListener('touchstart', onDown, {passive: false});
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
        
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.activePowerup) {
                    this.activePowerup = null;
                    document.querySelectorAll('.powerup-btn').forEach(b => b.classList.remove('active'));
                } else if (this.state === 'PLAYING') {
                    pauseGame();
                }
            } else if (e.key === '1') this.activatePowerup('bomb');
            else if (e.key === '2') this.activatePowerup('half');
            else if (e.key === '3') this.activatePowerup('ray');
            else if (e.key === '4') this.activatePowerup('freeze');
        });
    }

    update(dt) {
        if (this.state !== 'PLAYING') return;

        // Freeze Timer
        if (this.freezeTimeRemaining > 0) {
            this.freezeTimeRemaining -= dt;
            if (this.freezeTimeRemaining <= 0) {
                document.getElementById('freezeOverlay').classList.add('hidden');
            }
        } else {
            // Descent Timer
            this.descentTimer -= dt;
            if (this.descentTimer <= 0) {
                this.descentTimer = this.descentInterval;
                this.moveGridDown();
            }
        }

        // Projectile physics
        if (this.projectile) {
            const p = this.projectile;
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Wall bounce
            if (p.x - p.radius < 0) {
                p.x = p.radius;
                p.vx *= -1;
            } else if (p.x + p.radius > this.canvas.width) {
                p.x = this.canvas.width - p.radius;
                p.vx *= -1;
            }

            // Top boundary
            if (p.y - p.radius < 0) {
                this.streak = 0;
                this.projectile = null;
            } else {
                // Collision with grid
                let hit = false;
                for (let sq of this.grid) {
                    const sqX = sq.c * this.cellSize;
                    const sqY = sq.r * this.cellSize;
                    // simple AABB / circle-rect
                    if (p.x + p.radius > sqX && p.x - p.radius < sqX + this.cellSize &&
                        p.y + p.radius > sqY && p.y - p.radius < sqY + this.cellSize) {
                        
                        this.handleHit(sq);
                        hit = true;
                        break;
                    }
                }
                if (hit) {
                    this.projectile = null;
                }
            }
        }

        // Particles
        this.particles.forEach(p => p.update(dt));
        this.particles = this.particles.filter(p => p.life > 0);
        
        // Floating Texts
        this.floatingTexts.forEach(t => t.update(dt));
        this.floatingTexts = this.floatingTexts.filter(t => t.life > 0);
        
        // Shake
        if (this.shakeTime > 0) this.shakeTime -= dt;
    }

    handleHit(sq) {
        sound.hit();
        let dmg = this.projectile.val;
        
        // Critical hit
        const isCrit = Math.random() < 0.15;
        if (isCrit) {
            dmg *= 2;
            sound.crit();
            this.floatingTexts.push(new FloatingText(sq.c * this.cellSize + this.cellSize/2, sq.r * this.cellSize, 'CRIT!', '#ff0000', true));
        }

        sq.val -= dmg;
        this.streak++;
        if (this.streak > 0 && this.streak % 10 === 0) {
            const pTypes = ['bomb', 'half', 'ray', 'freeze'];
            const pType = pTypes[Math.floor(Math.random() * pTypes.length)];
            saveData.powerups[pType]++;
            updateUI();
            this.floatingTexts.push(new FloatingText(this.canvas.width/2, this.canvas.height - 50, '+1 Powerup!', '#00ff00'));
        }

        if (sq.val <= 0) {
            const now = performance.now();
            if (now - this.lastDestroyTime <= 2000) {
                this.combo = Math.min(this.combo + 1, 10);
                if (this.combo >= 3) this.shakeTime = 0.2;
            } else {
                this.combo = 1;
            }
            this.lastDestroyTime = now;
            sound.combo(this.combo);
            
            // Show combo display
            if (this.combo >= 2) {
                const comboDisp = document.getElementById('comboDisplay');
                document.getElementById('comboText').innerText = `COMBO x${this.combo}!`;
                comboDisp.classList.remove('hidden');
                comboDisp.style.animation = 'none';
                comboDisp.offsetHeight;
                comboDisp.style.animation = 'comboAppear 0.8s ease-out forwards';
                setTimeout(() => comboDisp.classList.add('hidden'), 800);
            }
            
            this.destroySquare(sq);
        } else {
            // Show subtraction visual feedback
            const cx = sq.c * this.cellSize + this.cellSize/2;
            const cy = sq.r * this.cellSize + this.cellSize/2;
            this.floatingTexts.push(new FloatingText(cx, cy - 15, `-${dmg}`, '#ffffff'));
            // Small particle burst
            const color = getColorForValue(sq.val + dmg);
            for (let i = 0; i < 5; i++) this.particles.push(new Particle(cx, cy, color));
        }
    }

    moveGridDown() {
        this.grid.forEach(sq => sq.r++);
        
        // Add new row at top
        const maxNum = Math.min(5 + this.phase, 20);
        for (let c = 0; c < COLUMNS; c++) {
            // 70% chance to spawn a block in a cell
            if (Math.random() < 0.7) {
                this.grid.push({
                    r: 0,
                    c: c,
                    val: Math.floor(Math.random() * maxNum) + 1,
                    isGolden: Math.random() < 0.05
                });
            }
        }
        
        // Check game over
        const defeatRow = Math.floor((this.canvas.height * 0.75) / this.cellSize) + saveData.shopLevels.extraLine;
        if (this.grid.some(sq => sq.r >= defeatRow)) {
            this.gameOver();
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        if (this.shakeTime > 0) {
            const dx = (Math.random() - 0.5) * 10;
            const dy = (Math.random() - 0.5) * 10;
            this.ctx.translate(dx, dy);
        }

        // Draw Defeat Line
        const defeatRow = Math.floor((this.canvas.height * 0.75) / this.cellSize) + saveData.shopLevels.extraLine;
        const defeatY = defeatRow * this.cellSize;
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, defeatY);
        this.ctx.lineTo(this.canvas.width, defeatY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw Grid
        this.ctx.font = "bold 20px 'Fredoka', sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        
        for (let sq of this.grid) {
            const x = sq.c * this.cellSize;
            const y = sq.r * this.cellSize;
            const pad = 2;
            
            this.ctx.fillStyle = getColorForValue(sq.val);
            this.ctx.beginPath();
            this.ctx.roundRect(x + pad, y + pad, this.cellSize - pad*2, this.cellSize - pad*2, 8);
            this.ctx.fill();
            
            if (sq.isGolden) {
                this.ctx.strokeStyle = '#fbbf24';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
                // Glow
                this.ctx.shadowColor = '#fbbf24';
                this.ctx.shadowBlur = 10;
                this.ctx.stroke();
                this.ctx.shadowBlur = 0;
            }
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillText(sq.val, x + this.cellSize/2, y + this.cellSize/2);
        }

        // Draw Projectile
        if (this.projectile) {
            const p = this.projectile;
            this.ctx.fillStyle = getColorForValue(p.val);
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = "bold 16px 'Fredoka', sans-serif";
            this.ctx.fillText(p.val, p.x, p.y);
        }

        // Draw Aim Line
        if (!this.projectile && !this.activePowerup && this.isAiming) {
            const dx = this.mouse.x - this.canvas.width/2;
            const dy = this.mouse.y - this.canvas.height;
            let angle = Math.atan2(dy, dx);
            if (angle > -0.1) angle = -0.1;
            if (angle < -Math.PI + 0.1) angle = -Math.PI + 0.1;
            
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.canvas.width/2, this.canvas.height - 20);
            this.ctx.lineTo(this.canvas.width/2 + Math.cos(angle)*500, this.canvas.height - 20 + Math.sin(angle)*500);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        // Draw Shooter
        if (!this.projectile) {
            const sx = this.canvas.width / 2;
            const sy = this.canvas.height - 20;
            const sSize = this.cellSize * 0.8;
            this.ctx.fillStyle = getColorForValue(this.currentSquareValue);
            this.ctx.beginPath();
            this.ctx.roundRect(sx - sSize/2, sy - sSize/2, sSize, sSize, 8);
            this.ctx.fill();
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = "bold 20px 'Fredoka', sans-serif";
            this.ctx.fillText(this.currentSquareValue, sx, sy);
        }

        // Powerup Aim Highlight
        if (this.activePowerup) {
            const c = Math.floor(this.mouse.x / this.cellSize);
            const r = Math.floor(this.mouse.y / this.cellSize);
            
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            if (this.activePowerup === 'bomb') {
                this.ctx.fillRect((c-1)*this.cellSize, (r-1)*this.cellSize, this.cellSize*3, this.cellSize*3);
            } else if (this.activePowerup === 'half') {
                this.ctx.fillRect(c*this.cellSize, r*this.cellSize, this.cellSize, this.cellSize);
            } else if (this.activePowerup === 'ray') {
                this.ctx.fillRect(0, r*this.cellSize, this.canvas.width, this.cellSize);
            }
        }

        // Draw Particles & Texts
        this.particles.forEach(p => p.draw(this.ctx));
        this.floatingTexts.forEach(t => t.draw(this.ctx));

        // Combo reset check
        if (performance.now() - this.lastDestroyTime > 2000) {
            this.combo = 1;
        }

        this.ctx.restore();
    }

    loop(timestamp) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        
        if (dt < 0.1) { // Prevent huge jumps
            this.update(dt);
            this.draw();
        }
        
        this.reqAnim = requestAnimationFrame((ts) => this.loop(ts));
    }
}

// ==========================================
// 8. INITIALIZATION & UI
// ==========================================
let game = null;

function updateUI() {
    // Top HUD
    document.getElementById('scoreDisplay').innerText = game ? game.score : 0;
    document.getElementById('coinDisplay').innerText = saveData.coins;
    document.getElementById('phaseDisplay').innerText = game ? game.phase : 1;
    document.getElementById('levelDisplay').innerText = `Nv. ${saveData.level}`;
    
    const xpNeeded = saveData.level * 100;
    const xpPct = Math.min(100, (saveData.xp / xpNeeded) * 100);
    document.getElementById('xpBar').style.width = `${xpPct}%`;

    // Bottom HUD (Powerups)
    const pTypes = ['bomb', 'half', 'ray', 'freeze'];
    pTypes.forEach(p => {
        const count = saveData.powerups[p];
        const btn = document.querySelector(`.powerup-btn[data-power="${p}"]`);
        const countEl = document.getElementById(`pw${p.charAt(0).toUpperCase() + p.slice(1)}Count`);
        if (countEl) countEl.innerText = count;
        if (btn) {
            if (count <= 0) btn.classList.add('disabled');
            else btn.classList.remove('disabled');
        }
    });

    if (game && game.nextSquareValue) {
        document.getElementById('nextSquareValue').innerText = game.nextSquareValue;
        document.getElementById('nextSquarePreview').style.backgroundColor = getColorForValue(game.nextSquareValue);
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function initDOM() {
    game = new Game(document.getElementById('gameCanvas'));
    
    // Start Screen
    document.getElementById('startBestScore').innerText = `Melhor: ${saveData.bestScore}`;
    document.getElementById('startLevel').innerText = `Nível: ${saveData.level}`;
    
    document.getElementById('btnPlay').addEventListener('click', () => {
        sound.init();
        sound.click();
        showScreen('gameScreen');
        if (saveData.gameState) {
            // Optional: ask to resume, but let's just resume directly
            game.start(true);
        } else {
            game.start(false);
        }
    });

    // Pause
    document.getElementById('btnPause').addEventListener('click', pauseGame);
    document.getElementById('btnResume').addEventListener('click', () => {
        sound.click();
        document.getElementById('pauseModal').classList.add('hidden');
        game.state = 'PLAYING';
    });
    document.getElementById('btnQuit').addEventListener('click', () => {
        sound.click();
        game.autoSave();
        document.getElementById('pauseModal').classList.add('hidden');
        showScreen('startScreen');
    });

    // Shop
    document.getElementById('btnShop').addEventListener('click', () => {
        sound.click();
        ShopSystem.render();
        document.getElementById('shopModal').classList.remove('hidden');
    });
    document.getElementById('btnPhaseShop').addEventListener('click', () => {
        sound.click();
        ShopSystem.render();
        document.getElementById('shopModal').classList.remove('hidden');
    });
    document.getElementById('btnCloseShop').addEventListener('click', () => {
        sound.click();
        document.getElementById('shopModal').classList.add('hidden');
        updateUI();
    });

    // Phase Complete
    document.getElementById('btnNextPhase').addEventListener('click', () => {
        sound.click();
        document.getElementById('phaseCompleteModal').classList.add('hidden');
        game.phase++;
        game.generatePhase();
        game.state = 'PLAYING';
    });

    // Game Over
    document.getElementById('btnRestart').addEventListener('click', () => {
        sound.click();
        document.getElementById('gameOverModal').classList.add('hidden');
        game.start(false);
    });
    document.getElementById('btnGameOverMenu').addEventListener('click', () => {
        sound.click();
        document.getElementById('gameOverModal').classList.add('hidden');
        document.getElementById('startBestScore').innerText = `Melhor: ${saveData.bestScore}`;
        document.getElementById('startLevel').innerText = `Nível: ${saveData.level}`;
        showScreen('startScreen');
    });

    // Ranking
    document.getElementById('btnRanking').addEventListener('click', () => {
        sound.click();
        const list = document.getElementById('rankingList');
        list.innerHTML = '';
        const rankings = JSON.parse(localStorage.getItem('numcrush_ranking') || '[]');
        rankings.forEach((r, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;
            const div = document.createElement('div');
            div.className = 'ranking-entry';
            div.innerHTML = `
                <div class="ranking-pos">${medal}</div>
                <div class="ranking-info">
                    <div class="ranking-score">${r.score} pts</div>
                    <div class="ranking-detail">Fase ${r.phase} - ${r.date}</div>
                </div>
            `;
            list.appendChild(div);
        });
        document.getElementById('rankingModal').classList.remove('hidden');
    });
    document.getElementById('btnCloseRanking').addEventListener('click', () => {
        sound.click();
        document.getElementById('rankingModal').classList.add('hidden');
    });

    // Achievements
    document.getElementById('btnAchievements').addEventListener('click', () => {
        sound.click();
        AchievementSystem.render();
        document.getElementById('achievementsModal').classList.remove('hidden');
    });
    document.getElementById('btnCloseAchievements').addEventListener('click', () => {
        sound.click();
        document.getElementById('achievementsModal').classList.add('hidden');
    });

    // Powerups
    document.querySelectorAll('.powerup-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            sound.click();
            const power = e.currentTarget.getAttribute('data-power');
            game.activatePowerup(power);
        });
    });

    updateUI();
}

function pauseGame() {
    sound.click();
    game.state = 'PAUSED';
    game.autoSave();
    document.getElementById('pauseModal').classList.remove('hidden');
}

window.onload = initDOM;
