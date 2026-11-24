/**
 * AinSutro: the answer-scoring page (eval/HUMAN_GUIDE.md).
 * Deployed as a web app that runs AS THE VISITOR ("Execute as: user accessing", anyone with a Google account),
 * so Google tells us who is signed in: their email (rater id) and account name (shown on the page).
 * The visitor gets no access to the Sheet: every data call goes to the store project (eval/human_app/store),
 * which runs as the Sheet owner and checks the shared secret. API_URL and API_SECRET are in Secret.gs
 * (not committed). Scopes: see the visitor's email and name, and call the store (appsscript.json).
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('AinSutro')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** The signed-in Google account: email from Apps Script, name from Google's userinfo (cached 6 h). */
function me() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Please sign in with a Google account.');
  const cache = CacheService.getUserCache();
  let name = cache.get('name');
  if (!name) {
    try {
      const r = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      name = (JSON.parse(r.getContentText()).name || '').trim();
    } catch (e) {
      name = '';
    }
    name = name || email.split('@')[0];
    cache.put('name', name, 21600);
  }
  return { email: email, name: name };
}

function api(action, data) {
  const res = UrlFetchApp.fetch(API_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify({ secret: API_SECRET, action: action, user: me(), data: data || {} }),
  });
  let j;
  try {
    j = JSON.parse(res.getContentText());
  } catch (e) {
    throw new Error('The scoring server did not answer (HTTP ' + res.getResponseCode() + '). Please try again.');
  }
  if (j.error) throw new Error(j.error);
  return j.result;
}

// ---- called from Index.html with google.script.run
function whoAmI() { return me(); }
function getNext(section) { return api('next', { section: section }); }
function submit(row, bundle, rating) { return api('submit', { row: row, bundle: bundle, rating: rating }); }
function skip(row, bundle, section) { return api('skip', { row: row, bundle: bundle, section: section }); }
function pageUrl() { return ScriptApp.getService().getUrl(); }
