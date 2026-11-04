import { seal, unseal } from "./family.js";
const encoder = new TextEncoder();
const bytes = (value) => new Uint8Array(value);
const join = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
export const encode = (value) =>
  btoa(String.fromCharCode(...bytes(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export const decode = (value) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (x) =>
    x.charCodeAt(0),
  );
export function validSubscription(subscription) {
  try {
    const url = new URL(subscription.endpoint),
      host = url.hostname;
    const allowed =
      host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host.endsWith(".push.services.mozilla.com") ||
      host === "web.push.apple.com" ||
      host.endsWith(".push.apple.com") ||
      host.endsWith(".notify.windows.com");
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      allowed &&
      subscription.endpoint.length < 2048 &&
      decode(subscription.keys.p256dh).length === 65 &&
      decode(subscription.keys.auth).length === 16
    );
  } catch {
    return false;
  }
}
export async function createPushKeys(secret, clientId, contact) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const privateKey = encode(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  return {
    publicKey: encode(await crypto.subtle.exportKey("raw", pair.publicKey)),
    privateKey: await seal(privateKey, secret, "push:" + clientId),
    contact: "mailto:" + contact,
  };
}
async function hkdf(ikm, salt, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  return bytes(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      key,
      length * 8,
    ),
  );
}
export async function encryptPush(subscription, payload) {
  const receiver = decode(subscription.keys.p256dh),
    auth = decode(subscription.keys.auth);
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const sender = bytes(await crypto.subtle.exportKey("raw", pair.publicKey));
  const publicKey = await crypto.subtle.importKey(
    "raw",
    receiver,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = bytes(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: publicKey },
      pair.privateKey,
      256,
    ),
  );
  const ikm = await hkdf(
    shared,
    auth,
    join(encoder.encode("WebPush: info\0"), receiver, sender),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    ikm,
    salt,
    encoder.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    ikm,
    salt,
    encoder.encode("Content-Encoding: nonce\0"),
    12,
  );
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt",
  ]);
  const plain = join(
    encoder.encode(JSON.stringify(payload)),
    new Uint8Array([2]),
  );
  if (plain.length > 3994) throw Error("Notification too large");
  const cipher = bytes(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain),
  );
  return join(salt, new Uint8Array([0, 0, 16, 0, 65]), sender, cipher);
}
export async function sendPush(
  subscription,
  config,
  secret,
  clientId,
  payload,
) {
  if (!validSubscription(subscription)) return { status: 400 };
  const privateKey = await unseal(
    config.privateKey,
    secret,
    "push:" + clientId,
  );
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    decode(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = encode(
    encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const claims = encode(
    encoder.encode(
      JSON.stringify({
        aud: new URL(subscription.endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: config.contact,
      }),
    ),
  );
  const input = header + "." + claims;
  const signature = encode(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      encoder.encode(input),
    ),
  );
  const body = await encryptPush(subscription, payload);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization:
        "vapid t=" + input + "." + signature + ", k=" + config.publicKey,
      TTL: "3600",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Urgency: "normal",
    },
    body,
  });
  return { status: response.status };
}
export async function deliverSchoolPush(
  s,
  clientId,
  secret,
  origin,
  slug,
  recipients,
) {
  const config = s.schoolLife?.push;
  if (!config) return;
  const subscriptions = (s.schoolLife?.subscriptions || [])
    .filter((x) => recipients.includes(x.userId))
    .slice(0, 300);
  for (let offset = 0; offset < subscriptions.length; offset += 8) {
    await Promise.allSettled(
      subscriptions
        .slice(offset, offset + 8)
        .map((subscription) =>
          sendPush(subscription, config, secret, clientId, {
            title: "Novidades da escola",
            body: "Você recebeu uma atualização no Portal da Família.",
            url: origin + "/family.html?slug=" + encodeURIComponent(slug),
            tag: "school-" + slug,
          }),
        ),
    );
  }
}
