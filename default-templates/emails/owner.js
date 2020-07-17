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
    subject: 'Just set up your pod server',

    /**
     * Text version
     */
    text: `I just set up a pod server for you. To log in and configure it just click on the following link: ${data.magicLinkUrl}`,

    /**
     * HTML version
     */
    html: `<p>I just set up a pod server for you. To log in and configure it just click on the following link: <a href="${data.magicLinkUrl}">${data.magicLinkUrl}</a></p>`
  }
}

module.exports.render = render
