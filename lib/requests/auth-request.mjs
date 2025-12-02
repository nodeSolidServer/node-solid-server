import url from 'url';
import debugModule from '../debug.mjs';
import { createRequire } from 'module';

// Avoid importing `@solid/oidc-op` at module-evaluation time to prevent
// import errors in environments where that package isn't resolvable.
// We'll try to require it lazily when needed.
const requireCjs = createRequire(import.meta.url);

const debug = debugModule.authentication;

const AUTH_QUERY_PARAMS = [
  'response_type', 'display', 'scope',
  'client_id', 'redirect_uri', 'state', 'nonce', 'request'
];

export default class AuthRequest {
  constructor(options) {
    this.response = options.response;
    this.session = options.session || {};
    this.userStore = options.userStore;
    this.accountManager = options.accountManager;
    this.returnToUrl = options.returnToUrl;
    this.authQueryParams = options.authQueryParams || {};
    this.localAuth = options.localAuth;
    this.enforceToc = options.enforceToc;
    this.tocUri = options.tocUri;
  }
  static parseParameter(req, parameter) {
    const query = req.query || {};
    const body = req.body || {};
    const params = req.params || {};
    return query[parameter] || body[parameter] || params[parameter] || null;
  }
  static requestOptions(req, res) {
    let userStore, accountManager, localAuth;
    if (req.app && req.app.locals) {
      const locals = req.app.locals;
      if (locals.oidc) {
        userStore = locals.oidc.users;
      }
      accountManager = locals.accountManager;
      localAuth = locals.localAuth;
    }
    const authQueryParams = AuthRequest.extractAuthParams(req);
    const returnToUrl = AuthRequest.parseParameter(req, 'returnToUrl');
    const acceptToc = AuthRequest.parseParameter(req, 'acceptToc') === 'true';
    const options = {
      response: res,
      session: req.session,
      userStore,
      accountManager,
      returnToUrl,
      authQueryParams,
      localAuth,
      acceptToc
    };
    return options;
  }
  static extractAuthParams(req) {
    let params;
    if (req.method === 'POST') {
      params = req.body;
    } else {
      params = req.query;
    }
    if (!params) { return {}; }
    const extracted = {};
    const paramKeys = AUTH_QUERY_PARAMS;
    let value;
    for (const p of paramKeys) {
      value = params[p];
      extracted[p] = value;
    }
    if (!extracted.redirect_uri && params.request) {
      try {
        const IDToken = requireCjs('@solid/oidc-op/src/IDToken.js');
        if (IDToken && IDToken.decode) {
          extracted.redirect_uri = IDToken.decode(params.request).payload.redirect_uri;
        }
      } catch (e) {
        // If the package isn't available, skip decoding the request token.
        // This preserves behavior for tests/environments without the dependency.
      }
    }
    return extracted;
  }
  error(error, body) {
    error.statusCode = error.statusCode || 400;
    this.renderForm(error, body);
  }
  initUserSession(userAccount) {
    const session = this.session;
    debug('Initializing user session with webId: ', userAccount.webId);
    session.userId = userAccount.webId;
    session.subject = { _id: userAccount.webId };
    return userAccount;
  }
  authorizeUrl() {
    const host = this.accountManager.host;
    const authUrl = host.authEndpoint;
    authUrl.query = this.authQueryParams;
    return url.format(authUrl);
  }
  registerUrl() {
    const host = this.accountManager.host;
    const signupUrl = url.parse(url.resolve(host.serverUri, '/register'));
    signupUrl.query = this.authQueryParams;
    return url.format(signupUrl);
  }
  loginUrl() {
    const host = this.accountManager.host;
    const signupUrl = url.parse(url.resolve(host.serverUri, '/login'));
    signupUrl.query = this.authQueryParams;
    return url.format(signupUrl);
  }
  sharingUrl() {
    const host = this.accountManager.host;
    const sharingUrl = url.parse(url.resolve(host.serverUri, '/sharing'));
    sharingUrl.query = this.authQueryParams;
    return url.format(sharingUrl);
  }
}
AuthRequest.AUTH_QUERY_PARAMS = AUTH_QUERY_PARAMS;
