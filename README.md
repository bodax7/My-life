# MyLife — حياتي (نسخة أولى / v1)

تطبيق ويب تقدمي (PWA) عربي أولاً لإدارة المال والملاحظات والمهام والتقويم لزوجين.
**البيانات محفوظة على الجهاز فقط (IndexedDB)، ويعمل بدون إنترنت. لا توجد خوادم ولا تكلفة ولا مكتبات مثبتة.**

## دليل المستخدم (عربي)
1. شغّل الملفات من أي استضافة HTTPS ثابتة (GitHub Pages / Netlify / Cloudflare Pages) أو محليًا: `python3 -m http.server 8765` ثم افتح `http://localhost:8765`.
2. افتح الرابط في Chrome (أندرويد) ← قائمة ⋮ ← «تثبيت التطبيق». على iPhone: Safari ← مشاركة ← «إضافة إلى الشاشة الرئيسية».
3. عند أول فتح: اكتب الاسم، (اختياري) رمز PIN، واللغة. يمكنك الاسترجاع من نسخة احتياطية.
4. أضف الزوجة/الزوج من «المزيد ← الإعدادات ← أفراد الأسرة».
5. **النسخ الاحتياطي ضروري:** «المزيد ← النسخ الاحتياطي» ← تصدير `.mylife` بانتظام وخزّنه خارج الهاتف. مسح بيانات المتصفح أو فقدان الهاتف يعني فقدان البيانات بدونها.

## Technical notes
- Stack: vanilla JS, no build step. Files: `js/finance.js` (money logic), `js/life.js` (notes/tasks/calendar/search), `js/db.js` (IndexedDB, backup), `js/ui-*.js`, `sw.js` (offline cache).
- Money = integer minor units; base-currency amount fixed at entry time; transfers/debts excluded from income/expense; refunds netted; closed months locked.
- Tests: `node --test tests/finance.test.js tests/life.test.js` (28 pass). E2E (Playwright, python) scripts in `tests/e2e/` (adjust paths; they expect a server on :8765).
- Optional dependency: Tesseract.js loaded from CDN on demand for receipt OCR (needs internet; fallback = manual entry with the image attached).
- Bump `CACHE` in `sw.js` when you change files.

## Known limitations (honest)
- **No two-phone sync.** Each device has its own data. Real sharing between spouses' phones needs a server (Phase 2).
- Privacy between profiles is in-app access control on a shared device, **not encryption**; the PIN is a lock, not strong protection against a technical attacker with device access.
- OCR untested with real network here; iOS/Safari, real devices, accessibility audit and large-data performance not yet verified.
- Push notifications only while the app is open/background-alive (no server push).

## Phase 2 plan (needs your approval)
Supabase (Postgres + Auth + Storage + Realtime): tables mirroring the IndexedDB stores, Row-Level Security by `household_id` and account `visibility`/`owner_id`, idempotent sync using existing `opId`s, last-write-wins with audit log, encrypted storage for files, server cron for notifications. Hosting free tier is enough for two users.

## Milestone report
Done: accounts, transactions, transfers, refunds, multi-currency, budgets, recurring, goals, debts, monthly closing, reports, notes, voice, files, tasks, shopping, calendar, search, notifications, backup/restore/export, PIN, AR/EN, dark mode, PWA offline.
Remaining: Phase 2 sync/RLS, real-device QA, stronger encryption option.
