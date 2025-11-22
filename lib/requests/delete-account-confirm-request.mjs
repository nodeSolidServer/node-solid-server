import AuthRequest from './auth-request.mjs';
import debugModule from '../debug.mjs';
import fs from 'fs-extra';

const debug = debugModule.accounts;

export default class DeleteAccountConfirmRequest extends AuthRequest {
  constructor(options) {
    super(options);
    this.token = options.token;
    this.validToken = false;
  }
  static fromParams(req, res) {
    const locals = req.app.locals;
    const accountManager = locals.accountManager;
    const userStore = locals.oidc.users;
    const token = this.parseParameter(req, 'token');
    const options = { accountManager, userStore, token, response: res };
    return new DeleteAccountConfirmRequest(options);
  }
  static async get(req, res) {
    const request = DeleteAccountConfirmRequest.fromParams(req, res);
    try {
      await request.validateToken();
      return request.renderForm();
    } catch (error) {
      return request.error(error);
    }
  }
  static post(req, res) {
    const request = DeleteAccountConfirmRequest.fromParams(req, res);
    return DeleteAccountConfirmRequest.handlePost(request);
  }
  static async handlePost(request) {
    try {
      const tokenContents = await request.validateToken();
      await request.deleteAccount(tokenContents);
      return request.renderSuccess();
    } catch (error) {
      return request.error(error);
    }
  }
  async validateToken() {
    try {
      if (!this.token) {
        return false;
      }
      const validToken = await this.accountManager.validateDeleteToken(this.token);
      if (validToken) {
        this.validToken = true;
      }
      return validToken;
    } catch (error) {
      this.token = null;
      throw error;
    }
  }
  async deleteAccount(tokenContents) {
    const user = this.accountManager.userAccountFrom(tokenContents);
    const accountDir = this.accountManager.accountDirFor(user.username);
    debug('Preparing removal of account for user:', user);
    await this.userStore.deleteUser(user);
    await fs.remove(accountDir);
    debug('Removed user' + user.username);
  }
  renderForm(error) {
    const params = { validToken: this.validToken, token: this.token };
    if (error) {
      params.error = error.message;
      this.response.status(error.statusCode);
    }
    this.response.render('account/delete-confirm', params);
  }
  renderSuccess() {
    this.response.render('account/account-deleted');
  }
}
