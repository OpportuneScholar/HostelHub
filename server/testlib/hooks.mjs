// Route tests run without MongoDB, Express or bcrypt: these imports are swapped for small in-memory stand-ins.
const stub = (f) => new URL(f, import.meta.url).href;
export async function resolve(spec, ctx, next) {
  const map = { express: 'express-stub.mjs', bcryptjs: 'bcrypt-stub.mjs', 'express-rate-limit': 'ratelimit-stub.mjs' };
  if (map[spec]) return { url: stub(map[spec]), shortCircuit: true };
  if (spec.endsWith('/models/index.js')) return { url: stub('models-stub.mjs'), shortCircuit: true };
  if (spec.endsWith('/middleware/auth.js')) return { url: stub('auth-stub.mjs'), shortCircuit: true };
  return next(spec, ctx);
}
