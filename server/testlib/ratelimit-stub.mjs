export const limiters = [];
export default function rateLimit(options) {
  const mw = function limiter() {};
  mw.options = options;
  limiters.push(mw);
  return mw;
}
