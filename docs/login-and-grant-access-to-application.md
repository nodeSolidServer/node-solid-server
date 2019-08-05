# Granting access to an application as part of authentication

**TL:DR: This is a temporary option that will be removed once we have better ways of granting access to applications. We recommend you grant read and write access by default, but it depends on the application you want to trust.**

Applications provide very useful ways of consuming and producing data. Solid provides functionality that allows you to grant access to applications that you trust. This trust might be misplaced sometimes though, which Solid tries to mitigate to lessen the harm that malicious applications can cause.

One of the strategies available in Solid is to check the origins of applications, and in solid-server in Node version 5 (NSS5) we set the configuration for this to be true by default. This strengthens the security of instances running on this codebase, but it also makes it more difficult for users to test applications without explicitly granting them access beforehand.

To facilitate a better user experience, we introduced the option of granting access to applications as part of the authentication process. We believe this is a [better flow then forcing users to navigate to their profile and use the functionality provided in the trusted applications pane](https://github.com/solid/node-solid-server/issues/1142), and offer this as a temporary solution.

## Which modes should I grant the application?

That really depends on what the application needs to do. In general we suggest granting it Read and Write access. 

This is what the various modes allows the application to do:

- **Read:** Allows the application to read resources - this includes navigating through your pod and potentially copy all of your data
- **Write:** Allows the application to change and delete resources
- **Append:** Allows the application to only append new content to resources, not remove existing content
- **Control:** Allows the application to set which access modes agents have (including themself) - by allowing this you essentially allow the application complete control of your pod

The last mode is a very powerful mode to grant an application. An application could use this to remove all of your control access, essentially locking you out of your pod. (This would also mean that the application couldn't get access to your pod though, as it is still relying on your authentication.)

## Why is it temporary?

The way this solutions works "behind the scenes" is that you are granting the application access to all resources that you have access to and that is connected to your profile (in general this would be the pod that was created alongside your WebID). This is probably fine when you want to test an application that you or someone you trust are developing, but it's definitely not the granular access control we want to offer.

We do not have a solution ready yet, but [we are working on it](https://github.com/solid/webid-oidc-spec). When the solution is specified and implemented in NSS, we will remove the option in the login flow, as you would go through another process of granting applications access that would result in a more granular control.

## Learn more

The way that we handle access control in Solid is described in [the Web Access Control specification (WAC)]([http://solid.github.io/web-access-control-spec/](http://solid.github.io/web-access-control-spec/)). If you want to understand the reasoning for why we chose to turn origin checking on by default, you can read about it in the [Meeting W3 Solid Community Group had March 7th 2019 (last point on the agenda)](https://www.w3.org/community/solid/wiki/Meetings#20190307_1400CET).