/* eslint-disable no-sparse-arrays */
import { initKeys, keys, KEY_A, KEY_D, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_S, KEY_UP, KEY_W, updateKeys } from './keys';
import { initMouse, mouse, updateMouse } from './mouse';
import { music } from './music';
import { zzfx, zzfxP } from './zzfx';

const WIDTH = 240;
const HEIGHT = 135;
const MILLIS_PER_SECOND = 1000;
const FRAMES_PER_SECOND = 30;
const MILLIS_PER_FRAME = MILLIS_PER_SECOND / FRAMES_PER_SECOND;
const ENTITY_TYPE_PLAYER = 0;
const ENTITY_TYPE_BULLET = 1;
const ENTITY_TYPE_SNAKE = 2;
const ENTITY_TYPE_SPIDER = 3;
const PLAYER_SPEED = 2;
const BULLET_SPEED = 4;
const SPIDER_SPEED = 1;

interface Entity {
  readonly entityType: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  health: number;
  cooldown: number;
  aggro?: boolean;
  shooter?: Entity;
}

const canvas = document.querySelector('#c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

const image = new Image();
image.src = 'i.png';

const entities: Entity[] = [];

const player = createEntity(ENTITY_TYPE_PLAYER, 16, 64);

for (let i = 0; i < 5; i++) {
  randomEnemy();
}

let score = 0;
let musicStarted = false;

initKeys(canvas);
initMouse(canvas);

function createEntity(entityType: number, x: number, y: number, dx = 0, dy = 0): Entity {
  const e = {
    entityType,
    x,
    y,
    dx,
    dy,
    health: 100,
    cooldown: 0,
  };
  entities.push(e);
  return e;
}

function randomEnemy(): void {
  const entityType = Math.random() < 0.5 ? ENTITY_TYPE_SNAKE : ENTITY_TYPE_SPIDER;
  const x = Math.floor(64 + Math.random() * (WIDTH - 64));
  const y = Math.floor(Math.random() * HEIGHT);
  createEntity(entityType, x, y);
}

function gameLoop(): void {
  if (Math.random() < 0.01) {
    randomEnemy();
  }
  updateKeys();
  updateMouse();
  handleInput();
  ai();
  collisionDetection();
  render();
}

function handleInput(): void {
  if (!musicStarted && mouse.buttons[0].down) {
    musicStarted = true;
    zzfxP(...music).loop = true;
  }
  if (keys[KEY_UP].down || keys[KEY_W].down) {
    player.y -= PLAYER_SPEED;
  }
  if (keys[KEY_LEFT].down || keys[KEY_A].down) {
    player.x -= PLAYER_SPEED;
  }
  if (keys[KEY_DOWN].down || keys[KEY_S].down) {
    player.y += PLAYER_SPEED;
  }
  if (keys[KEY_RIGHT].down || keys[KEY_D].down) {
    player.x += PLAYER_SPEED;
  }
  if (mouse.buttons[0].down) {
    const targetX = (mouse.x / canvas.offsetWidth) * WIDTH;
    const targetY = (mouse.y / canvas.offsetHeight) * HEIGHT;
    shoot(player, targetX, targetY, true);
  }
}

function shoot(shooter: Entity, targetX: number, targetY: number, sound = false): void {
  if (shooter.cooldown <= 0) {
    const dist = Math.hypot(targetX - shooter.x, targetY - shooter.y);
    const bullet = createEntity(
      ENTITY_TYPE_BULLET,
      shooter.x,
      shooter.y,
      ((targetX - shooter.x) / dist) * BULLET_SPEED,
      ((targetY - shooter.y) / dist) * BULLET_SPEED
    );
    bullet.shooter = shooter;
    shooter.cooldown = 10;
    if (sound) {
      zzfx(...[, , 90, , 0.01, 0.03, 4, , , , , , , 9, 50, 0.2, , 0.2, 0.01]);
    }
  }
}

function ai(): void {
  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    entity.x += entity.dx;
    entity.y += entity.dy;
    entity.cooldown--;

    if (entity.entityType === ENTITY_TYPE_SNAKE) {
      snakeAi(entity);
    }

    if (entity.entityType === ENTITY_TYPE_SPIDER) {
      spiderAi(entity);
    }

    // Clear out dead entities
    if (entity.health <= 0) {
      entities.splice(i, 1);
    }
  }
}

function snakeAi(snake: Entity): void {
  if (distance(snake, player) < 64) {
    shoot(snake, player.x, player.y);
  }
}

function spiderAi(spider: Entity): void {
  if (spider.aggro) {
    if (spider.x < player.x) {
      spider.x += SPIDER_SPEED;
    } else if (spider.x > player.x) {
      spider.x -= SPIDER_SPEED;
    }
    if (spider.y < player.y) {
      spider.y += SPIDER_SPEED;
    } else if (spider.y > player.y) {
      spider.y -= SPIDER_SPEED;
    }
  } else if (distance(spider, player) < 64) {
    spider.aggro = true;
  }
}

function collisionDetection(): void {
  for (const entity of entities) {
    for (const other of entities) {
      if (entity !== other && distance(entity, other) < 8) {
        if (
          entity.entityType === ENTITY_TYPE_BULLET &&
          other.entityType !== ENTITY_TYPE_BULLET &&
          other !== entity.shooter
        ) {
          entity.health = 0; // Kill the bullet
          other.health -= 20; // Damage the target
          if (other.health <= 0) {
            zzfx(...[1.01, , 368, 0.01, 0.1, 0.3, 4, 0.31, , , , , , 1.7, , 0.4, , 0.46, 0.1]);
            if (entity.shooter === player) {
              score += 100;
            }
          }
        }
      }
    }
  }
}

function render(): void {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (const entity of entities) {
    ctx.drawImage(image, entity.entityType * 8, 0, 8, 8, entity.x | 0, entity.y | 0, 8, 8);
  }

  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.fillText('Health: ' + player.health, 0.5, 8.5);
  ctx.fillText('Score: ' + score, 0.5, 20.5);
  ctx.fillText('Arrow keys or WASD to move', 0.5, 116.5);
  ctx.fillText('Left click to shoot', 0.5, 128.5);
}

const distance = (a: Entity, b: Entity): number => Math.hypot(a.x - b.x, a.y - b.y);

window.setInterval(gameLoop, MILLIS_PER_FRAME);

// Set an OS13k trophy
localStorage['OS13kTrophy,🤗,js13k-starter-2022'] = 'tada';
