// ESM version of auth-buttons.js
// global: location, alert, solid

((auth) => {
  // Wire up DOM elements
  const [
    loginButton,
    logoutButton,
    registerButton,
    accountSettings,
    loggedInContainer,
    profileLink
  ] = [
    'login',
    'logout',
    'register',
    'account-settings',
    'loggedIn',
    'profileLink'
  ].map(id => document.getElementById(id) || document.createElement('a'));
  loginButton.addEventListener('click', login);
  logoutButton.addEventListener('click', logout);
  registerButton.addEventListener('click', register);

  // Track authentication status and update UI
  auth.trackSession(session => {
    const loggedIn = !!session;
    const isOwner = loggedIn && new URL(session.webId).origin === location.origin;
    loginButton.classList.toggle('hidden', loggedIn);
    logoutButton.classList.toggle('hidden', !loggedIn);
    registerButton.classList.toggle('hidden', loggedIn);
    accountSettings.classList.toggle('hidden', !isOwner);
    loggedInContainer.classList.toggle('hidden', !loggedIn);
    if (session) {
      profileLink.href = session.webId;
      profileLink.innerText = session.webId;
    }
  });

  // Log the user in on the client and the server
  async function login () {
    alert(`login from this page is no more possible.\n\nYou must ask the pod owner to modify this page or remove it.`);
    // Deprecated code omitted
  }

  // Log the user out from the client and the server
  async function logout () {
    await auth.logout();
    location.reload();
  }

  // Redirect to the registration page
  function register () {
    const registration = new URL('/register', location);
    location.href = registration;
  }
})(solid);
