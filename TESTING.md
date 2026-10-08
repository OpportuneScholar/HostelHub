# HostelHub local testing on Termux (Android)

Use `localhost` everywhere (never 127.0.0.1 or a LAN IP): the login cookie and CORS depend on it.

## 0. Install tools
```
pkg update && pkg upgrade
pkg install nodejs git nano curl unzip
termux-setup-storage
cp ~/storage/downloads/hostelhub.zip ~ && cd ~ && unzip hostelhub.zip && cd hostelhub
node -v    # needs 18 or newer
```

## 1. MongoDB
**Option A (recommended): MongoDB Atlas free cluster.**
1. Create a free M0 cluster at cloud.mongodb.com, make a database user (note the password; avoid special characters).
2. Network Access: add `0.0.0.0/0` (your phone's IP changes).
3. Connect > Drivers: copy the string and add the database name, e.g.
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/hostelhub?retryWrites=true&w=majority`

**Option B: local mongod.** I could not verify that a `mongodb` package exists for your Termux repos. Try `pkg install mongodb`; if it is unavailable, use Option A. If it installs:
```
mkdir -p ~/mongo-data && mongod --dbpath ~/mongo-data --bind_ip 127.0.0.1 --fork --logpath ~/mongod.log
```
then use `MONGODB_URI=mongodb://127.0.0.1:27017/hostelhub`.

## 2. Backend (Termux session 1)
```
cd ~/hostelhub/server
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # copy this output
nano .env
```
`.env` values:
```
MONGODB_URI=<your connection string>
JWT_SECRET=<the long random string>
CLIENT_URL=http://localhost:5173
PORT=5000
# only if you get "querySrv ECONNREFUSED":
DNS_SERVERS=8.8.8.8,1.1.1.1
```
Do NOT set NODE_ENV=production locally. Then:
```
npm install
npm run check-db                      # must print "MongoDB connected" and counts
npm run create-warden -- "Warden One" warden@college.edu "Warden@123"
npm run create-user -- GUARD "Guard One" guard@college.edu "Guard@1234"
export TZ=Asia/Kolkata                # so "today" matches your local day
npm run dev
```
In another session: `curl http://localhost:5000/api/health` should print `{"ok":true}`.

## 3. Frontend (Termux session 2: swipe in from the left > New session)
```
cd ~/hostelhub/client
cp .env.example .env                  # VITE_API_URL=http://localhost:5000/api
npm install
npm run build                         # must finish with "built in ..." and no errors
npm run dev
```
Open **http://localhost:5173** in Chrome.

Cookies are shared per browser. Use a normal tab for one role and an **incognito tab** for another (or log out between roles).

## 4. Test sequence
**Warden login:** Warden / Admin card > warden@college.edu / Warden@123.
**Create data:** Rooms & Beds > Hostel `Hostel A`, Block `B`, Floor 2, Room `B-205`, 2 beds > Add room. Hostels page should show two green beds.
**Register student:** Students > Register student. First name `Rahul`, room `B-205`, bed `1`, other fields anything. Expect "Student registered successfully".
**Student login:** log out > Student card > roll number > password `Rahul205`. You must land on Change password. Set a new password (8+ chars). Dashboard loads. Log out and try `Rahul205` again: must fail.
**Guard login:** (incognito) Guard card > guard@college.edu / Guard@1234. Using the guard login on the Student card must fail (portal check).

**Leave:** Student > Leave > Outing, destination anything, departure = 10 minutes ago, return = 2 hours ahead > Submit. Status Pending. Warden > Leave Requests > Pending > Approve. Student's list shows Approved.
**Gate pass:** Student > Gate Pass: QR and "Pass ID" text appear. Long-press the Pass ID and copy.
**Guard OUT:** Guard screen > paste Pass ID > Verify (shows name, roll, room, pass ID, validity) > OUT. Expect "Student marked OUT at HH:MM." Press OUT again: "Student already marked OUT".
**Guard IN:** press IN: "Student marked IN at HH:MM." Press IN again: "Student already marked IN".
**Negative gate tests:** random text: "Invalid pass". Leave with a future departure, approved: "Pass is not valid yet". Return 2 minutes ahead, approve, wait, press OUT: "Pass expired".
**GateEntry timestamp:** Warden > Gate Activity (today) lists OUT and IN rows with times. Also `cd ~/hostelhub/server && npm run check-db` prints the latest entries with UTC timestamps.
**Complaints:** Student > Complaints > submit. Warden > Complaints > Update > status In progress + response. Student sees both.
**Fees:** Warden > Fees > roll number, type, amount, due date > Add. Student > Fees shows it pending. Warden > Mark paid with a reference. Student sees it under payment history.
**Notices:** Warden > Notices > create (expiry in the future, Important). Student > Notices shows it first. Edit it, then Delete (confirm dialog). A notice with a past expiry must not show for students.
**Beds:** Hostels > tap a green bed: orange. Register a student into that bed: "That bed is occupied or under maintenance". Register a second student into an occupied bed: same message. Duplicate roll number: "A record with this roll number already exists".
**Permissions:** logged in as student, open `http://localhost:5000/api/admin/dashboard` in a tab: expect "You do not have access to this". Logged out: "Please log in to continue".
**Logout:** Log out, refresh: you stay on the login screen; opening `/student` redirects to login.

Expected, not a bug: one 401 on `/auth/me` before login. Login is limited to 20 attempts per 15 minutes; restart the server to reset while testing.

## 5. If something fails, send me
1. What you did and what you expected, plus a screenshot of the error toast.
2. The last 40 lines of the backend terminal (Termux session 1).
3. For install/build problems: the full output of `npm install` or `npm run build`.
4. `node -v`, `npm -v`, and the output of `npm run check-db` (hide the password).
5. For a white screen: the URL, and the browser console text if your browser has developer tools.

Known Termux fallbacks: if `npm install` in `client` fails on esbuild, run `pkg install esbuild` then `export ESBUILD_BINARY_PATH=$(which esbuild)` and retry. If `querySrv` errors appear, set `DNS_SERVERS` as above.
