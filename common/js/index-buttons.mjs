// ESM version of index-buttons.js
'use strict'
const keyname = 'SolidServerRootRedirectLink'
document.addEventListener('DOMContentLoaded', async function () {
  const authn = UI.authn
  const authSession = UI.authn.authSession

  if (!authn.currentUser()) await authn.checkUser()
  const user = authn.currentUser()

  // IF LOGGED IN: SET SolidServerRootRedirectLink. LOGOUT
  if (user) {
    window.localStorage.setItem(keyname, user.uri)
    await authSession.logout()
  } else {
    const webId = window.localStorage.getItem(keyname)
    // IF NOT LOGGED IN AND COOKIE EXISTS: REMOVE COOKIE, HIDE WELCOME, SHOW LINK TO PROFILE
    if (webId) {
      window.localStorage.removeItem(keyname)
      document.getElementById('loggedIn').style.display = 'block'
      document.getElementById('loggedIn').innerHTML = `<p>Your WebID is : <a href="${webId}">${webId}</a>.</p> <p>Visit your profile to log into your Pod.</p>`
      // IF NOT LOGGED IN AND COOKIE DOES NOT EXIST
      //     SHOW WELCOME, SHOW LOGIN BUTTON
      //     HIDE LOGIN BUTTON, ADD REGISTER BUTTON
    } else {
      const loginArea = document.getElementById('loginStatusArea')
      const html = `<input type="button" onclick="window.location.href='/register'" value="Register to get a Pod" class="register-button" style="padding: 1em; border-radius:0.2em; font-size: 100%;margin: 0.75em 0 0.75em 0.5em !important; padding: 0.5em !important;background-color: #efe;">`
      const span = document.createElement('span')
      span.innerHTML = html
      loginArea.appendChild(span)
      loginArea.appendChild(UI.login.loginStatusBox(document, null, {}))
      const logInButton = loginArea.querySelectorAll('input')[1]
      logInButton.value = 'Log in to see your WebID'
      const signUpButton = loginArea.querySelectorAll('input')[2]
      signUpButton.style.display = 'none'
    }
  }
})
