'use strict'

/**
 * Returns a partial Email object (minus the `to` and `from` properties),
 * suitable for sending with Nodemailer.
 *
 * Used to send a Reset Password email, upon user request
 *
 * @param data {Object}
 *
 * @param data.magicLinkUrl {string}
 * @param data.webId {string}
 *
 * @return {Object}
 */
function render (data) {
  return {
    subject: 'Follow the white rabbit',

    /**
     * Text version
     */
    text: `${data.magicLinkUrl}`,

    /**
     * HTML version
     */
    html: `<p><a href="${data.magicLinkUrl}">${data.magicLinkUrl}</a></p>`
  }
}

module.exports.render = render
