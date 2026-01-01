export function render (data) {
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
