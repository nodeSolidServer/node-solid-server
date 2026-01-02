export function render (data) {
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

<p>If you did not mean to delete your account, ignore this email.</p>`
  }
}
