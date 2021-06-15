const { URLSearchParams } = require('url')
const nodeFetch = require('node-fetch')
const cheerio = require('cheerio')
const { v4: uuidv4 } = require('uuid')
const { DateTime } = require('luxon')

const username = process.env.USERNAME
const password = process.env.PASSWORD
const citizen = process.env.CITIZEN
const interval = +process.env.INTERVAL
const webhook = process.env.WEBHOOK
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36'
}

/**
 * Logs in and returns a token
 */
async function login () {
  const fetch = require('fetch-cookie')(nodeFetch)

  // get login form
  const login = await fetch('https://ciam.impfzentren.bayern/auth/realms/C19V-Citizen/protocol/openid-connect/auth?' + new URLSearchParams({
    client_id: 'c19v-frontend',
    redirect_uri: 'https://impfzentren.bayern/citizen/',
    state: uuidv4(),
    response_mode: 'fragment',
    response_type: 'code',
    scope: 'openid',
    nonce: uuidv4(),
    ui_locales: 'de'
  }), {
    method: 'GET',
    headers
  })
  if (login.status !== 200) {
    throw new Error(`Failed to fetch login form (status ${login.status})`)
  }
  const loginAction = cheerio.load(await login.text())('#kc-form-login').attr('action')

  const auth = await fetch(loginAction, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      username,
      password,
      credentialId: ''
    }).toString(),
    redirect: 'manual' 
  })
  if (auth.status !== 302) {
    throw new Error(`Failed to log in (status ${auth.status})`)
  }
  const redirectUrl = auth.headers.get('Location')

  const code = new URLSearchParams(redirectUrl.substring(redirectUrl.lastIndexOf('#') + 1)).get('code')

  const token = await fetch('https://ciam.impfzentren.bayern/auth/realms/C19V-Citizen/protocol/openid-connect/token', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: 'c19v-frontend',
      redirect_uri: 'https://impfzentren.bayern/citizen/'
    }).toString()
  })
  return await token.json()
}

/**
 * Calls an IFTTT web hook
 */
async function notify (text) {
  await nodeFetch(webhook, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      value1: text
    })
  })
}

/**
 * Checks for available appointments
 */
async function check () {
  try {
    const { access_token } = await login()
    const params = new URLSearchParams({
      timeOfDay: 'ALL_DAY',
      lastDate: DateTime.now().toISODate(),
      lastTime: '00:00'
    })
    const before = Date.now()
    const resp = await nodeFetch(`https://impfzentren.bayern/api/v1/citizens/${citizen}/appointments/next?` + params.toString(), {
      headers: {
        ...headers,
        'Authorization': `Bearer ${access_token}`
      }
    })
    console.log(`Check took ${Date.now() - before} ms`)

    if (resp.status === 404) {
      console.log('Keine Impftermine verfügbar ... ')
    } else {
      console.log('Es wurde ein Impftermin reserviert!')
      await notify('Es wurde ein Impftermin reserviert!')
    }
  } catch (e) {
    console.error(e)
    await notify(`Es ist ein Fehler aufgetreten: ${e.message}`)
  }
}

setInterval(check, interval * 1000)
