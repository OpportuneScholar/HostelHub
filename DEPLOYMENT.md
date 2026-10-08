# HostelHub production deployment

Nothing here has been run in production. Verify each step yourself.

## 1. Architecture
```
Browser -> Vercel/Netlify (React static build)
        -> Render/Railway (Express API, /api/*)  -> MongoDB Atlas
```
Login cookie: httpOnly, Secure, SameSite=None, set by the API. Only the backend knows MONGODB_URI and JWT_SECRET.

**Cookie warning.** If the frontend and API are on different domains (vercel.app + onrender.com), the cookie is "third-party". Safari/iPhone and browsers that block third-party cookies will fail to stay logged in. Fix with ONE of:
- (Recommended) Proxy mode: the frontend host forwards `/api/*` to the backend, so the browser only talks to one domain. Set `VITE_API_URL=/api` and add the rewrite below.
- Custom domain: `app.yourcollege.edu` + `api.yourcollege.edu`.

Vercel proxy (`client/vercel.json`):
```json
{ "rewrites": [
  { "source": "/api/:path*", "destination": "https://YOUR-API.onrender.com/api/:path*" },
  { "source": "/(.*)", "destination": "/index.html" } ] }
```
Netlify proxy (`client/netlify.toml`, put BEFORE the `/*` rule):
```
[[redirects]]
  from = "/api/*"
  to = "https://YOUR-API.onrender.com/api/:splat"
  status = 200
```
Netlify proxies time out after about 26 seconds; a sleeping free Render service can take longer to wake. Use a paid always-on instance or an uptime pinger on `/api/health`.

## 2. Environment variables
Backend (Render/Railway):
| Name | Value |
|---|---|
| MONGODB_URI | Atlas connection string with database name `/hostelhub` |
| JWT_SECRET | 48+ random characters (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| CLIENT_URL | exact frontend URL, https, no trailing slash |
| NODE_ENV | production |
| TZ | Asia/Kolkata |
| TRUST_PROXY | 1 |
PORT is set by the host.

Frontend (Vercel/Netlify, build-time):
| Name | Value |
|---|---|
| VITE_API_URL | `https://YOUR-API.onrender.com/api` (direct) or `/api` (proxy mode) |
Changing it needs a redeploy.

## 3. Pre-deployment checklist
- [ ] Ran the local Termux tests in TESTING.md and fixed all failures
- [ ] `npm install` run in `server` and `client`, and both `package-lock.json` files committed (they are not in this zip)
- [ ] `cd client && npm run build` succeeds
- [ ] No `.env` committed (`.gitignore` excludes it); `git log -p | grep -i mongodb+srv` finds nothing
- [ ] Atlas DB user has readWrite on `hostelhub` only, strong password
- [ ] Decided proxy mode vs custom domain vs direct

## 4. Deployment order
1. **Atlas:** free cluster, DB user, Network Access `0.0.0.0/0` (Render IPs change), copy connection string.
2. **Create staff accounts** from your own machine, with MONGODB_URI in `server/.env`: `npm run create-warden -- "Name" email "Password"` and `npm run create-user -- GUARD "Name" email "Password"`.
3. **Backend on Render:** new Web Service from the Git repo, root dir `server`, build `npm install`, start `npm start`, health check path `/api/health`, set the backend variables (CLIENT_URL can be a placeholder for now). Open `https://YOUR-API.onrender.com/api/health`: expect `{"ok":true,"db":"connected",...}`.
4. **Frontend on Vercel:** root dir `client`, framework Vite, set VITE_API_URL, deploy. In proxy mode, edit `vercel.json` with the real API URL first.
5. **CORS/cookies:** set CLIENT_URL on the backend to the real frontend URL, redeploy the backend.
6. **Final testing:** repeat the TESTING.md flows on the live URLs, including a phone on mobile data and an iPhone/Safari if students use one.

## 5. After deployment
Check in order: login for all 3 roles, forced password change, leave -> pass -> guard OUT/IN, Gate Activity time, complaints, fees, notices, logout, a student calling an admin URL gets 403.
