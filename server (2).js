/**
 * 坦克大战联机版 - 服务器端
 * 使用WebSocket进行实时通信
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ===== 配置 =====
const PORT = process.env.PORT || 8080;
const TICK_RATE = 60; // 服务器帧率

// ===== 游戏常量 =====
const W = 800, H = 800;
const TANK_SIZE = 30;
const TANK_COLLISION_RADIUS = TANK_SIZE / 2 * 1.5;
const TANK_SPEED = 2.5;
const ROTATE_SPEED = 0.0375;
const BULLET_SPEED = 5;
const BULLET_RADIUS = 4;
const MAX_BOUNCES = 6;
const FIRE_COOLDOWN = 400;
const MAX_HEALTH = 3;
const ROUNDS_TO_WIN = 2;
const WALL_THICKNESS = 4;

// ===== 颜色配置 =====
const COLORS = {
    tank1: '#4CAF50', tank1D: '#388E3C', tank1L: '#81C784',
    tank2: '#2196F3', tank2D: '#1976D2', tank2L: '#64B5F6',
};

// ===== 服务器状态 =====
const serverState = {
    waitingPlayers: [],  // 等待匹配的玩家
    games: new Map(),    // 进行中的游戏 roomId -> Game
    players: new Map(),  // 所有连接的玩家 ws -> Player
};

// ===== 工具函数 =====
function generateId() {
    return Math.random().toString(36).substring(2, 15);
}

function distPointToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return { dist: Math.hypot(px - cx, py - cy), cx, cy, t };
}

function segmentNormal(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len === 0) return { nx: 0, ny: -1 };
    return { nx: -dy / len, ny: dx / len };
}

// ===== 地图定义 =====
function makeBoundary() {
    const m = 10;
    return [
        { x1: m, y1: m, x2: W - m, y2: m },
        { x1: W - m, y1: m, x2: W - m, y2: H - m },
        { x1: W - m, y1: H - m, x2: m, y2: H - m },
        { x1: m, y1: H - m, x2: m, y2: m },
    ];
}

const maps = [
    {
        name: '经典十字',
        walls: [
            ...makeBoundary(),
            { x1: 300, y1: 300, x2: 500, y2: 300 },
            { x1: 300, y1: 500, x2: 500, y2: 500 },
            { x1: 300, y1: 300, x2: 300, y2: 500 },
            { x1: 500, y1: 300, x2: 500, y2: 500 },
            { x1: 100, y1: 100, x2: 200, y2: 100 },
            { x1: 100, y1: 100, x2: 100, y2: 200 },
            { x1: 700, y1: 100, x2: 600, y2: 100 },
            { x1: 700, y1: 100, x2: 700, y2: 200 },
            { x1: 100, y1: 700, x2: 200, y2: 700 },
            { x1: 100, y1: 700, x2: 100, y2: 600 },
            { x1: 700, y1: 700, x2: 600, y2: 700 },
            { x1: 700, y1: 700, x2: 700, y2: 600 },
            { x1: 200, y1: 200, x2: 250, y2: 200 },
            { x1: 600, y1: 200, x2: 550, y2: 200 },
            { x1: 200, y1: 600, x2: 250, y2: 600 },
            { x1: 600, y1: 600, x2: 550, y2: 600 },
        ],
    },
    {
        name: '堡垒',
        walls: [
            ...makeBoundary(),
            { x1: 350, y1: 350, x2: 450, y2: 350 },
            { x1: 450, y1: 350, x2: 450, y2: 450 },
            { x1: 450, y1: 450, x2: 350, y2: 450 },
            { x1: 350, y1: 450, x2: 350, y2: 350 },
            { x1: 350, y1: 350, x2: 250, y2: 350 },
            { x1: 350, y1: 350, x2: 350, y2: 250 },
            { x1: 450, y1: 350, x2: 550, y2: 350 },
            { x1: 450, y1: 350, x2: 450, y2: 250 },
            { x1: 350, y1: 450, x2: 250, y2: 450 },
            { x1: 350, y1: 450, x2: 350, y2: 550 },
            { x1: 450, y1: 450, x2: 550, y2: 450 },
            { x1: 450, y1: 450, x2: 450, y2: 550 },
            { x1: 150, y1: 150, x2: 250, y2: 150 },
            { x1: 150, y1: 150, x2: 150, y2: 250 },
            { x1: 650, y1: 150, x2: 550, y2: 150 },
            { x1: 650, y1: 150, x2: 650, y2: 250 },
            { x1: 150, y1: 650, x2: 250, y2: 650 },
            { x1: 150, y1: 650, x2: 150, y2: 550 },
            { x1: 650, y1: 650, x2: 550, y2: 650 },
            { x1: 650, y1: 650, x2: 650, y2: 550 },
            { x1: 200, y1: 400, x2: 300, y2: 400 },
            { x1: 500, y1: 400, x2: 600, y2: 400 },
            { x1: 400, y1: 200, x2: 400, y2: 300 },
            { x1: 400, y1: 500, x2: 400, y2: 600 },
        ],
    },
    {
        name: '迷宫',
        walls: [
            ...makeBoundary(),
            { x1: 100, y1: 150, x2: 300, y2: 150 },
            { x1: 500, y1: 150, x2: 700, y2: 150 },
            { x1: 100, y1: 650, x2: 300, y2: 650 },
            { x1: 500, y1: 650, x2: 700, y2: 650 },
            { x1: 150, y1: 250, x2: 150, y2: 400 },
            { x1: 150, y1: 400, x2: 150, y2: 550 },
            { x1: 650, y1: 250, x2: 650, y2: 400 },
            { x1: 650, y1: 400, x2: 650, y2: 550 },
            { x1: 250, y1: 250, x2: 400, y2: 250 },
            { x1: 400, y1: 250, x2: 550, y2: 250 },
            { x1: 250, y1: 550, x2: 400, y2: 550 },
            { x1: 400, y1: 550, x2: 550, y2: 550 },
            { x1: 350, y1: 350, x2: 450, y2: 350 },
            { x1: 350, y1: 450, x2: 450, y2: 450 },
            { x1: 350, y1: 350, x2: 350, y2: 450 },
            { x1: 450, y1: 350, x2: 450, y2: 450 },
            { x1: 300, y1: 300, x2: 300, y2: 350 },
            { x1: 500, y1: 300, x2: 500, y2: 350 },
            { x1: 300, y1: 450, x2: 300, y2: 500 },
            { x1: 500, y1: 450, x2: 500, y2: 500 },
            { x1: 200, y1: 350, x2: 250, y2: 400 },
            { x1: 600, y1: 350, x2: 550, y2: 400 },
            { x1: 200, y1: 450, x2: 250, y2: 400 },
            { x1: 600, y1: 450, x2: 550, y2: 400 },
        ],
    },
];

// ===== 玩家类 =====
class Player {
    constructor(ws) {
        this.ws = ws;
        this.id = generateId();
        this.name = `玩家${this.id.substring(0, 4)}`;
        this.roomId = null;
        this.playerNum = 0; // 1 or 2
        this.input = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            fire: false,
        };
    }

    send(type, data) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, data }));
        }
    }
}

// ===== 坦克类 =====
class Tank {
    constructor(x, y, angle, num) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.num = num;
        this.health = MAX_HEALTH;
        this.lastFire = 0;
    }

    collidesWalls(nx, ny, walls) {
        const r = TANK_COLLISION_RADIUS;
        const pts = [
            { x: nx - r, y: ny - r }, { x: nx + r, y: ny - r },
            { x: nx - r, y: ny + r }, { x: nx + r, y: ny + r },
            { x: nx, y: ny - r }, { x: nx, y: ny + r },
            { x: nx - r, y: ny }, { x: nx + r, y: ny },
        ];
        for (const w of walls) {
            for (const p of pts) {
                const res = distPointToSegment(p.x, p.y, w.x1, w.y1, w.x2, w.y2);
                if (res.dist < WALL_THICKNESS / 2 + 2) return true;
            }
        }
        return false;
    }

    forward(walls) {
        const dx = Math.cos(this.angle) * TANK_SPEED;
        const dy = Math.sin(this.angle) * TANK_SPEED;
        // 分轴移动：先尝试完整移动，再尝试单轴滑行
        if (!this.collidesWalls(this.x + dx, this.y + dy, walls)) {
            this.x += dx;
            this.y += dy;
        } else if (!this.collidesWalls(this.x + dx, this.y, walls)) {
            // X轴可以移动，沿墙Y方向滑行
            this.x += dx;
        } else if (!this.collidesWalls(this.x, this.y + dy, walls)) {
            // Y轴可以移动，沿墙X方向滑行
            this.y += dy;
        }
        // 两个方向都被挡住则不动（正常贴墙）
    }

    backward(walls) {
        const dx = Math.cos(this.angle) * TANK_SPEED;
        const dy = Math.sin(this.angle) * TANK_SPEED;
        // 分轴移动：先尝试完整移动，再尝试单轴滑行
        if (!this.collidesWalls(this.x - dx, this.y - dy, walls)) {
            this.x -= dx;
            this.y -= dy;
        } else if (!this.collidesWalls(this.x - dx, this.y, walls)) {
            this.x -= dx;
        } else if (!this.collidesWalls(this.x, this.y - dy, walls)) {
            this.y -= dy;
        }
    }

    rotateLeft() {
        this.angle -= ROTATE_SPEED;
    }

    rotateRight() {
        this.angle += ROTATE_SPEED;
    }

    canFire() {
        return Date.now() - this.lastFire >= FIRE_COOLDOWN;
    }

    fire() {
        if (!this.canFire()) return null;
        this.lastFire = Date.now();
        const bx = this.x + Math.cos(this.angle) * (TANK_SIZE / 2 + 8);
        const by = this.y + Math.sin(this.angle) * (TANK_SIZE / 2 + 8);
        return new Bullet(bx, by, this.angle, this.num);
    }

    toJSON() {
        return {
            x: this.x,
            y: this.y,
            angle: this.angle,
            num: this.num,
            health: this.health,
        };
    }
}

// ===== 子弹类 =====
class Bullet {
    constructor(x, y, angle, owner) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * BULLET_SPEED;
        this.vy = Math.sin(angle) * BULLET_SPEED;
        this.owner = owner;
        this.bounces = 0;
        this.alive = true;
    }

    update(walls, tanks) {
        if (!this.alive) return null;
        this.x += this.vx;
        this.y += this.vy;

        // 边界反弹
        if (this.x < BULLET_RADIUS || this.x > W - BULLET_RADIUS) {
            this.vx *= -1;
            this.x = Math.max(BULLET_RADIUS, Math.min(W - BULLET_RADIUS, this.x));
            this.bounces++;
        }
        if (this.y < BULLET_RADIUS || this.y > H - BULLET_RADIUS) {
            this.vy *= -1;
            this.y = Math.max(BULLET_RADIUS, Math.min(H - BULLET_RADIUS, this.y));
            this.bounces++;
        }
        if (this.bounces >= MAX_BOUNCES) {
            this.alive = false;
            return null;
        }

        // 墙壁反弹
        for (const w of walls) {
            const res = distPointToSegment(this.x, this.y, w.x1, w.y1, w.x2, w.y2);
            if (res.dist < BULLET_RADIUS + WALL_THICKNESS / 2) {
                const { nx, ny } = segmentNormal(w.x1, w.y1, w.x2, w.y2);
                const dot = this.vx * nx + this.vy * ny;
                this.vx -= 2 * dot * nx;
                this.vy -= 2 * dot * ny;
                const pushDist = BULLET_RADIUS + WALL_THICKNESS / 2 - res.dist + 1;
                this.x += nx * pushDist;
                this.y += ny * pushDist;
                this.bounces++;
                if (this.bounces >= MAX_BOUNCES) {
                    this.alive = false;
                    return null;
                }
                break;
            }
        }

        // 坦克碰撞
        for (const tank of tanks) {
            if (tank.num !== this.owner) {
                const d = Math.hypot(this.x - tank.x, this.y - tank.y);
                if (d < TANK_COLLISION_RADIUS + BULLET_RADIUS) {
                    tank.health--;
                    this.alive = false;
                    return tank;
                }
            }
        }
        return null;
    }

    toJSON() {
        return {
            x: this.x,
            y: this.y,
            owner: this.owner,
            alive: this.alive,
        };
    }
}

// ===== 游戏房间类 =====
class Game {
    constructor(player1, player2) {
        this.id = generateId();
        this.player1 = player1;
        this.player2 = player2;
        this.tank1 = null;
        this.tank2 = null;
        this.bullets = [];
        this.walls = [];
        this.mapIndex = 0;
        this.scores = [0, 0];
        this.currentRound = 1;
        this.state = 'playing'; // playing, roundEnd, matchEnd
        this.winner = null;
        this.lastUpdate = Date.now();

        // 设置玩家所属房间
        player1.roomId = this.id;
        player1.playerNum = 1;
        player2.roomId = this.id;
        player2.playerNum = 2;

        this.initGame();
    }

    getRandomTankPos() {
        const margin = 50;
        // 安全距离必须 >= 碰撞检测的实际判定距离
        // collidesWalls 判定: TANK_COLLISION_RADIUS + WALL_THICKNESS/2 + 2
        const minDistFromWall = TANK_COLLISION_RADIUS + WALL_THICKNESS / 2 + 4;
        let x, y, safe;
        let attempts = 0;
        do {
            safe = true;
            x = margin + Math.random() * (W - margin * 2);
            y = margin + Math.random() * (H - margin * 2);
            for (const w of this.walls) {
                const res = distPointToSegment(x, y, w.x1, w.y1, w.x2, w.y2);
                if (res.dist < minDistFromWall) {
                    safe = false;
                    break;
                }
            }
            attempts++;
        } while (!safe && attempts < 100);
        return { x, y };
    }

    // 确保坦克不在碰撞区域内，如果在则向中心微调
    ensureTankSafe(tank) {
        const maxAttempts = 50;
        for (let i = 0; i < maxAttempts; i++) {
            if (!tank.collidesWalls(tank.x, tank.y, this.walls)) return;
            // 向场地中心微调
            const cx = W / 2, cy = H / 2;
            const dx = cx - tank.x;
            const dy = cy - tank.y;
            const len = Math.hypot(dx, dy) || 1;
            tank.x += (dx / len) * 3;
            tank.y += (dy / len) * 3;
        }
    }

    initGame() {
        this.mapIndex = Math.floor(Math.random() * maps.length);
        const map = maps[this.mapIndex];
        this.walls = map.walls;

        const minDist = W / 2;
        let pos1, pos2, dist;
        let attempts = 0;
        do {
            pos1 = this.getRandomTankPos();
            pos2 = this.getRandomTankPos();
            dist = Math.hypot(pos1.x - pos2.x, pos1.y - pos2.y);
            attempts++;
        } while (dist < minDist && attempts < 1000);

        const angle1 = Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x);
        const angle2 = Math.atan2(pos1.y - pos2.y, pos1.x - pos2.x);

        this.tank1 = new Tank(pos1.x, pos1.y, angle1, 1);
        this.tank2 = new Tank(pos2.x, pos2.y, angle2, 2);

        // 安全验证：确保坦克生成位置不会触发碰撞检测（双重保险）
        this.ensureTankSafe(this.tank1);
        this.ensureTankSafe(this.tank2);

        this.bullets = [];
        this.state = 'playing';
        this.winner = null;

        // 通知玩家游戏开始
        this.broadcast('gameStart', {
            mapIndex: this.mapIndex,
            mapName: map.name,
            yourPlayerNum: 1,
            scores: this.scores,
            round: this.currentRound,
        });

        this.player2.send('gameStart', {
            mapIndex: this.mapIndex,
            mapName: map.name,
            yourPlayerNum: 2,
            scores: this.scores,
            round: this.currentRound,
        });
    }

    broadcast(type, data) {
        this.player1.send(type, data);
        this.player2.send(type, data);
    }

    update() {
        if (this.state !== 'playing') return;

        const now = Date.now();
        const delta = now - this.lastUpdate;
        this.lastUpdate = now;

        // 处理玩家1输入
        const input1 = this.player1.input;
        if (input1.forward) this.tank1.forward(this.walls);
        if (input1.backward) this.tank1.backward(this.walls);
        if (input1.left) this.tank1.rotateLeft();
        if (input1.right) this.tank1.rotateRight();
        if (input1.fire) {
            const b = this.tank1.fire();
            if (b) this.bullets.push(b);
        }

        // 处理玩家2输入
        const input2 = this.player2.input;
        if (input2.forward) this.tank2.forward(this.walls);
        if (input2.backward) this.tank2.backward(this.walls);
        if (input2.left) this.tank2.rotateLeft();
        if (input2.right) this.tank2.rotateRight();
        if (input2.fire) {
            const b = this.tank2.fire();
            if (b) this.bullets.push(b);
        }

        // 更新子弹
        this.bullets = this.bullets.filter(b => b.alive);
        for (const bullet of this.bullets) {
            const hit = bullet.update(this.walls, [this.tank1, this.tank2]);
            if (hit) {
                if (this.tank1.health <= 0) {
                    this.scores[1]++;
                    this.winner = 2;
                } else if (this.tank2.health <= 0) {
                    this.scores[0]++;
                    this.winner = 1;
                }

                if (this.scores[0] >= ROUNDS_TO_WIN || this.scores[1] >= ROUNDS_TO_WIN) {
                    this.state = 'matchEnd';
                } else {
                    this.state = 'roundEnd';
                }

                this.broadcast('roundEnd', {
                    winner: this.winner,
                    scores: this.scores,
                    state: this.state,
                });
            }
        }

        // 广播游戏状态
        this.broadcast('state', {
            tank1: this.tank1.toJSON(),
            tank2: this.tank2.toJSON(),
            bullets: this.bullets.map(b => b.toJSON()),
            scores: this.scores,
            round: this.currentRound,
        });
    }

    nextRound() {
        if (this.state === 'matchEnd') {
            // 比赛结束，重新开始
            this.scores = [0, 0];
            this.currentRound = 1;
        } else {
            this.currentRound++;
        }
        this.initGame();
    }

    handlePlayerLeave(leavingPlayer) {
        const otherPlayer = leavingPlayer === this.player1 ? this.player2 : this.player1;
        otherPlayer.send('opponentLeft', {});
        otherPlayer.roomId = null;
        otherPlayer.playerNum = 0;
        serverState.games.delete(this.id);
    }
}

// ===== HTTP服务器（提供静态文件）=====
const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
    };

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(data);
    });
});

// ===== WebSocket服务器 =====
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    const player = new Player(ws);
    serverState.players.set(ws, player);

    console.log(`玩家连接: ${player.id}`);

    // 发送欢迎消息
    player.send('welcome', {
        id: player.id,
        name: player.name,
    });

    // 尝试匹配
    if (serverState.waitingPlayers.length > 0) {
        // 有等待的玩家，开始游戏
        const otherPlayer = serverState.waitingPlayers.shift();
        const game = new Game(otherPlayer, player);
        serverState.games.set(game.id, game);
        console.log(`游戏开始: ${game.id} (${otherPlayer.id} vs ${player.id})`);
    } else {
        // 加入等待队列
        serverState.waitingPlayers.push(player);
        player.send('waiting', { message: '等待对手加入...' });
        console.log(`玩家 ${player.id} 进入等待队列`);
    }

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            handleMessage(player, msg);
        } catch (e) {
            console.error('消息解析错误:', e);
        }
    });

    ws.on('close', () => {
        console.log(`玩家断开: ${player.id}`);
        handleDisconnect(player);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket错误: ${error}`);
    });
});

// ===== 消息处理 =====
function handleMessage(player, msg) {
    const { type, data } = msg;

    switch (type) {
        case 'input':
            // 更新玩家输入状态
            Object.assign(player.input, data);
            break;

        case 'ready':
            // 玩格键按下，开始下一局
            if (player.roomId) {
                const game = serverState.games.get(player.roomId);
                if (game && game.state !== 'playing') {
                    game.nextRound();
                }
            }
            break;

        case 'chat':
            // 聊天消息
            if (player.roomId) {
                const game = serverState.games.get(player.roomId);
                if (game) {
                    const otherPlayer = player === game.player1 ? game.player2 : game.player1;
                    otherPlayer.send('chat', { from: player.name, message: data.message });
                }
            }
            break;

        default:
            console.log(`未知消息类型: ${type}`);
    }
}

// ===== 断开连接处理 =====
function handleDisconnect(player) {
    // 从等待队列移除
    const waitIndex = serverState.waitingPlayers.indexOf(player);
    if (waitIndex !== -1) {
        serverState.waitingPlayers.splice(waitIndex, 1);
    }

    // 处理进行中的游戏
    if (player.roomId) {
        const game = serverState.games.get(player.roomId);
        if (game) {
            game.handlePlayerLeave(player);
        }
    }

    serverState.players.delete(player);
}

// ===== 游戏循环 =====
setInterval(() => {
    for (const game of serverState.games.values()) {
        game.update();
    }
}, 1000 / TICK_RATE);

// ===== 启动服务器 =====
server.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`  坦克大战联机服务器已启动`);
    console.log(`  端口: ${PORT}`);
    console.log(`  访问: http://localhost:${PORT}`);
    console.log(`========================================`);
});
