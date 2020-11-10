const fetch = require('node-fetch')

const SERVER_ROOT = process.env.SERVER_ROOT || 'https://server'
const LOGIN_URL = `${SERVER_ROOT}/login/password`
const USERNAME = process.env.USERNAME || 'alice'
const PASSWORD = process.env.PASSWORD || '123'

async function getCookie () {
  const result = await fetch(LOGIN_URL, {
    body: [
      `username=${USERNAME}`,
      `password=${PASSWORD}`
    ].join('&'),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    method: 'POST',
    redirect: 'manual'
  })
  return result.headers.get('set-cookie')
}

async function run () {
  const cookie = await getCookie()
  console.log(cookie)
}

// ...
run()
