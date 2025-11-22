import debugModule from '../debug.mjs';
import AuthRequest from './auth-request.mjs';
import { PasswordAuthenticator, TlsAuthenticator } from '../models/authenticator.mjs';

const debug = debugModule.authentication;

export const PASSWORD_AUTH = 'password';
export const TLS_AUTH = 'tls';

export class LoginRequest extends AuthRequest {
  constructor(options) {
    super(options);
    this.authenticator = options.authenticator;
    this.authMethod = options.authMethod;
  }
  static fromParams(req, res, authMethod) {
    const options = AuthRequest.requestOptions(req, res);
    options.authMethod = authMethod;
    switch (authMethod) {
      case PASSWORD_AUTH:
        options.authenticator = PasswordAuthenticator.fromParams(req, options);
        break;
      case TLS_AUTH:
        options.authenticator = TlsAuthenticator.fromParams(req, options);
        break;
      default:
        options.authenticator = null;
        break;
    }
    return new LoginRequest(options);
  }
  static get(req, res) {
    const request = LoginRequest.fromParams(req, res);
    request.renderForm(null, req);
  }
  static loginPassword(req, res) {
    debug('Logging in via username + password');
    const request = LoginRequest.fromParams(req, res, PASSWORD_AUTH);
    return LoginRequest.login(request);
  }
  static loginTls(req, res) {
    debug('Logging in via WebID-TLS certificate');
    const request = LoginRequest.fromParams(req, res, TLS_AUTH);
    return LoginRequest.login(request);
  }
  static login(request) {
    return request.authenticator.findValidUser()
      .then(validUser => {
        request.initUserSession(validUser);
        request.redirectPostLogin(validUser);
      })
      .catch(error => request.error(error));
  }
  postLoginUrl(validUser) {
    if (/token|code/.test(this.authQueryParams.response_type)) {
      return this.sharingUrl();
    } else if (validUser) {
      return this.authQueryParams.redirect_uri || validUser.accountUri;
    }
  }
  redirectPostLogin(validUser) {
    const uri = this.postLoginUrl(validUser);
    debug('Login successful, redirecting to ', uri);
    this.response.redirect(uri);
  }
  renderForm(error, req) {
    const queryString = req && req.url && req.url.replace(/[^?]+\?/, '') || '';
    const params = Object.assign({}, this.authQueryParams, {
      registerUrl: this.registerUrl(),
      returnToUrl: this.returnToUrl,
      enablePassword: this.localAuth.password,
      enableTls: this.localAuth.tls,
      tlsUrl: `/login/tls?${encodeURIComponent(queryString)}`
    });
    if (error) {
      params.error = error.message;
      this.response.status(error.statusCode);
    }
    this.response.render('auth/login', params);
  }
}
