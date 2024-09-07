class Level {
    constructor(plan) {
        let rows = plan
            .trim()
            .split('\n')
            .map((l) => [...l]);
        this.height = rows.length;
        this.width = rows[0].length;
        this.startActors = [];
        this.rows = rows.map((row, y) => {
            return row.map((ch, x) => {
                let type = levelChars[ch];
                if (typeof type != 'string') {
                    let pos = new Vec(x, y);
                    this.startActors.push(type.create(pos));
                    type = 'empty';
                }
                return type;
            });
        });
    }
}

Level.prototype.touches = function (pos, size, type) {
    let xStart = Math.floor(pos.x);
    let xEnd = Math.ceil(pos.x + size.x);
    let yStart = Math.floor(pos.y);
    let yEnd = Math.ceil(pos.y + size.y);
    for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
            let isOutside = x < 0 || x >= this.width || y < 0 || y >= this.height;
            let here = isOutside ? 'wall' : this.rows[y][x];
            if (here == type) return true;
        }
    }
    return false;
};

class State {
    constructor(level, actors, status) {
        this.level = level;
        this.actors = actors;
        this.status = status;
    }
    static start(level) {
        return new State(level, level.startActors, 'playing');
    }
    get player() {
        return this.actors.find((a) => a.type == 'player');
    }
    get shots() {
        return this.actors.filter((a) => a.type == 'shot');
    }
    get enemys() {
        return this.actors.filter((a) => a.type == 'enemy');
    }
}
State.prototype.update = function (time, keys) {
    let actors = this.actors.map((actor) => actor.update(time, this, keys));

    if (keys[' ']) {
        if (Date.now() - lastShotTime > 1000) {
            actors.push(Shot.create(this.player.pos.plus(new Vec(this.player.size.times(0.4).x, -0.5))));
            lastShotTime = Date.now();
        }
    }

    let newState = new State(this.level, actors, this.status);
    if (newState.status != 'playing') return newState;
    let player = newState.player;
    if (this.level.touches(player.pos, player.size, 'enemy')) {
        return new State(this.level, actors, 'lost');
    }
    let shots = newState.shots;
    for (let actor of actors) {
        if (actor.type != 'shot') {
            for (let shot of shots) {
                if (actor.type != 'shot' && overlap(actor, shot) && ((actor.type == 'player' && !shot.playerShot) || (actor.type == 'enemy' && shot.playerShot))) {
                    return actor.collide(newState, shot);
                }
            }
            if (actor.type != 'player' && actor.type != 'shot' && overlap(actor, player)) {
                return player.collide(newState, actor);
            }
            if (actor.type == 'enemy' && Math.random() < 0.01) {
                let shot = Shot.create(actor.pos.plus(new Vec(actor.size.times(0.4).x, 0.5)), new Vec(0, 0.04), false);
                actors.push(shot);
            }
        }
    }
    return newState;
};

class Vec {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    plus(other) {
        return new Vec(this.x + other.x, this.y + other.y);
    }
    times(factor) {
        return new Vec(this.x * factor, this.y * factor);
    }
}

class Player {
    constructor(pos, speed) {
        this.pos = pos;
        this.speed = speed;
    }
    get type() {
        return 'player';
    }
    static create(pos) {
        return new Player(pos.plus(new Vec(0, 0)), new Vec(0, 0));
    }
}
Player.prototype.size = new Vec(1, 1);
Player.prototype.update = function (time, state, keys) {
    let xSpeed = 0;
    if (keys.ArrowLeft) xSpeed -= playerXSpeed;
    if (keys.ArrowRight) xSpeed += playerXSpeed;
    let pos = this.pos;
    let movedX = pos.plus(new Vec(xSpeed * time, 0));
    if (!state.level.touches(movedX, this.size, 'wall')) {
        pos = movedX;
    }
    let ySpeed = 0;
    if (keys.ArrowUp) ySpeed -= playerYSpeed;
    if (keys.ArrowDown) ySpeed += playerYSpeed;
    let movedY = pos.plus(new Vec(0, ySpeed * time));
    if (!state.level.touches(movedY, this.size, 'wall')) {
        pos = movedY;
    }

    return new Player(pos, new Vec(xSpeed, ySpeed));
};
Player.prototype.collide = function (state, actor) {
    if (actor.type == 'enemy' || (actor.type == 'shot' && !actor.playerShot)) {
        return new State(state.level, state.actors, 'lost');
    }
};

class Shot {
    constructor(pos, speed, playerShot) {
        this.pos = pos;
        this.playerShot = playerShot;
        this.speed = speed;
    }
    get type() {
        return 'shot';
    }
    static create(pos, speed = new Vec(0, -0.04), playerShot = true) {
        return new Shot(pos, speed, playerShot);
    }
}
Shot.prototype.size = new Vec(0.2, 0.3);
Shot.prototype.update = function () {
    return new Shot(this.pos.plus(this.speed), this.speed, this.playerShot);
};

class Enemy {
    constructor(pos, speed) {
        this.pos = pos;
        this.speed = speed;
    }
    get type() {
        return 'enemy';
    }
    static create(pos) {
        return new Enemy(pos, new Vec(0, 0));
    }
}
Enemy.prototype.size = new Vec(1, 1);
Enemy.prototype.update = function () {
    return new Enemy(this.pos, this.speed);
};
Enemy.prototype.collide = function (state, shot) {
    if (shot.playerShot) {
        let filtered = state.actors.filter((a) => a != this && a != shot);
        let status = state.status;
        if (!filtered.some((a) => a.type == 'enemy')) status = 'won';
        return new State(state.level, filtered, status);
    }
    return new State(state, state.actors, state.status);
};

class CanvasDisplay {
    constructor(parent, level) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = level.width * scale;
        this.canvas.height = level.height * scale;
        parent.appendChild(this.canvas);
        this.cx = this.canvas.getContext('2d');
        this.viewport = {
            left: 0,
            top: 0,
            width: this.canvas.width / scale,
            height: this.canvas.height / scale,
        };
    }

    clear() {
        this.canvas.remove();
    }
}

CanvasDisplay.prototype.syncState = function (state) {
    this.updateViewport(state);
    this.clearDisplay(state.status);
    this.drawBackground(state.level);
    this.drawActors(state.actors);
};

CanvasDisplay.prototype.updateViewport = function (state) {
    let view = this.viewport,
        margin = view.width / 3;
    let player = state.player;
    let center = player.pos.plus(player.size.times(0.5));
    if (center.x < view.left + margin) {
        view.left = Math.max(center.x - margin, 0);
    } else if (center.x > view.left + view.width - margin) {
        view.left = Math.min(center.x + margin - view.width, state.level.width - view.width);
    }
    if (center.y < view.top + margin) {
        view.top = Math.max(center.y - margin, 0);
    } else if (center.y > view.top + view.height - margin) {
        view.top = Math.min(center.y + margin - view.height, state.level.height - view.height);
    }
};

CanvasDisplay.prototype.clearDisplay = function (status) {
    if (status == 'won') {
        this.cx.fillStyle = 'rgb(68, 191, 255)';
    } else if (status == 'lost') {
        this.cx.fillStyle = 'rgb(44, 136, 214)';
    } else {
        this.cx.fillStyle = 'rgb(52, 166, 251)';
    }
    this.cx.fillRect(0, 0, this.canvas.width, this.canvas.height);
};

CanvasDisplay.prototype.drawBackground = function (level) {
    return;
    let { left, top, width, height } = this.viewport;
    let xStart = Math.floor(left);
    let xEnd = Math.ceil(left + width);
    let yStart = Math.floor(top);
    let yEnd = Math.ceil(top + height);
    for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
            let tile = level.rows[y][x];
            if (tile == 'empty') continue;
            let screenX = (x - left) * scale;
            let screenY = (y - top) * scale;
            let tileX = tile == 'enemy' ? scale : 0;
            this.cx.drawImage(otherSprites, tileX, 0, scale, scale, screenX, screenY, scale, scale);
        }
    }
};

CanvasDisplay.prototype.drawPlayer = function (player, x, y, width, height) {
    /* width += playerXOverlap * 2;
    x -= playerXOverlap;
    if (player.speed.x != 0) {
        this.flipPlayer = player.speed.x < 0;
    }
    let tile = 8;
    if (player.speed.y != 0) {
        tile = 9;
    } else if (player.speed.x != 0) {
        tile = Math.floor(Date.now() / 60) % 8;
    }
    this.cx.save();
    if (this.flipPlayer) {
        flipHorizontally(this.cx, x + width / 2);
    }*/
    //let tileX = tile * width;
    this.cx.drawImage(playerSprites, x, y, width, height);
    //this.cx.restore();
};

CanvasDisplay.prototype.drawActors = async function (actors) {
    //await new Promise((resolve) => playerSprites.addEventListener('load', resolve));
    //await new Promise((resolve) => otherSprites.addEventListener('load', resolve));
    for (let actor of actors) {
        let width = actor.size.x * scale;
        let height = actor.size.y * scale;
        let x = (actor.pos.x - this.viewport.left) * scale;
        let y = (actor.pos.y - this.viewport.top) * scale;

        if (actor.type == 'player') {
            this.drawPlayer(actor, x, y, width, height);
        } else if (actor.type == 'shot') {
            if (actor.playerShot) this.cx.fillStyle = 'whiteSmoke';
            else this.cx.fillStyle = 'crimson';
            this.cx.fillRect(x, y, width, height);
        } else {
            this.cx.drawImage(otherSprites, x, y, width, height);
        }
    }
};

function overlap(actor1, actor2) {
    return actor1.pos.x + actor1.size.x > actor2.pos.x && actor1.pos.x < actor2.pos.x + actor2.size.x && actor1.pos.y + actor1.size.y > actor2.pos.y && actor1.pos.y < actor2.pos.y + actor2.size.y;
}

function trackKeys(keys) {
    let down = Object.create(null);
    function track(event) {
        if (keys.includes(event.key)) {
            down[event.key] = event.type == 'keydown';
            event.preventDefault();
        }
    }
    window.addEventListener('keydown', track);
    window.addEventListener('keyup', track);
    return down;
}

function runAnimation(frameFunc) {
    let lastTime = null;
    function frame(time) {
        if (lastTime != null) {
            let timeStep = Math.min(time - lastTime, 100) / 1000;
            if (frameFunc(timeStep) === false) return;
        }
        lastTime = time;
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

function runLevel(level, Display) {
    let display = new Display(document.body, level);
    let state = State.start(level);
    let ending = 1;
    return new Promise((resolve) => {
        runAnimation((time) => {
            state = state.update(time, arrowKeys);
            display.syncState(state);
            if (state.status == 'playing') {
                return true;
            } else if (ending > 0) {
                ending -= time;
                return true;
            } else {
                display.clear();
                resolve(state.status);
                return false;
            }
        });
    });
}

async function runGame(plans, Display) {
    for (let level = 0; level < plans.length; ) {
        let status = await runLevel(new Level(plans[level]), Display);
        if (status == 'won') level++;
    }
    alert("You've won!");
}

let playerSprites = document.createElement('img');
playerSprites.src = 'img/player2.png';
let otherSprites = document.createElement('img');
otherSprites.src = 'img/enemy.png';

const arrowKeys = trackKeys(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ']);
const playerXOverlap = 4;
const levelChars = {
    '.': 'empty',
    '@': Player,
    '=': Enemy,
};
const scale = 50;
const playerXSpeed = 7;
const playerYSpeed = 7;
const gravity = 30;
const jumpSpeed = 17;
let lastShotTime = 0;

let easyLevelPlan = `
....===......=====..
......==...=====...=
....................
....................
..........@.........`;
let hardlevelPlan = `
....===.==========..
..======...=====...=
....=====.==.=====..
..=.=====..=.=====..
..=======....=====..
....................
....................
..........@.........`;

levels = [hardlevelPlan];

runGame(levels, CanvasDisplay);
