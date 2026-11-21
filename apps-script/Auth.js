// Verifies a Google Identity Services ID token and returns the signed-in email, or null.

function verifyIdToken(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var key = 'tok:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token)));
  var hit = cache.get(key);
  if (hit) return hit;

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  var info = JSON.parse(res.getContentText());
  var now = Math.floor(Date.now() / 1000);
  if (info.aud !== props().GOOGLE_CLIENT_ID) return null;
  if (String(info.email_verified) !== 'true') return null;
  if (!(Number(info.exp) > now)) return null;

  var email = String(info.email).toLowerCase();
  cache.put(key, email, Math.max(1, Math.min(300, Number(info.exp) - now)));
  return email;
}
