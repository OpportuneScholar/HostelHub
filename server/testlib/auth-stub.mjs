export const audits = [];
export const auth = (roles = []) => {
  const mw = function authMw() {};
  mw.roles = roles;
  return mw;
};
export const audit = (...a) => { audits.push(a); };
