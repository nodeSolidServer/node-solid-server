'use strict'
var keyname = 'SolidServerRootRedirectLink';
function register() { 
    alert(2); window.location.href = "/register"; 
}
document.addEventListener('DOMContentLoaded', async function() {
    const authn = UI.authn
    const authSession = UI.authn.authSession

    if (!authn.currentUser()) await authn.checkUser();
    let user = authn.currentUser();

    // IF LOGGED IN: SET SolidServerRootRedirectLink. LOGOUT
    if( user ) {
        window.localStorage.setItem(keyname, user.uri);
        await authSession.logout();
    }
    else {
        let webId = window.localStorage.getItem(keyname);

        // IF NOT LOGGED IN AND COOKIE EXISTS: REMOVE COOKIE, HIDE WELCOME, SHOW LINK TO PROFILE
        if( webId ) {
        window.localStorage.removeItem(keyname);
        document.getElementById('loggedIn').style.display = "block";
        document.getElementById('loggedIn').innerHTML = `<p>Your WebID is : <a href="${webId}">${webId}</a>.</p> <p>Visit your profile to log into your Pod.</p>`;
        }

        // IF NOT LOGGED IN AND COOKIE DOES NOT EXIST  
        //     SHOW WELCOME, SHOW LOGIN BUTTON
        //     HIDE LOGIN BUTTON, ADD REGISTER BUTTON
        else {
        let loginArea = document.getElementById('loginStatusArea');
        let html = `<input type="button" onclick="window.location.href='/register'" value="Register to get a Pod" class="register-button">`
        let span = document.createElement("span")
        span.innerHTML = html
        loginArea.appendChild(span);
        loginArea.appendChild(UI.login.loginStatusBox(document, null, {}))
        const logInButton = loginArea.querySelectorAll('input')[1];
        logInButton.value = "Log in to see your WebID";
        const signUpButton = loginArea.querySelectorAll('input')[2];
        signUpButton.style.display = "none";
        }                    
    }
})