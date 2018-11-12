# CONTRIBUTING

The MIT Linked Data group and the `solid` project welcomes new contributors. This document will guide you
through the process.

### Step 1: FORK

Fork the project [on GitHub](https://github.com/solid/node-solid-server) and check out
your copy.

```sh
$ git clone git@github.com:your_username/node-solid-server.git
$ cd node-solid-server
$ git remote add upstream git://github.com/solid/node-solid-server.git
$ npm install
```


### Step 2: BRANCH

Create a feature branch and start hacking:

```sh
$ git checkout -b my-feature-branch -t origin/master
```


### Step 3: COMMIT

Make sure git knows your name and email address:

```sh
$ git config --global user.name "J. Random User"
$ git config --global user.email "j.random.user@example.com"
```

Writing good commit logs is important.  A commit log should describe what
changed and why.  Follow these guidelines when writing one:

1. The first line should be 50 characters or less and contain a short
   description of the change prefixed with the name of the changed
   subsystem (e.g. "net: add localAddress and localPort to Socket").
2. Keep the second line blank.
3. Wrap all other lines at 72 columns.

A good commit log looks like this:

```
subsystem: explaining the commit in one line

Body of commit message is a few lines of text, explaining things
in more detail, possibly giving some background about the issue
being fixed, etc etc.

The body of the commit message can be several paragraphs, and
please do proper word-wrap and keep columns shorter than about
72 characters or so. That way `git log` will show things
nicely even when it is indented.
```

The header line should be meaningful; it is what other people see when they
run `git shortlog` or `git log --oneline`.

Check the output of `git log --oneline files_that_you_changed` to find out
what subsystem (or subsystems) your changes touch.


### Step 4: REBASE

Use `git rebase` (not `git merge`) to sync your work from time to time.

```sh
$ git fetch upstream
$ git rebase upstream/master
```


### Step 5: TEST

Bug fixes and features should come with tests.  Add your tests in the
`test/` directory.  Look at other tests to see how they should be
structured (license boilerplate, common includes, etc.).

```sh
$ npm test
```

Makeall tests pass.  Please, do not submit patches that fail either check.


### Step 6: PUSH

```sh
$ git push origin my-feature-branch
```

Go to https://github.com/username/node-solid-server and select your feature branch.  Click
the 'Pull Request' button and fill out the form.

Pull requests are usually reviewed within a few days.  If there are comments
to address, apply your changes in a separate commit and push that to your
feature branch.  Post a comment in the pull request afterwards; GitHub does
not send out notifications when you add commits.

### Step 7: PUBLISH

If you have permission access, we reccomend using:

```bash
$ npm version patch && npm publish && git push --follow-tags
```

## Using HUB

[hub](https://hub.github.com/) is a tool released by Github to help developers to use their website from command line.

The described guidelines can be resumed as following:

```bash
$ git clone https://github.com/solid/node-solid-server
$ cd node-solid-server

# to fork the repository
$ hub fork

# to fork the repository
$ git checkout -b feature-branch

# after committing your changes, push to your repo
$ git push your_username feature-branch

# start a PR
$ hub pull-request
```

This document is forked from [joyent/node](https://github.com/joyent/node/blob/master/CONTRIBUTING.md)


[issue tracker]: https://github.com/solid/node-solid-server/issues
