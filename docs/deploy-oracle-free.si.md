# StockFlow නොමිලේ online දාන හැටි — Oracle Cloud Free + DuckDNS

මේ guide එකෙන් StockFlow එක **සදහටම නොමිලේ** cloud server එකක දාලා, `https://ඔබේ-නම.duckdns.org` වගේ
ලිපිනයකින් ඕනෑම තැනක ඉඳන් (phone, laptop, mobile app) පාවිච්චි කරන්න පුළුවන් වෙනවා. SaaS mode එක on නිසා
වෙනත් ව්‍යාපාරවලටත් sign up වෙලා trial එකෙන් පටන් ගන්න පුළුවන්.

**ඕනේ වෙන දේවල්:** ඊමේල් එකක්, online ගෙවීම් කරන්න පුළුවන් debit/credit card එකක් (Oracle verify කරන්න විතරයි —
සල්ලි අය කරන්නේ නැහැ), Windows/Mac computer එකක්. කාලය: පැය 1ක් විතර.

> Oracle වෙබ් අඩවියේ බොත්තම් නම් ටිකක් වෙනස් වෙන්න පුළුවන්. අදහස එකමයි — නොගැලපෙන තැනක් තිබුණොත් මට කියන්න.

---

## 1. Oracle Cloud ගිණුම හදන්න

1. https://www.oracle.com/cloud/free/ → **Start for free**.
2. රට: **Sri Lanka**. නම, ඊමේල් දාලා ඊමේල් එක verify කරන්න.
3. **Home Region** එක තෝරන්න — **පස්සේ වෙනස් කරන්න බැහැ**. ලංකාවට ළඟම: **Singapore** හෝ **India South (Hyderabad)** /
   **India West (Mumbai)**.
4. Card විස්තර දාන්න. පොඩි තාවකාලික අය කිරීමක් පෙන්නලා ආපසු හැරෙනවා. මේ account එක **Always Free** —
   ඔබ upgrade නොකළොත් කිසිම දෙයකට අය වෙන්නේ නැහැ.
5. ගිණුම සූදානම් වෙන්න විනාඩි කිහිපයක් යනවා.

## 2. Server එක (VM) හදන්න

1. Oracle console එකේ ☰ menu → **Compute → Instances → Create instance**.
2. **Name:** `stockflow`
3. **Image and shape → Edit**:
   - **Image:** Change image → **Canonical Ubuntu 24.04** (හෝ 22.04).
   - **Shape:** Change shape → **Ampere** → **VM.Standard.A1.Flex** → **OCPU 2**, **Memory 12 GB**.
     ("Always Free-eligible" ලේබලය පේන්න ඕනේ.)
4. **Networking:** "Create new virtual cloud network" සහ "public subnet" තියෙන්න දෙන්න. **Assign a public IPv4 address**
   on කරලා තියෙන්න ඕනේ.
5. **Add SSH keys:** **Generate a key pair for me** → **Save private key** (ඔබේ computer එකේ ආරක්ෂිතව තියාගන්න —
   මේක නැතිවුණොත් server එකට ලොග් වෙන්න බැහැ).
6. **Create** ඔබන්න. විනාඩි 1–2කින් **Running** වෙනවා. **Public IP address** එක copy කරගන්න (උදා: `152.67.xx.xx`).

**"Out of capacity" error එකක් ආවොත්:** වෙන _Availability Domain_ එකක් තෝරලා බලන්න, නැත්නම් පැය කිහිපයකට පස්සේ
නැවත උත්සාහ කරන්න, නැත්නම් OCPU 1 / 6 GB වලින් හදන්න.

## 3. Ports 80 සහ 443 open කරන්න (Oracle firewall)

1. Instance පිටුවේ **Primary VNIC → Subnet** link එක ඔබන්න → **Security Lists** → **Default Security List**.
2. **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0` · IP Protocol: **TCP** · Destination Port Range: `80` → **Add**
   - නැවත: Source `0.0.0.0/0` · **TCP** · Port `443` → **Add**

(Server එක ඇතුළේ තියෙන firewall එක install script එක ඉබේම open කරනවා.)

## 4. නොමිලේ නමක් ගන්න (DuckDNS)

1. https://www.duckdns.org → Google/GitHub ගිණුමකින් sign in.
2. **sub domain** එකට නමක් දාන්න (උදා: `galle-stock`) → **add domain**.
3. ඒ පේළියේ **current ip** එකට server එකේ Public IP එක දාලා **update ip**.
4. පිටුවේ උඩ තියෙන **token** එක copy කරගන්න.

ඔබේ ලිපිනය: `https://galle-stock.duckdns.org`

## 5. Server එකට ලොග් වෙන්න (SSH)

**Windows (PowerShell):**

```powershell
ssh -i "$HOME\Downloads\ssh-key-2026-10-12.key" ubuntu@152.67.xx.xx
```

"UNPROTECTED PRIVATE KEY FILE" error එකක් ආවොත් එක පාරක් මේක දෙන්න, ඊට පස්සේ නැවත ssh කරන්න:

```powershell
icacls "$HOME\Downloads\ssh-key-2026-10-12.key" /inheritance:r /grant:r "$($env:USERNAME):R"
```

**Mac / Linux:** `chmod 600 ~/Downloads/ssh-key-*.key && ssh -i ~/Downloads/ssh-key-*.key ubuntu@152.67.xx.xx`

("Are you sure you want to continue connecting?" ඇහුවොත් `yes`.)

## 6. StockFlow install කරන්න

Server එක ඇතුළේ මේ commands 3 copy-paste කරන්න:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone -b claude/youthful-gates-ew2t8r https://github.com/jambolk2255/claudedev.git
cd claudedev && sudo bash deploy/install.sh
```

Script එක අහන ප්‍රශ්න:

| ප්‍රශ්නය      | දාන්න ඕනේ                                                             |
| ------------- | --------------------------------------------------------------------- |
| Domain        | `galle-stock.duckdns.org`                                             |
| DuckDNS token | 4 වෙනි පියවරේ token එක (type කරද්දී පේන්නේ නැහැ — ඒක සාමාන්‍යයි)      |
| Your email    | ඔබේ ඊමේල් එක — මේකෙන් තමයි **platform admin** ලෙස ලොග් වෙන්නේ         |
| Bank details  | Bank transfer එකෙන් ගෙවන අයට පෙන්වන ඔබේ ගිණුම් විස්තර (නැත්නම් Enter) |

ඊට පස්සේ script එක ඉබේම Docker install කරලා, රහස් keys හදලා, app එක build කරලා HTTPS certificate එකත් ගන්නවා.
**පළමු build එකට විනාඩි 10–15ක් යනවා.** අවසානයේ `✓ StockFlow is up` පෙන්නුවොත් ඉවරයි.

## 7. පළමු වතාවට පාවිච්චි කරන්න

1. Browser එකේ `https://galle-stock.duckdns.org` open කරන්න.
2. **Start your free trial** → install එකේදී දුන්න **ඊමේල් එකෙන්ම** ඔබේ සමාගම register කරන්න.
3. Onboarding wizard එක ඉවර කරන්න.
4. `https://galle-stock.duckdns.org/admin` — **Platform admin** console එක (sidebar එකේත් පේනවා): සමාගම්, ගෙවීම්,
   plans, මිල ගණන්.

අනිත් ව්‍යාපාරවලට මේ link එකම දෙන්න — ඔවුන් sign up වුණාම දින 14ක trial එකක් ලැබෙනවා. Bank transfer එකකින්
ගෙව්වොත් **/admin → Payments** එකේ ✓ ඔබලා confirm කරන්න.

## 8. Mobile app එක

App එකේ login screen එකේ **Server address** එකට `https://galle-stock.duckdns.org` දාන්න. APK එක හදන හැටි
`README.md` එකේ "Phase 6" කොටසේ තියෙනවා (`npm run build:apk`).

## 9. PayHere පස්සේ එකතු කරන්න (අවශ්‍ය නම්)

PayHere merchant account එකක් ලැබුණාම:

```bash
cd ~/claudedev && sudo nano deploy/.env
```

`PAYHERE_MERCHANT_ID=` සහ `PAYHERE_MERCHANT_SECRET=` පුරවන්න. මුලින් `PAYHERE_SANDBOX=true` එක්ක test කරලා,
හරි නම් `false` කරන්න. Save (`Ctrl+O`, `Enter`, `Ctrl+X`) කරලා:

```bash
sudo bash deploy/update.sh
```

PayHere merchant settings වල domain එක ලෙස `galle-stock.duckdns.org` එකතු කරන්න.

## 10. දිනපතා වැඩ

| වැඩේ                     | Command (server එකේ, `cd ~/claudedev` කරලා)                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| අලුත් version එකට update | `sudo bash deploy/update.sh` (මුලින් backup එකක් ගන්නවා)                                           |
| Backup එකක් දැන්ම ගන්න   | `sudo bash deploy/backup.sh`                                                                       |
| Backup restore කරන්න     | `sudo bash deploy/restore.sh /opt/stockflow-backups/stockflow-YYYYMMDD-HHMMSS.sql.gz`              |
| තත්ත්වය බලන්න            | `sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env ps`                  |
| Logs බලන්න               | `sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env logs --tail 100 api` |

**Backups:** සෑම දිනකම 02:30 (UTC) ඉබේම `/opt/stockflow-backups` එකට, දින 14ක් තියාගන්නවා. ඒ server එකේමයි —
**සතියකට වරක් ඔබේ computer එකටත් copy කරගන්න** (PowerShell):

```powershell
ssh -i "$HOME\Downloads\ssh-key-2026-10-12.key" ubuntu@152.67.xx.xx "sudo install -m 600 -o ubuntu /opt/stockflow-backups/latest.sql.gz /home/ubuntu/latest.sql.gz"
scp -i "$HOME\Downloads\ssh-key-2026-10-12.key" ubuntu@152.67.xx.xx:latest.sql.gz "$HOME\Documents\stockflow-backup.sql.gz"
```

`deploy/.env` (හෝ `/opt/stockflow-backups/env.backup`) file එකත් ආරක්ෂිතව තියාගන්න — restore කරන්න ඒකේ keys ඕනේ.
**ඒක කාටවත් දෙන්න එපා.**

## 11. ප්‍රශ්න ආවොත්

- **Site එක open වෙන්නේ නැහැ / certificate error:** 3 වෙනි පියවරේ ports 80/443 open කළාද? DuckDNS එකේ IP එක server
  එකේ Public IP එකමද? ඊට පස්සේ `sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env restart caddy`.
- **Build එක මැදදී නැවතුණා:** `cd ~/claudedev && sudo bash deploy/install.sh` නැවත දෙන්න (දැනටමත් තියෙන settings
  පාවිච්චි කරනවා).
- **Invitation ඊමේල් යන්නේ නැහැ:** තවම ඊමේල් යවන්නේ නැහැ — Users පිටුවේ පෙන්වන invite link එක copy කරලා WhatsApp/ඊමේල්
  එකෙන් යවන්න.
- **Oracle server එක නැවතුණා / මැකුණා:** Always Free server එකක් දවස් 7ක් වගේ කාලයක් ගොඩක් අඩුවෙන් පාවිච්චි වුණොත්
  Oracle එය "idle" ලෙස නවත්වන්න පුළුවන්. ඒක වළක්වන්න Oracle ගිණුම **Pay As You Go** වලට upgrade කරන්න පුළුවන් — Always
  Free සීමා ඇතුළේ ඉන්නකම් තවමත් නොමිලේ (ආරක්ෂාවට **Budgets** එකේ LKR 0 alert එකක් දාන්න). ඒ නිසාත් backups ඔබේ
  computer එකට copy කරගන්න එක වැදගත්.

## 12. පස්සේ තමන්ගේ domain එකකට මාරු කරන්න

`stock.mycompany.lk` වගේ domain එකක් ගත්තාම: DNS එකේ **A record** එකක් server IP එකට දාලා, `deploy/.env` එකේ
`DOMAIN=` වෙනස් කරලා `sudo bash deploy/update.sh`. Certificate එක Caddy ඉබේම ගන්නවා. (Mobile app users ලාට අලුත්
server address එක දෙන්න.)
