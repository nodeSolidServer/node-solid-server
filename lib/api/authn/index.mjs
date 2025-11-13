export { default as oidc } from './webid-oidc.mjs'
export { default as tls } from './webid-tls.mjs'
export { default as forceUser } from './force-user.mjs'

export default {
  oidc: (await import('./webid-oidc.mjs')).default,
  tls: (await import('./webid-tls.mjs')).default,
  forceUser: (await import('./force-user.mjs')).default
}