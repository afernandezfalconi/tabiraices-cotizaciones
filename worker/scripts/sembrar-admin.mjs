#!/usr/bin/env node
/**
 * Siembra el primer usuario ADMIN directamente en KV.
 *
 * ADMIN es el rol de control total (el proveedor del sistema). El DUENO —el
 * cliente— opera su negocio pero no puede crear cuentas de este nivel: para eso
 * le pide al ADMIN. Por eso la primera cuenta tiene que sembrarse por aquí.
 *
 * No hay endpoint HTTP de bootstrap porque sería una puerta trasera permanente,
 * y porque su guardia "¿ya hay usuarios?" no puede ser fiable: kv.list() es
 * eventualmente consistente y deja una ventana para crear ADMINS ilimitados.
 *
 * Aquí el hash se calcula en tu máquina y sólo el hash llega a Cloudflare.
 * La contraseña nunca viaja por HTTP ni queda en el código del Worker.
 *
 * Uso:
 *   node scripts/sembrar-admin.mjs <usuario> "<Nombre Completo>"
 *
 * Pide la contraseña de forma interactiva: no la pases como argumento, o
 * quedaría en el historial del shell.
 */

import { webcrypto as crypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import readline from 'node:readline';
import { Writable } from 'node:stream';

const KV_ID = '5d69a2ae9fc540a5a6b27d355a44bcaa'; // TABIRA_USUARIOS

const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const aleatorio = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)));

async function hashPassword(password, salt) {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' },
    clave,
    256
  );
  return hex(bits);
}

/**
 * Lee la contraseña sin mostrarla en pantalla.
 * Si stdin no es una terminal (tubería, CI), lee la línea tal cual: readline
 * con `terminal: true` se cuelga esperando un TTY que no existe.
 */
let lineasTubo = null; // una sola interfaz para stdin no interactivo

function siguienteLineaDelTubo() {
  if (!lineasTubo) {
    const rl = readline.createInterface({ input: process.stdin });
    const pendientes = [];
    const esperando = [];
    rl.on('line', (l) => (esperando.length ? esperando.shift()(l) : pendientes.push(l)));
    rl.on('close', () => esperando.forEach((r) => r('')));
    lineasTubo = () =>
      new Promise((res) => (pendientes.length ? res(pendientes.shift()) : esperando.push(res)));
  }
  return lineasTubo();
}

function preguntarPassword(prompt) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      siguienteLineaDelTubo().then(resolve);
      return;
    }
    const mudo = new Writable({
      write(chunk, enc, cb) {
        cb();
      },
    });
    const rl = readline.createInterface({ input: process.stdin, output: mudo, terminal: true });
    process.stdout.write(prompt);
    rl.question('', (r) => {
      rl.close();
      process.stdout.write('\n');
      resolve(r);
    });
  });
}

/**
 * Se invoca el entrypoint JS de wrangler con node, en vez de `npx`.
 *
 * ⚠️ Dos trampas que ya costaron un registro corrupto:
 *   1. Con `shell: true` los argumentos se concatenan SIN escapar: el shell se
 *      come las comillas del JSON y el registro queda como {id:abc,...}, que no
 *      es JSON válido. Todo login revienta con 500.
 *   2. Sin shell, Node 24 se niega a lanzar `npx.cmd` (EINVAL).
 * Llamar al .js directamente esquiva ambas.
 */
const WRANGLER = createRequire(import.meta.url).resolve('wrangler/bin/wrangler.js');

const wrangler = (args, capturar = false) =>
  execFileSync(process.execPath, [WRANGLER, ...args], {
    encoding: 'utf-8',
    stdio: capturar ? ['ignore', 'pipe', 'ignore'] : 'inherit',
  });

const kvPut = (clave, valor, metadata) => {
  const args = ['kv', 'key', 'put', clave, valor, `--namespace-id=${KV_ID}`];
  if (metadata) args.push('--metadata', JSON.stringify(metadata));
  wrangler(args);
};

const kvGet = (clave) => {
  try {
    return wrangler(['kv', 'key', 'get', clave, `--namespace-id=${KV_ID}`], true).trim() || null;
  } catch {
    return null;
  }
};

const [, , usuarioRaw, nombreRaw] = process.argv;

if (!usuarioRaw) {
  console.error('Uso: node scripts/sembrar-admin.mjs <usuario> "<Nombre Completo>"');
  process.exit(1);
}

const usuario = usuarioRaw.trim().toLowerCase();

if (kvGet(`idx:usuario:${usuario}`)) {
  console.error(`\n✗ El usuario "${usuario}" ya existe. No se sembró nada.`);
  process.exit(1);
}

const password = await preguntarPassword(`Contraseña para "${usuario}" (mínimo 8): `);
const confirmacion = await preguntarPassword('Confírmala: ');

if (password !== confirmacion) {
  console.error('\n✗ Las contraseñas no coinciden. No se sembró nada.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('\n✗ La contraseña debe tener al menos 8 caracteres. No se sembró nada.');
  process.exit(1);
}

const id = aleatorio(8);
const salt = aleatorio(8);
const registro = {
  id,
  usuario,
  nombre: (nombreRaw || usuario).trim().slice(0, 120),
  salt,
  hash: await hashPassword(password, salt),
  rol: 'ADMIN',
  activo: true,
  gen: 0,
  creado: new Date().toISOString(),
};

const metadata = {
  id,
  usuario,
  nombre: registro.nombre,
  rol: 'ADMIN',
  activo: true,
  creado: registro.creado,
};

kvPut(`user:${id}`, JSON.stringify(registro), metadata);
kvPut(`idx:usuario:${usuario}`, id);

console.log(`\n✓ ADMIN "${usuario}" sembrado.`);
console.log('  La contraseña no quedó guardada en ningún archivo ni en el historial.');
