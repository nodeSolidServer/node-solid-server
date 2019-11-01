'use strict'

/**
 * Returns a partial Email object (minus the `to` and `from` properties),
 * suitable for sending with Nodemailer.
 *
 * Used to send a Delete Account email, upon user request
 *
 * @param data {Object}
 *
 * @param data.deleteUrl {string}
 * @param data.webId {string}
 *
 * @return {Object}
 */
function render (data) {
  return {
    subject: 'Delete Solid-account request',

    /**
     * Text version
     */
    text: `Hi,

We received a request to delete your Solid account, ${data.webId}

To delete your account, click on the following link:

${data.deleteUrl}

If you did not mean to delete your account, ignore this email.`,

    /**
     * HTML version
     */
    html: `<p>Hi,</p>

<p>We received a request to delete your Solid account, ${data.webId}</p>

<p>To delete your account, click on the following link:</p>

<p><a href="${data.deleteUrl}">${data.deleteUrl}</a></p>

<p>If you did not mean to delete your account, ignore this email.</p>
`
  }
}

module.exports.render = render
