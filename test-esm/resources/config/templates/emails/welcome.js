'use strict'

/**
 * Returns a partial Email object (minus the `to` and `from` properties),
 * suitable for sending with Nodemailer.
 *
 * Used to send a Welcome email after a new user account has been created.
 *
 * @param data {Object}
 *
 * @param data.webid {string}
 *
 * @return {Object}
 */
function render (data) {
  return {
    subject: 'Welcome to Solid',

    /**
     * Text version of the Welcome email
     */
    text: `Welcome to Solid!

Your account has been created.

Your Web Id: ${data.webid}`,

    /**
     * HTML version of the Welcome email
     */
    html: `<p>Welcome to Solid!</p>

<p>Your account has been created.</p>

<p>Your Web Id: ${data.webid}</p>`
  }
}

module.exports.render = render
