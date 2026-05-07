module.exports.render = render

function render (data) {
  return {
    subject: `Invalid username for account ${data.accountUri}`,

    /**
     * Text version
     */
    text: `Hi,

We're sorry to inform you that the username for account ${data.accountUri} is not allowed after changes to username policy.

This account has been set to be deleted at ${data.dateOfRemoval}.

${data.supportEmail ? `Please contact ${data.supportEmail} if you want to move your account.` : ''}`,

    /**
     * HTML version
     */
    html: `<p>Hi,</p>

<p>We're sorry to inform you that the username for account ${data.accountUri} is not allowed after changes to username policy.</p>

<p>This account has been set to be deleted at ${data.dateOfRemoval}.</p>

${data.supportEmail ? `<p>Please contact ${data.supportEmail} if you want to move your account.</p>` : ''}
`
  }
}
