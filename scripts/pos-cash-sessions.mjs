// Scheduled Shopify POS cash-session management for Just4Games Mont-Royal.
// Requires a securely stored offline Admin API token with read_cash_tracking and write_cash_tracking.
const TZ = "America/Toronto";
const API_VERSION = "2026-10";
const schedule = { open: "09:45", closeEarly: "20:00", closeLate: "23:00" };
const required = ["SHOPIFY_SHOP_DOMAIN", "SHOPIFY_ADMIN_TOKEN", "POS_LOCATION_ID", "POS_DEVICE_IDS", "POS_STAFF_MEMBER_ID"];
const getTime = (date) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
}).formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
export function dueAction(date = new Date(), force = "") {
  if (force === "open" || force === "close") return force;
  const local = getTime(date);
  const minute = Number(local.hour) * 60 + Number(local.minute);
  const [closingHour, closingMinute] = (local.weekday === "Thu" || local.weekday === "Fri" ? schedule.closeLate : schedule.closeEarly).split(":").map(Number);
  const closeMinute = closingHour * 60 + closingMinute;
  if (minute >= 585 && minute < 630) return "open"; // 09:45–10:30 local; tolerate GitHub Actions delays
  if (minute >= closeMinute && minute < closeMinute + 45) return "close";
  return null;
}
function gid(type, value) {
  const raw = String(value).trim();
  return raw.startsWith("gid://") ? raw : "gid://shopify/" + type + "/" + raw;
}
function config() {
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error("Missing configuration: " + missing.join(", "));
  const domain = process.env.SHOPIFY_SHOP_DOMAIN.trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) throw new Error("SHOPIFY_SHOP_DOMAIN must be a myshopify.com domain");
  const deviceIds = process.env.POS_DEVICE_IDS.split(",").map(x => gid("PointOfSaleDevice", x)).filter(Boolean);
  if (!deviceIds.length || new Set(deviceIds).size !== deviceIds.length) throw new Error("POS_DEVICE_IDS must be unique and nonempty");
  return { domain, token: process.env.SHOPIFY_ADMIN_TOKEN, locationId: gid("Location", process.env.POS_LOCATION_ID),
    staffId: gid("StaffMember", process.env.POS_STAFF_MEMBER_ID), deviceIds };
}
function money(amount) { return { amount: Number(amount).toFixed(2), currencyCode: "CAD" }; }
async function graphql(c, query, variables) {
  const response = await fetch("https://" + c.domain + "/admin/api/" + API_VERSION + "/graphql.json", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": c.token },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error("Shopify HTTP " + response.status + ": " + (await response.text()).slice(0, 350));
  const payload = await response.json();
  if (payload.errors?.length) throw new Error("Shopify GraphQL: " + JSON.stringify(payload.errors));
  return payload.data;
}
const LIST = `query OpenRegisterSessions($query: String!, $after: String) {
  pointOfSaleDevicePaymentSessions(first: 100, after: $after, query: $query) {
    nodes { id status currency pointOfSaleDevice { id } location { id } }
    pageInfo { hasNextPage endCursor }
  }
}`;
const OPEN = `mutation OpenRegister($device: ID!, $staff: ID!, $balance: MoneyInput) {
  pointOfSaleDevicePaymentSessionOpen(pointOfSaleDeviceId: $device, staffMemberId: $staff,
    balance: $balance, note: "Scheduled daily opening: declared opening float CAD 0.00") {
    pointOfSaleDevicePaymentSession { id status }
    userErrors { field message }
  }
}`;
const CLOSE = `mutation CloseRegister($session: ID!, $staff: ID!, $balance: MoneyInput!, $note: String!) {
  pointOfSaleDevicePaymentSessionClose(pointOfSaleDevicePaymentSessionId: $session,
    staffMemberId: $staff, balance: $balance, note: $note) {
    pointOfSaleDevicePaymentSession { id status }
    userErrors { field message }
  }
}`;
async function openSessions(c) {
  const found = []; let after = null;
  // Filter by location AND open status; still verify returned IDs and device allowlist locally.
  do {
    const out = (await graphql(c, LIST, { query: "location_id:" + c.locationId.split("/").pop() + " AND is_open:true", after }))
      .pointOfSaleDevicePaymentSessions;
    found.push(...out.nodes.filter(n => n.status === "OPEN" && n.location?.id === c.locationId && c.deviceIds.includes(n.pointOfSaleDevice?.id)));
    after = out.pageInfo.hasNextPage ? out.pageInfo.endCursor : null;
  } while (after);
  return found;
}
function checkedResult(result, operation, device) {
  if (result.userErrors?.length) throw new Error(operation + " " + device + ": " + JSON.stringify(result.userErrors));
  if (!result.pointOfSaleDevicePaymentSession?.id) throw new Error(operation + " " + device + ": no session returned");
  console.log(operation + " " + device + ": " + result.pointOfSaleDevicePaymentSession.id);
}
export async function run({ now = new Date(), action = "", dryRun = false } = {}) {
  const due = dueAction(now, action);
  if (!due) { console.log("Outside schedule; no action"); return; }
  const c = config();
  const sessions = await openSessions(c);
  if (due === "open") {
    for (const device of c.deviceIds) {
      if (sessions.some(s => s.pointOfSaleDevice.id === device)) {
        console.log("Already open, not resetting active session: " + device); continue;
      }
      if (dryRun) { console.log("DRY RUN would open " + device + " with CAD 0"); continue; }
      const out = await graphql(c, OPEN, { device, staff: c.staffId, balance: money(0) });
      checkedResult(out.pointOfSaleDevicePaymentSessionOpen, "Opened", device);
    }
  } else {
    // Closing requires a PHYSICALLY COUNTED balance per device, not the next day's zero float.
    // A dated nightly count is mandatory, preventing an unattended job from recording a false count.
    const today = getTime(now); const date = today.year + "-" + today.month + "-" + today.day;
    const counts = JSON.parse(process.env.POS_VERIFIED_CLOSING_COUNTS_JSON || "{}");
    const failures = [];
    for (const session of sessions) {
      const device = session.pointOfSaleDevice.id;
      const entry = counts[device] || counts[device.split("/").pop()];
      if (!entry || entry.date !== date || !Number.isFinite(Number(entry.amount)) || Number(entry.amount) < 0) {
        failures.push("Missing verified cash count for " + device + " on " + date);
        continue;
      }
      if (dryRun) { console.log("DRY RUN would close " + device + " with verified CAD " + entry.amount); continue; }
      try {
        const out = await graphql(c, CLOSE, { session: session.id, staff: c.staffId, balance: money(entry.amount),
          note: "Scheduled close. Physical count verified for " + date + ". Next session opens with CAD 0.00 float." });
        checkedResult(out.pointOfSaleDevicePaymentSessionClose, "Closed", device);
      } catch (error) { failures.push(error.message); }
    }
    if (failures.length) throw new Error(failures.join("\n"));
  }
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const args = process.argv.slice(2);
  run({ action: args.includes("--open") ? "open" : args.includes("--close") ? "close" : "",
    dryRun: args.includes("--dry-run") }).catch(error => { console.error(error); process.exitCode = 1; });
}
