export function Router() {
  const stack = [];
  const r = { stack, use: (...h) => stack.push({ method: 'USE', handlers: h }) };
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) r[m] = (path, ...h) => stack.push({ method: m.toUpperCase(), path, handlers: h });
  return r;
}
export default { Router };
