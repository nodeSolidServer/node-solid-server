export function render (data) {
  return {
    subject: 'Account password reset',

    /**
     * Text version
     */
    text: `Hi,

We received a request to reset your password for your Solid account, ${data.webId}

To reset your password, click on the following link:

${data.resetUrl}

If you did not mean to reset your password, ignore this email, your password will not change.`,

    /**
     * HTML version
     */
    html: `<p>Hi,</p>

<p>We received a request to reset your password for your Solid account, ${data.webId}</p>

<p>To reset your password, click on the following link:</p>

<p><a href="${data.resetUrl}">${data.resetUrl}</a></p>

<p>If you did not mean to reset your password, ignore this email, your password will not change.</p>`
  }
}
