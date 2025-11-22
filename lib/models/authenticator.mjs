import debugModule from './../debug.mjs';
import validUrl from 'valid-url';
import webid from '../webid/tls/index.mjs';
import provider from '@solid/oidc-auth-manager/src/preferred-provider.js';
import { domainMatches } from '@solid/oidc-auth-manager/src/oidc-manager.js';

const debug = debugModule.authentication;

export class Authenticator {
  constructor(options) {
    this.accountManager = options.accountManager;
  }
  static fromParams(req, options) {
    throw new Error('Must override method');
  }
  findValidUser() {
    throw new Error('Must override method');
  }
}

export class PasswordAuthenticator extends Authenticator {
  constructor(options) {
    super(options);
    this.userStore = options.userStore;
    this.username = options.username;
    this.password = options.password;
  }
  static fromParams(req, options) {
    const body = req.body || {};
    options.username = body.username;
    options.password = body.password;
    return new PasswordAuthenticator(options);
  }
  validate() {
    let error;
    if (!this.username) {
      error = new Error('Username required');
      error.statusCode = 400;
      throw error;
    }
    if (!this.password) {
      error = new Error('Password required');
      error.statusCode = 400;
      throw error;
    }
  }
  findValidUser() {
    let error;
    let userOptions;
    return Promise.resolve()
      .then(() => this.validate())
      .then(() => {
        if (validUrl.isUri(this.username)) {
          userOptions = { webId: this.username };
        } else {
          userOptions = { username: this.username };
        }
        const user = this.accountManager.userAccountFrom(userOptions);
        debug(`Attempting to login user: ${user.id}`);
        return this.userStore.findUser(user.id);
      })
      .then(foundUser => {
        if (!foundUser) {
          error = new Error('Invalid username/password combination.');
          error.statusCode = 400;
          throw error;
        }
        if (foundUser.link) {
          throw new Error('Linked users not currently supported, sorry (external WebID without TLS?)');
        }
        return this.userStore.matchPassword(foundUser, this.password);
      })
      .then(validUser => {
        if (!validUser) {
          error = new Error('Invalid username/password combination.');
          error.statusCode = 400;
          throw error;
        }
        debug('User found, password matches');
        return this.accountManager.userAccountFrom(validUser);
      });
  }
}

export class TlsAuthenticator extends Authenticator {
  constructor(options) {
    super(options);
    this.connection = options.connection;
  }
  static fromParams(req, options) {
    options.connection = req.connection;
    return new TlsAuthenticator(options);
  }
  findValidUser() {
    return this.renegotiateTls()
      .then(() => this.getCertificate())
      .then(cert => this.extractWebId(cert))
      .then(webId => this.loadUser(webId));
  }
  renegotiateTls() {
    const connection = this.connection;
    return new Promise((resolve, reject) => {
      connection.renegotiate({ requestCert: true, rejectUnauthorized: false }, (error) => {
        if (error) {
          debug('Error renegotiating TLS:', error);
          return reject(error);
        }
        resolve();
      });
    });
  }
  getCertificate() {
    const certificate = this.connection.getPeerCertificate();
    if (!certificate || !Object.keys(certificate).length) {
      debug('No client certificate detected');
      throw new Error('No client certificate detected. (You may need to restart your browser to retry.)');
    }
    return certificate;
  }
  extractWebId(certificate) {
    return new Promise((resolve, reject) => {
      this.verifyWebId(certificate, (error, webId) => {
        if (error) {
          debug('Error processing certificate:', error);
          return reject(error);
        }
        resolve(webId);
      });
    });
  }
  verifyWebId(certificate, callback) {
    debug('Verifying WebID URI');
    webid.verify(certificate, callback);
  }
  discoverProviderFor(webId) {
    return provider.discoverProviderFor(webId);
  }
  loadUser(webId) {
    const serverUri = this.accountManager.host.serverUri;
    if (domainMatches(serverUri, webId)) {
      return this.accountManager.userAccountFrom({ webId });
    } else {
      debug(`WebID URI ${JSON.stringify(webId)} is not a local account, using it as an external WebID`);
      return this.accountManager.userAccountFrom({ webId, username: webId, externalWebId: true });
    }
  }
}
