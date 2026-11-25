/**
 * The OLD AinSutro link (Apps Script web app). Since 25 Nov AinSutro runs on Firebase Hosting
 * (eval/human_app/site), because this page ran as the visitor: Google showed every rater an
 * "unverified app" warning, and browsers signed into several Google accounts got a Drive error.
 * This project now only forwards people to the new page. It runs as the owner, needs no sign-in and
 * no permissions, so the old link shows no warning. UI_URL is in Secret.gs (not committed).
 */
function doGet() {
  const url = String(UI_URL);
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>AinSutro Scoring Page has moved</title></head>' +
    '<body style="margin:0;background:#f6f6f4;color:#1a1a19;font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif">' +
    '<div style="max-width:440px;margin:15vh auto;padding:32px;background:#fff;border:1px solid rgba(26,26,25,.09);border-radius:16px">' +
    '<div style="font-weight:600;font-size:17px">AinSutro Scoring Page</div>' +
    '<h1 style="font-size:22px;font-weight:500;margin:20px 0 8px">The AinSutro Scoring Page has a new address</h1>' +
    '<p style="color:#4d4d4a;margin:0 0 20px">Sign in with Google there. Please save the new link.</p>' +
    '<a href="' + url + '" target="_top" style="display:block;text-align:center;padding:12px 16px;background:#0f5b45;' +
    'color:#fff;border-radius:8px;text-decoration:none;font-weight:500">Open the AinSutro Scoring Page</a>' +
    '<p style="color:#6e6e6a;font-size:13px;margin:16px 0 0;word-break:break-all">' + url + '</p></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('AinSutro Scoring Page has moved')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
