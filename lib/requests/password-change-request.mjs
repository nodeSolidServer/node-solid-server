import debugModule from '../debug.mjs';

const debug = debugModule.accounts;

export default class PasswordChangeRequest {
  constructor(options) {
    this.accountManager = options.accountManager;
    this.userAccount = options.userAccount;
    this.oldPassword = options.oldPassword;
    this.newPassword = options.newPassword;
    this.response = options.response;
  }
  static handle(req, res, accountManager) {
    let request;
    try {
      request = PasswordChangeRequest.fromParams(req, res, accountManager);
    } catch (error) {
      return Promise.reject(error);
    }
    return PasswordChangeRequest.changePassword(request);
  }
  static fromParams(req, res, accountManager) {
    const userAccount = accountManager.userAccountFrom(req.body);
    const oldPassword = req.body.oldPassword;
    const newPassword = req.body.newPassword;
    if (!oldPassword || !newPassword) {
      const error = new Error('Old and new passwords are required');
      error.status = 400;
      throw error;
    }
    if (req.session.userId !== userAccount.webId) {
      debug(`Cannot change password: signed in user is "${req.session.userId}"`);
      const error = new Error("You are not logged in, so you can't change the password");
      error.status = 401;
      throw error;
    }
    const options = { accountManager, userAccount, oldPassword, newPassword, response: res };
    return new PasswordChangeRequest(options);
  }
  static changePassword(request) {
    const { accountManager, userAccount, oldPassword, newPassword } = request;
    return accountManager.changePassword(userAccount, oldPassword, newPassword)
      .catch(err => {
        err.status = 400;
        err.message = 'Error changing password: ' + err.message;
        throw err;
      })
      .then(() => {
        request.sendResponse();
      });
  }
  sendResponse() {
    const { response } = this;
    response.status(200);
    response.send({ message: 'Password changed successfully' });
  }
}
